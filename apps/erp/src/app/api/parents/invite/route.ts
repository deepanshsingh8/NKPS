import { NextResponse } from "next/server";
import { verifyAdminWithUser } from "@nkps/shared/lib/verify-admin";
import { createAdminClient } from "@nkps/shared/lib/supabase/admin";
import { createPortalUser } from "@nkps/shared/lib/create-portal-user";
import { rateLimit } from "@nkps/shared/lib/rate-limit";
import { linkParentAccountToStudent } from "@/lib/identity/link";
import { z } from "zod";

// Admin-initiated "invite a guardian for THIS student" — the guaranteed-link
// path. Unlike self-registration (which can dead-end with an unlinked parent),
// this creates the parent portal account AND the student_parents link in one
// shot, so the parent can never land unlinked.
const inviteSchema = z.object({
  student_id: z.string().uuid(),
  full_name: z.string().trim().min(1),
  email: z.string().trim().email(),
  phone: z.string().trim().optional().or(z.literal("")),
  relationship: z.enum(["father", "mother", "guardian"]),
});

export async function POST(request: Request) {
  const auth = await verifyAdminWithUser();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { user } = auth;

  const limit = rateLimit({
    name: "parent-invite",
    key: user.id,
    max: 30,
    windowSeconds: 3600,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Too many invites this hour. Try again in ${Math.ceil(limit.resetSeconds / 60)} minute(s).` },
      { status: 429 }
    );
  }

  const parsed = inviteSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { student_id, full_name, email, phone, relationship } = parsed.data;

  const admin = createAdminClient();

  // Confirm the student exists before creating an account for nothing.
  const { data: student } = await admin
    .from("students")
    .select("id, full_name, admission_no")
    .eq("id", student_id)
    .maybeSingle();
  if (!student) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  // Create the parent portal account (sets role='parent' via createPortalUser).
  const created = await createPortalUser({
    email,
    fullName: full_name,
    role: "parent",
    phone: phone || null,
  });
  if (!created.success || !created.userId) {
    return NextResponse.json(
      { error: created.error || "Failed to create the parent account." },
      { status: 400 }
    );
  }

  // Guarantee the link: ensure the parents row, set parent_id, create junction.
  const linked = await linkParentAccountToStudent(admin, {
    profileId: created.userId,
    profile: { email, fullName: full_name, phone },
    studentId: student_id,
    relationship,
  });
  if (!linked.ok) {
    // The account exists (welcome email already sent); surface so the admin can
    // finish the link via the "Link record" tool rather than assume success.
    return NextResponse.json(
      {
        success: true,
        user_id: created.userId,
        link_warning: `Account created, but linking to ${student.full_name} failed: ${linked.error} Use the "Link record" tool.`,
      },
      { status: 200 }
    );
  }

  return NextResponse.json({
    success: true,
    user_id: created.userId,
    linked: { student_name: student.full_name, admission_no: student.admission_no, relationship },
  });
}
