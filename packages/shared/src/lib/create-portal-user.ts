import { createAdminClient } from "@nkps/shared/lib/supabase/admin";
import { generateSecurePassword } from "@nkps/shared/lib/password";
import { sendSetPasswordEmail } from "@nkps/shared/lib/auth-links";

interface CreatePortalUserParams {
  email: string;
  fullName: string;
  role: "teacher" | "student" | "parent" | "staff";
  phone?: string | null;
  teacherId?: string | null;
  studentId?: string | null;
  parentId?: string | null;
}

interface CreatePortalUserResult {
  success: boolean;
  userId?: string;
  error?: string;
  /**
   * Whether the set-password email went out. Only meaningful when `success`.
   * An account whose email failed exists but nobody can sign in to it until an
   * admin uses Reset password on Users (which mails a fresh link and shows a
   * temporary password), so callers must report this rather than say "sent".
   */
  emailDelivered?: boolean;
  /** Why the email was not sent — safe to show to an admin. */
  emailError?: string;
}

/** Shown to an admin when the account exists but its email did not go out. */
export const EMAIL_NOT_SENT_MESSAGE =
  "Account created, but the email couldn't be sent — use Reset password on Users to try again.";

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

  // Validate the role↔link requirement BEFORE creating the auth user, so a
  // caller that asks for a linked role without supplying the link fails cleanly
  // instead of leaving an orphaned auth user or (as the old code did) silently
  // downgrading the account to 'student'. The migration-068 trigger requires
  // teacher_id for role='teacher' and parent_id for role='parent'; 'student'
  // may be unlinked and 'staff'/'admin' carry no domain link.
  if (role === "teacher" && !teacherId) {
    return {
      success: false,
      error: "A linked teacher record is required to create a teacher login.",
    };
  }
  if (role === "parent" && !parentId) {
    return {
      success: false,
      error: "A linked parent record is required to create a parent login.",
    };
  }

  // A random password nobody is ever told: the account is entered through
  // the one-time set-password link emailed below, never with this value.
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
    // enforce_profile_role_link trigger (migration 068). The required links
    // were already validated above, so we can trust `role` here and write only
    // the link column that role is allowed to hold — every other link stays
    // null. (Previously this derived role from whichever link id was supplied
    // and fell through to 'student' when none was, which is exactly how a
    // staff-create with no teacher link produced a bogus student account.)
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        role,
        phone: phone || null,
        must_change_password: true,
        teacher_id: role === "teacher" ? teacherId || null : null,
        student_id: role === "student" ? studentId || null : null,
        parent_id: role === "parent" ? parentId || null : null,
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

  // must_change_password stays true (set above). The link lands on
  // /portal/reset-password, which the proxy exempts from the forced-change
  // redirect and which clears the flag through complete-password-change once
  // a password is set. Should the person open the link and wander off without
  // setting one, the flag sends them to /portal/change-password — which needs
  // no current password — instead of into a portal they have no password for.
  const delivery = await sendSetPasswordEmail(supabase, {
    email,
    fullName,
    role,
    kind: "new-account",
  });

  return {
    success: true,
    userId: newUser.user?.id,
    emailDelivered: delivery.delivered,
    ...(delivery.delivered ? {} : { emailError: delivery.reason }),
  };
}
