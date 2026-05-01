import { NextResponse } from "next/server";
import { verifyAdminOrEditor } from "@nkps/shared/lib/verify-admin";

/**
 * Set or clear a student's pick for a given elective slot (5 or 6).
 *
 * POST { student_id, slot, subject_id }
 *   - Looks up class_subjects for (student's current class, subject_id),
 *     creating one if missing (no teacher assigned yet — admin can assign later).
 *   - Removes any existing student_subjects row for this student in this slot.
 *   - Inserts a new student_subjects row with elective_slot set.
 *
 * DELETE ?student_id=…&slot=…
 *   - Removes the student_subjects row for that slot.
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
    .select("id")
    .eq("slot", slot)
    .eq("subject_id", subjectId)
    .eq("is_active", true)
    .maybeSingle();
  if (!opt) {
    return NextResponse.json({ error: "Subject is not an option for this elective slot" }, { status: 400 });
  }

  // Resolve the student's CURRENT active enrollment → class_id
  const { data: enrollment } = await admin
    .from("student_enrollments")
    .select("class_id")
    .eq("student_id", studentId)
    .eq("status", "active")
    .order("enrollment_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!enrollment?.class_id) {
    return NextResponse.json({ error: "Student has no active enrollment" }, { status: 400 });
  }

  // Find or create class_subjects(class_id, subject_id)
  let { data: cs } = await admin
    .from("class_subjects")
    .select("id")
    .eq("class_id", enrollment.class_id)
    .eq("subject_id", subjectId)
    .maybeSingle();

  if (!cs) {
    const { data: created, error: createErr } = await admin
      .from("class_subjects")
      .insert({ class_id: enrollment.class_id, subject_id: subjectId })
      .select("id")
      .single();
    if (createErr || !created) {
      return NextResponse.json({ error: createErr?.message ?? "Failed to link subject to class" }, { status: 400 });
    }
    cs = created;
  }

  // Drop any prior pick in this slot for this student
  await admin
    .from("student_subjects")
    .delete()
    .eq("student_id", studentId)
    .eq("elective_slot", slot);

  // Insert the new pick. If the (student, class_subject) link already exists
  // (student was auto-enrolled in the subject), update it to set the slot.
  const { error: insertErr } = await admin
    .from("student_subjects")
    .upsert(
      {
        student_id: studentId,
        class_subject_id: cs.id,
        elective_slot: slot,
      },
      { onConflict: "student_id,class_subject_id" }
    );
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 400 });
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
    .from("student_subjects")
    .delete()
    .eq("student_id", studentId)
    .eq("elective_slot", slot);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
