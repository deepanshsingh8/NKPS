import { NextRequest, NextResponse } from "next/server";
import { verifyAdminOrEditor } from "@/lib/verify-admin";

// GET /api/erp/teacher-timetable?teacher_id=<uuid>
// Returns the teacher's weekly schedule joined with class + subject info,
// ordered by day_of_week then start_time. Time-ordered (not period_number-
// ordered) because classes run on staggered schedules — see
// scripts/_check-period-times.mjs for empirical confirmation.
export async function GET(request: NextRequest) {
  const admin = await verifyAdminOrEditor("teacher_substitutions");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const teacherId = request.nextUrl.searchParams.get("teacher_id");
  if (!teacherId) {
    return NextResponse.json(
      { error: "teacher_id is required" },
      { status: 400 }
    );
  }

  const { data: teacher, error: teacherErr } = await admin
    .from("teachers")
    .select("id, full_name, employee_id, is_active")
    .eq("id", teacherId)
    .single();
  if (teacherErr) {
    return NextResponse.json({ error: teacherErr.message }, { status: 404 });
  }

  const { data: periods, error: periodsErr } = await admin
    .from("timetable_periods")
    .select(
      "id, day_of_week, period_number, start_time, end_time, room, is_break, class_id, subject_id, classes(id, name, section), subjects(id, name, code)"
    )
    .eq("teacher_id", teacherId)
    .order("day_of_week", { ascending: true })
    .order("start_time", { ascending: true });
  if (periodsErr) {
    return NextResponse.json({ error: periodsErr.message }, { status: 500 });
  }

  return NextResponse.json({ data: { teacher, periods: periods ?? [] } });
}
