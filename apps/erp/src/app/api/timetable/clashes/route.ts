import { NextResponse } from "next/server";
import { verifyAdminOrEditor } from "@nkps/shared/lib/verify-admin";

/**
 * GET /api/timetable/clashes → every row of `timetable_teacher_clashes`.
 *
 * The view runs with its owner's rights and is keyed on a teacher, so it is
 * not granted to `authenticated` (migration 133): a parent's session could
 * otherwise read every teacher's double bookings. Admins and timetable
 * editors get it here, through the service role.
 */
export async function GET() {
  const admin = await verifyAdminOrEditor("timetable");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await admin
    .from("timetable_teacher_clashes")
    .select("*")
    .order("day_of_week")
    .order("a_start");
  if (error) {
    console.error("[timetable clashes]", error);
    return NextResponse.json({ error: "Failed to load clashes" }, { status: 500 });
  }
  return NextResponse.json({ clashes: data ?? [] });
}
