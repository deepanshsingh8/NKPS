import { NextResponse } from "next/server";
import { verifyAdminOrEditorWithUser } from "@/lib/verify-admin";
import {
  finalizeMarksheetSchema,
  unpublishMarksheetSchema,
} from "@/lib/validations";
import { buildMarksheetSnapshot } from "@/lib/marksheet-snapshot";

// POST /api/erp/results/finalize-marksheet
// Body: { class_id, exam_type_id, student_ids?: [] }
//   - no student_ids → finalize every active enrollment in the class
//   - with student_ids → finalize only those
// Iterates students, builds a snapshot, and inserts a new
// marksheet_publications row with version = max(prior) + 1. Any existing
// active row for the same (student, exam) is auto-unpublished with
// reason="re-finalized" before the new version inserts.
export async function POST(request: Request) {
  const auth = await verifyAdminOrEditorWithUser("publish_results");
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { admin, user } = auth;

  const body = await request.json();
  const parsed = finalizeMarksheetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { class_id, exam_type_id, student_ids } = parsed.data;

  // Resolve the student list. student_ids override is filtered against the
  // class's active enrollment so we never finalize for someone unrelated.
  const { data: enrollments, error: enrErr } = await admin
    .from("student_enrollments")
    .select("student_id")
    .eq("class_id", class_id)
    .eq("status", "active");
  if (enrErr) {
    return NextResponse.json({ error: enrErr.message }, { status: 500 });
  }
  const activeSet = new Set((enrollments ?? []).map((e) => e.student_id as string));
  const targetStudents =
    student_ids && student_ids.length > 0
      ? student_ids.filter((id) => activeSet.has(id))
      : Array.from(activeSet);

  if (targetStudents.length === 0) {
    return NextResponse.json(
      { error: "No active students in scope" },
      { status: 400 }
    );
  }

  let finalized = 0;
  let refinalized = 0;
  let skipped = 0;
  const errors: Array<{ student_id: string; error: string }> = [];

  for (const studentId of targetStudents) {
    try {
      const snapshot = await buildMarksheetSnapshot(admin, studentId, exam_type_id);
      if (!snapshot) {
        skipped++;
        continue;
      }

      // Look for the latest version (active or not) to compute version+1,
      // and the active one (if any) to auto-unpublish.
      const { data: prior } = await admin
        .from("marksheet_publications")
        .select("id, version, unpublished_at")
        .eq("student_id", studentId)
        .eq("exam_type_id", exam_type_id)
        .order("version", { ascending: false });

      const latestVersion = prior?.[0]?.version ?? 0;
      const activePrior = (prior ?? []).find((p) => !p.unpublished_at);
      if (activePrior) {
        const { error: unpubErr } = await admin
          .from("marksheet_publications")
          .update({
            unpublished_at: new Date().toISOString(),
            unpublish_reason: "re-finalized",
            unpublished_by: user.id,
          })
          .eq("id", activePrior.id);
        if (unpubErr) {
          errors.push({ student_id: studentId, error: unpubErr.message });
          continue;
        }
        refinalized++;
      }

      const { error: insErr } = await admin
        .from("marksheet_publications")
        .insert({
          student_id: studentId,
          class_id,
          exam_type_id,
          version: latestVersion + 1,
          snapshot,
          schema_version: snapshot.schema_version,
          published_by: user.id,
        });
      if (insErr) {
        errors.push({ student_id: studentId, error: insErr.message });
        continue;
      }
      finalized++;
    } catch (err) {
      errors.push({
        student_id: studentId,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  await admin.from("publish_events").insert({
    event_type: refinalized > 0 ? "re_finalize_marksheet" : "finalize_marksheet",
    class_id,
    exam_type_id,
    actor_id: user.id,
    note: `Finalized ${finalized} (${refinalized} re-finalized, ${skipped} skipped, ${errors.length} errors)`,
  });

  return NextResponse.json({
    success: true,
    finalized,
    refinalized,
    skipped,
    errors,
  });
}

// DELETE /api/erp/results/finalize-marksheet
// Body: { class_id, exam_type_id, unpublish_reason, student_ids?: [] }
// Unpublishes active marksheet rows for the scope. Reason required.
export async function DELETE(request: Request) {
  const auth = await verifyAdminOrEditorWithUser("publish_results");
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { admin, user } = auth;

  const body = await request.json();
  const parsed = unpublishMarksheetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { class_id, exam_type_id, unpublish_reason, student_ids } = parsed.data;

  let q = admin
    .from("marksheet_publications")
    .update({
      unpublished_at: new Date().toISOString(),
      unpublish_reason,
      unpublished_by: user.id,
    })
    .eq("class_id", class_id)
    .eq("exam_type_id", exam_type_id)
    .is("unpublished_at", null);
  if (student_ids && student_ids.length > 0) {
    q = q.in("student_id", student_ids);
  }
  const { data, error } = await q.select("id");
  if (error) {
    console.error("Unpublish marksheet error:", error);
    return NextResponse.json(
      { error: error.message ?? "Failed to unpublish" },
      { status: 500 }
    );
  }
  const affected = data?.length ?? 0;

  await admin.from("publish_events").insert({
    event_type: "unpublish_marksheet",
    class_id,
    exam_type_id,
    actor_id: user.id,
    note: `Unpublished ${affected} marksheets · reason: ${unpublish_reason}`,
  });

  return NextResponse.json({ success: true, affected });
}

// GET /api/erp/results/finalize-marksheet?class_id=&exam_type_id=
// Returns a per-student snapshot of finalize status for the admin UI.
export async function GET(request: Request) {
  const auth = await verifyAdminOrEditorWithUser("publish_results");
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const classId = url.searchParams.get("class_id");
  const examTypeId = url.searchParams.get("exam_type_id");
  if (!classId || !examTypeId) {
    return NextResponse.json(
      { error: "class_id and exam_type_id required" },
      { status: 400 }
    );
  }

  const { admin } = auth;

  // Enrolled students for the class.
  const { data: enrollments } = await admin
    .from("student_enrollments")
    .select("student_id, roll_number, students(full_name, admission_no)")
    .eq("class_id", classId)
    .eq("status", "active")
    .order("roll_number", { ascending: true });

  const rows = (enrollments ?? []).map((e) => {
    const s = e.students as unknown as {
      full_name: string;
      admission_no: string;
    };
    return {
      student_id: e.student_id as string,
      roll_number: (e.roll_number as number | null) ?? null,
      full_name: s?.full_name ?? "Unknown",
      admission_no: s?.admission_no ?? "",
    };
  });

  // All marksheet versions for this (class, exam) so UI can show
  // "v1 active" / "v1 unpublished (reason)" / "v2 active" etc.
  const studentIds = rows.map((r) => r.student_id);
  const { data: publications } = await admin
    .from("marksheet_publications")
    .select(
      "id, student_id, version, published_at, unpublished_at, unpublish_reason"
    )
    .eq("class_id", classId)
    .eq("exam_type_id", examTypeId)
    .in("student_id", studentIds.length > 0 ? studentIds : ["__none__"])
    .order("version", { ascending: false });

  const byStudent = new Map<
    string,
    Array<{
      id: string;
      version: number;
      published_at: string;
      unpublished_at: string | null;
      unpublish_reason: string | null;
    }>
  >();
  for (const p of publications ?? []) {
    const sid = p.student_id as string;
    if (!byStudent.has(sid)) byStudent.set(sid, []);
    byStudent.get(sid)!.push({
      id: p.id as string,
      version: p.version as number,
      published_at: p.published_at as string,
      unpublished_at: (p.unpublished_at as string | null) ?? null,
      unpublish_reason: (p.unpublish_reason as string | null) ?? null,
    });
  }

  return NextResponse.json({
    students: rows.map((r) => ({
      ...r,
      versions: byStudent.get(r.student_id) ?? [],
      active_version:
        (byStudent.get(r.student_id) ?? []).find((v) => !v.unpublished_at) ??
        null,
    })),
  });
}
