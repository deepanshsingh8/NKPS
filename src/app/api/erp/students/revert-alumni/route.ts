import { NextRequest, NextResponse } from "next/server";
import { verifyAdminOrEditorWithUser } from "@/lib/verify-admin";
import { z } from "zod";

const revertAlumniSchema = z.object({
  student_id: z.string().uuid("student_id must be a UUID"),
  reason: z
    .string()
    .min(5, "Reason is required (min 5 chars)")
    .max(500, "Reason too long"),
  // Optional re-enrollment hints. If omitted, only the alumni flags flip and
  // the admin still needs to enrol the student in a class via the regular
  // students editor before they appear on rosters again.
  reactivate_class_id: z.string().uuid().optional(),
  reactivate_academic_year_id: z.string().uuid().optional(),
});

// POST /api/erp/students/revert-alumni
// Admin-only: clears the alumni flags on a student so they can be re-enrolled.
// We don't expose this through the editor `students` permission because
// graduating a class then ungraduating individual rows is a high-blast-radius
// operation that should sit with the principal.
export async function POST(request: NextRequest) {
  const auth = await verifyAdminOrEditorWithUser();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { admin, user } = auth;

  // Restrict to admins. verifyAdminOrEditorWithUser() with no featureKey lets
  // both admins and any editor through, so re-confirm the role here.
  const { data: callerProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (callerProfile?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = revertAlumniSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { student_id, reason, reactivate_class_id, reactivate_academic_year_id } =
    parsed.data;

  const { data: student, error: studentErr } = await admin
    .from("students")
    .select("id, full_name, admission_no, is_alumni, alumni_passing_year")
    .eq("id", student_id)
    .single();
  if (studentErr || !student) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }
  if (!student.is_alumni) {
    return NextResponse.json(
      { error: "Student is not currently flagged as alumni" },
      { status: 400 }
    );
  }

  const { error: updateErr } = await admin
    .from("students")
    .update({
      is_active: true,
      is_alumni: false,
      alumni_passing_year: null,
      alumni_academic_year_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", student_id);
  if (updateErr) {
    console.error("[students.revert-alumni] update:", updateErr);
    return NextResponse.json({ error: "Failed to revert alumni" }, { status: 500 });
  }

  // Optional re-enrollment in a target class. We only insert when both ids are
  // provided AND no active enrollment exists for that class — this keeps the
  // operation idempotent if the admin retries.
  let reenrolled = false;
  if (reactivate_class_id && reactivate_academic_year_id) {
    const { data: existing } = await admin
      .from("student_enrollments")
      .select("id")
      .eq("student_id", student_id)
      .eq("class_id", reactivate_class_id)
      .maybeSingle();
    if (!existing) {
      const { error: enrollErr } = await admin
        .from("student_enrollments")
        .insert({
          student_id,
          class_id: reactivate_class_id,
          academic_year_id: reactivate_academic_year_id,
          status: "active",
        });
      if (enrollErr) {
        console.error("[students.revert-alumni] re-enroll:", enrollErr);
        return NextResponse.json(
          {
            error:
              "Alumni flag cleared, but failed to create new enrollment — enroll the student manually.",
          },
          { status: 500 }
        );
      }
      reenrolled = true;
    } else {
      // Existing enrollment found; ensure it's active so the student shows on rosters.
      await admin
        .from("student_enrollments")
        .update({ status: "active" })
        .eq("id", existing.id);
      reenrolled = true;
    }
  }

  // Audit trail. publish_events doubles as our central admin audit log
  // (migration 035 adds the `revert_alumni` event_type). The actor + reason
  // are the audit value here.
  await admin.from("publish_events").insert({
    event_type: "revert_alumni",
    student_id,
    actor_id: user.id,
    note: `Reverted alumni flag for ${student.full_name} (admission ${student.admission_no}, prev year ${student.alumni_passing_year ?? "—"}) · reason: ${reason}`,
  });

  return NextResponse.json({
    success: true,
    student_id,
    reenrolled,
  });
}
