import { createAdminClient } from "@nkps/shared/lib/supabase/admin";
import { generateSecurePassword } from "@nkps/shared/lib/password";

interface CreatePortalUserParams {
  email: string;
  fullName: string;
  role: "teacher" | "student" | "parent";
  phone?: string | null;
  teacherId?: string | null;
  studentId?: string | null;
  parentId?: string | null;
}

interface CreatePortalUserResult {
  success: boolean;
  userId?: string;
  error?: string;
}

export async function createPortalUser({
  email,
  fullName,
  role,
  phone,
  teacherId,
  studentId,
  parentId,
}: CreatePortalUserParams): Promise<CreatePortalUserResult> {
  const supabase = createAdminClient();

  const { data: existingUsers } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .limit(1);

  if (existingUsers && existingUsers.length > 0) {
    return { success: false, error: "User with this email already exists" };
  }

  const password = generateSecurePassword();

  const { data: newUser, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role },
  });

  if (error) {
    console.error(`Failed to create ${role} user for ${email}:`, error);
    return { success: false, error: error.message };
  }

  if (newUser.user) {
    // role + its matching link column go in ONE update to satisfy the
    // enforce_profile_role_link trigger (migration 068): role='teacher' needs
    // teacher_id, role='parent' needs parent_id; role='student' may have a null
    // student_id (the self-claim default). We therefore derive role from the
    // link id actually supplied rather than trusting the `role` argument:
    // callers like staff-create and parent-invite ask for role='teacher'/
    // 'parent' BEFORE the domain record is linked (staff has no teachers row
    // yet; parent-invite links right after). Trusting `role` there would set
    // role without its id, and the trigger would reject the ENTIRE update —
    // silently discarding must_change_password and phone with it (a security
    // regression: the user would never be forced to rotate the emailed
    // password). When no link id is present we keep the signup default
    // role='student', which is valid with null links; the explicit linking
    // step (or a later teacher link) promotes the role in its own update.
    const linkedRole = teacherId
      ? "teacher"
      : studentId
        ? "student"
        : parentId
          ? "parent"
          : "student";
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        role: linkedRole,
        phone: phone || null,
        must_change_password: true,
        teacher_id: teacherId || null,
        student_id: studentId || null,
        parent_id: parentId || null,
      })
      .eq("id", newUser.user.id);

    if (updateError) {
      // Don't leave a half-provisioned account or report false success. The
      // welcome email hasn't been sent yet, so roll the auth user back (a
      // retry then re-creates cleanly instead of hitting "already exists").
      console.error(`Failed to set role/link for ${email}:`, updateError);
      await supabase.auth.admin.deleteUser(newUser.user.id);
      return { success: false, error: "Failed to finalize the portal account." };
    }
  }

  try {
    const { sendEmail, buildWelcomeEmail } = await import("@nkps/shared/lib/email");
    const { getErpUrl } = await import("@nkps/shared/lib/cross-app");
    const loginUrl = getErpUrl("/portal/login");
    const html = buildWelcomeEmail({
      fullName,
      email,
      password,
      loginUrl,
      role,
    });
    await sendEmail(email, "Your NKPS Portal Account", html);
  } catch (emailError) {
    console.error(`Failed to send welcome email to ${email}:`, emailError);
  }

  return { success: true, userId: newUser.user?.id };
}
