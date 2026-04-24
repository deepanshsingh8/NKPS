import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/verify-admin";
import { resultMasterExamConfigsPutSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

// PUT /api/erp/result-masters/[id]/exam-configs
// Wholesale replace class_exam_configs for the master's class. The table has
// no master FK — scope is purely class_id. We resolve the class_id from the
// master, then delete-and-insert the full list (Zod already did shape checks).
export async function PUT(request: NextRequest, context: RouteContext) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;

  const { data: master } = await admin
    .from("result_masters")
    .select("id, class_id")
    .eq("id", id)
    .maybeSingle();
  if (!master) {
    return NextResponse.json({ error: "Result master not found" }, { status: 404 });
  }
  const classId = master.class_id as string;

  const body = await request.json();
  const parsed = resultMasterExamConfigsPutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { exam_configs } = parsed.data;

  // Dedupe by exam_type_id — the DB has UNIQUE(class_id, exam_type_id).
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const c of exam_configs) {
    if (seen.has(c.exam_type_id)) dupes.push(c.exam_type_id);
    seen.add(c.exam_type_id);
  }
  if (dupes.length > 0) {
    return NextResponse.json(
      {
        error: `Duplicate exam_type_id in payload: ${dupes.join(", ")}`,
        code: "DUPLICATE_EXAM_TYPE",
      },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const rows = exam_configs.map((c) => ({
    class_id: classId,
    exam_type_id: c.exam_type_id,
    is_applicable: c.is_applicable,
    weightage: c.weightage,
    max_marks_override: c.max_marks_override,
    sort_order: c.sort_order,
    updated_at: now,
  }));

  const { error: delErr } = await admin
    .from("class_exam_configs")
    .delete()
    .eq("class_id", classId);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  if (rows.length === 0) {
    return NextResponse.json({ data: [] });
  }

  const { data: inserted, error: insErr } = await admin
    .from("class_exam_configs")
    .insert(rows)
    .select(
      "id, class_id, exam_type_id, is_applicable, weightage, max_marks_override, sort_order, created_at, updated_at"
    )
    .order("sort_order", { ascending: true });
  if (insErr) {
    return NextResponse.json(
      {
        error: `Exam configs insert failed after delete; class now has no exam configs. ${insErr.message}`,
        code: "EXAM_CONFIGS_INSERT_FAILED",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: inserted ?? [] });
}
