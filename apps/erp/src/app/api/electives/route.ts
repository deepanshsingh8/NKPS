import { NextResponse } from "next/server";
import { verifyAdminOrEditor } from "@nkps/shared/lib/verify-admin";

/**
 * §5 Elective 5 / Elective 6 management.
 *
 * GET  /api/electives                 → returns slot options + class XI/XII students with current selections
 * POST /api/electives/options         → admin: add a (slot, subject_id) row
 *  DEL /api/electives/options?id=…    → admin: remove a slot option
 * POST /api/electives/students        → admin: set a student's elective slot (creates/updates student_subjects)
 *  DEL /api/electives/students?id=…   → admin: clear an elective slot for a student
 *
 * Editor capability: gated by the `students` feature key (slot-option edits
 * fall under `subjects` — checked individually).
 */

export async function GET() {
  const admin = await verifyAdminOrEditor("students");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // 1) Slot options with subject details
  const { data: optionsData } = await admin
    .from("elective_slot_options")
    .select("id, slot, subject_id, label, sort_order, is_active, applies_to_classes, subjects(id, name, code, nickname, category, is_elective, is_active)")
    .eq("is_active", true)
    .order("slot")
    .order("sort_order");

  // 2) Current academic year + XI/XII enrollments with stream
  const { data: yearRow } = await admin
    .from("academic_years")
    .select("id")
    .eq("is_current", true)
    .maybeSingle();

  const yearId = yearRow?.id ?? null;

  const { data: students } = await admin
    .from("student_enrollments")
    .select(`
      id,
      student_id,
      class_id,
      stream_id,
      classes!inner(id, name, section),
      streams(id, name),
      students!inner(id, admission_no, full_name)
    `)
    .eq("academic_year_id", yearId ?? "00000000-0000-0000-0000-000000000000")
    .eq("status", "active")
    .in("classes.name", ["XI", "XII"])
    .order("classes(name)")
    .order("classes(section)")
    .order("students(full_name)");

  // 3) Existing elective_slot picks per student
  const studentIds = (students ?? []).map((s) => (s as { student_id: string }).student_id);
  let picks: Array<{ student_id: string; elective_slot: number; class_subject_id: string; subject_id: string; subject_name: string }> = [];
  if (studentIds.length) {
    const { data: ssRows } = await admin
      .from("student_subjects")
      .select("student_id, elective_slot, class_subject_id, class_subjects!inner(subject_id, subjects(id, name))")
      .in("student_id", studentIds)
      .not("elective_slot", "is", null);
    picks = (ssRows ?? []).map((r) => {
      const row = r as unknown as {
        student_id: string;
        elective_slot: number;
        class_subject_id: string;
        class_subjects:
          | { subject_id: string; subjects: { id: string; name: string } | { id: string; name: string }[] | null }
          | { subject_id: string; subjects: { id: string; name: string } | { id: string; name: string }[] | null }[]
          | null;
      };
      const csRaw = Array.isArray(row.class_subjects) ? row.class_subjects[0] : row.class_subjects;
      const subjRaw: { id: string; name: string } | null = (() => {
        if (!csRaw) return null;
        const s = csRaw.subjects;
        if (!s) return null;
        return Array.isArray(s) ? s[0] ?? null : s;
      })();
      return {
        student_id: row.student_id,
        elective_slot: row.elective_slot,
        class_subject_id: row.class_subject_id,
        subject_id: csRaw?.subject_id ?? "",
        subject_name: subjRaw?.name ?? "Unknown",
      };
    });
  }

  return NextResponse.json({
    options: optionsData ?? [],
    students: students ?? [],
    picks,
  });
}
