import { NextRequest, NextResponse } from "next/server";
import { verifyAdminOrEditor } from "@/shared/lib/verify-admin";
import { promoteStaffToTeacher } from "@/erp/lib/staff-teacher-sync";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/staff/[id]/convert-to-teacher
// Promotes a staff_members row to also exist as a `teachers` record (linked
// via the staff_member_id FK). Idempotent: if a linked teacher already
// exists, returns its id without creating a duplicate.
//
// The new teacher record copies the personal fields from the staff member
// (name → full_name, email, phone, dob, address, qualifications, photo_url).
// Subsequent edits on either side stay in sync via the mirror helpers.
export async function POST(_request: NextRequest, context: RouteContext) {
  const admin = await verifyAdminOrEditor("staff");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;

  const result = await promoteStaffToTeacher(admin, id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({
    success: true,
    teacher_id: result.teacher_id,
    created: result.created,
  });
}
