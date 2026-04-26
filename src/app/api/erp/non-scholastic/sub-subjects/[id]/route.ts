import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/verify-admin";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  grade_scale_id: z.string().uuid().nullable().optional(),
  sort_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

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

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.name !== undefined) patch.name = parsed.data.name.trim();
  if (parsed.data.grade_scale_id !== undefined)
    patch.grade_scale_id = parsed.data.grade_scale_id;
  if (parsed.data.sort_order !== undefined) patch.sort_order = parsed.data.sort_order;
  if (parsed.data.is_active !== undefined) patch.is_active = parsed.data.is_active;

  const { data, error } = await admin
    .from("non_scholastic_sub_subjects")
    .update(patch)
    .eq("id", id)
    .select("id, parent_subject_id, name, grade_scale_id, sort_order, is_active")
    .single();
  if (error) {
    console.error("[non-scholastic.sub-subjects.PATCH] update:", error);
    return NextResponse.json({ error: "Failed to update sub-subject" }, { status: 500 });
  }
  return NextResponse.json({ data });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  const { error } = await admin
    .from("non_scholastic_sub_subjects")
    .delete()
    .eq("id", id);
  if (error) {
    console.error("[non-scholastic.sub-subjects.DELETE] delete:", error);
    return NextResponse.json({ error: "Failed to delete sub-subject" }, { status: 500 });
  }
  return NextResponse.json({ data: { id } });
}
