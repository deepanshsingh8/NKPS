import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/verify-admin";
import { z } from "zod";

const subSubjectSchema = z.object({
  parent_subject_id: z.string().uuid(),
  name: z.string().min(1, "Name required"),
  grade_scale_id: z.string().uuid().nullable().optional(),
  sort_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parentId = request.nextUrl.searchParams.get("parent_subject_id");

  let query = admin
    .from("non_scholastic_sub_subjects")
    .select("id, parent_subject_id, name, grade_scale_id, sort_order, is_active, created_at")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (parentId) {
    query = query.eq("parent_subject_id", parentId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[non-scholastic.sub-subjects.GET] list:", error);
    return NextResponse.json({ error: "Failed to load sub-subjects" }, { status: 500 });
  }
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json();
  const parsed = subSubjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Guard: if grade_scale_id supplied, ensure it belongs to the non_scholastic scope.
  if (parsed.data.grade_scale_id) {
    const { data: scale } = await admin
      .from("grade_scales")
      .select("scope")
      .eq("id", parsed.data.grade_scale_id)
      .maybeSingle();
    if (!scale || scale.scope !== "non_scholastic") {
      return NextResponse.json(
        { error: "grade_scale_id must reference a non-scholastic scale" },
        { status: 400 }
      );
    }
  }

  const { data, error } = await admin
    .from("non_scholastic_sub_subjects")
    .insert({
      parent_subject_id: parsed.data.parent_subject_id,
      name: parsed.data.name.trim(),
      grade_scale_id: parsed.data.grade_scale_id ?? null,
      sort_order: parsed.data.sort_order ?? 0,
      is_active: parsed.data.is_active ?? true,
    })
    .select("id, parent_subject_id, name, grade_scale_id, sort_order, is_active")
    .single();
  if (error) {
    console.error("[non-scholastic.sub-subjects.POST] insert:", error);
    return NextResponse.json({ error: "Failed to create sub-subject" }, { status: 500 });
  }
  return NextResponse.json({ data });
}
