import { NextResponse } from "next/server";
import { verifyAdminOrEditor } from "@nkps/shared/lib/verify-admin";
import {
  describeElectiveClasses,
  optionAppliesTo,
} from "@nkps/shared/lib/electives";

/**
 * Set or clear a student's pick for a given elective slot (5 or 6).
 *
 * POST { student_id, slot, subject_id }
 *   - Validates that subject_id is a registered option for that slot AND that
 *     the option is offered to the student's own class — XI and XII keep
 *     separate lists, and filtering the dropdown is not enforcement.
 *   - Upserts into student_elective_picks (one row per student + slot).
 *
 * DELETE ?student_id=…&slot=…
 *   - Removes the pick for that slot.
 *
 * Note: this table is independent of class_subjects. The ERP's existing model
 * (subjects inferred from class_subjects) still applies for compulsory subjects.
 */

export async function POST(request: Request) {
  const admin = await verifyAdminOrEditor("students");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const studentId = String(body?.student_id ?? "");
  const slot = Number(body?.slot);
  const subjectId = String(body?.subject_id ?? "");

  if (!studentId || !subjectId) {
    return NextResponse.json({ error: "student_id and subject_id required" }, { status: 400 });
  }
  if (!Number.isInteger(slot) || slot < 1 || slot > 9) {
    return NextResponse.json({ error: "slot must be 1–9" }, { status: 400 });
  }

  // Verify the option is valid for the slot
  const { data: opt } = await admin
    .from("elective_slot_options")
    .select("id, applies_to_classes")
    .eq("slot", slot)
    .eq("subject_id", subjectId)
    .eq("is_active", true)
    .maybeSingle();
  if (!opt) {
    return NextResponse.json({ error: "Subject is not an option for this elective slot" }, { status: 400 });
  }

  // …and that it is offered to this student's class. The picker already
  // filters by class, but a stale page or a direct call would otherwise slip a
  // XII-only subject onto a XI student.
  const { data: enrolment } = await admin
    .from("student_enrollments")
    .select("id, classes!inner(name), academic_years!inner(is_current)")
    .eq("student_id", studentId)
    .eq("status", "active")
    .eq("academic_years.is_current", true)
    // limit(1): a student with two active rows would otherwise make
    // maybeSingle() throw rather than answer the question we asked.
    .limit(1)
    .maybeSingle();

  const embedded = (enrolment as unknown as {
    classes: { name: string } | { name: string }[] | null;
  } | null)?.classes;
  const className = Array.isArray(embedded)
    ? embedded[0]?.name ?? null
    : embedded?.name ?? null;

  if (!className) {
    return NextResponse.json(
      { error: "Student has no active enrolment in the current academic year" },
      { status: 400 }
    );
  }
  if (!optionAppliesTo(opt.applies_to_classes, className)) {
    return NextResponse.json(
      {
        error: `This option is offered to ${describeElectiveClasses(opt.applies_to_classes)}, so it cannot be assigned to a class ${className} student.`,
      },
      { status: 400 }
    );
  }

  const { error: upsertErr } = await admin
    .from("student_elective_picks")
    .upsert(
      { student_id: studentId, slot, subject_id: subjectId, updated_at: new Date().toISOString() },
      { onConflict: "student_id,slot" }
    );
  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const admin = await verifyAdminOrEditor("students");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const studentId = url.searchParams.get("student_id");
  const slot = Number(url.searchParams.get("slot"));
  if (!studentId || !Number.isInteger(slot)) {
    return NextResponse.json({ error: "student_id and slot required" }, { status: 400 });
  }
  const { error } = await admin
    .from("student_elective_picks")
    .delete()
    .eq("student_id", studentId)
    .eq("slot", slot);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
