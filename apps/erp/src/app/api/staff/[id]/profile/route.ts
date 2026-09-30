import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  verifyAdminOrEditor,
  verifyAdminOrEditorWithUser,
} from "@nkps/shared/lib/verify-admin";
import { staffProfileUpdateSchema } from "@nkps/shared/lib/validations";
import { STAFF_PROFILE_FIELDS } from "@nkps/shared/lib/staff-profile-fields";
import {
  mirrorStaffDetailsToTeacher,
  mirrorStaffToTeacher,
} from "@/lib/staff-teacher-sync";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const MEMBER_KEYS = new Set(
  STAFF_PROFILE_FIELDS.filter((f) => f.table === "staff_members").map((f) => f.key)
);

// GET /api/staff/[id]/profile
// The full staff record: the staff_members row, the staff_details row (null
// until first saved), trainings, notices, and the bus list for the "travels in"
// picker. staff_details holds PAN/bank/Aadhaar, so this is the only read path
// and it sits behind the same `staff` grant as the rest of People → Staff.
export async function GET(_request: NextRequest, context: RouteContext) {
  const admin = await verifyAdminOrEditor("staff");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;

  const [memberRes, detailsRes, trainingsRes, noticesRes, busesRes, teacherRes] =
    await Promise.all([
      admin.from("staff_members").select("*").eq("id", id).maybeSingle(),
      admin.from("staff_details").select("*").eq("staff_member_id", id).maybeSingle(),
      admin
        .from("staff_trainings")
        .select("id, program_name, from_date, to_date, duration, organizing_institute")
        .eq("staff_member_id", id)
        .order("from_date", { ascending: false, nullsFirst: false }),
      admin
        .from("staff_notices")
        .select("id, issued_by, issue_date, reason, clarification")
        .eq("staff_member_id", id)
        .order("issue_date", { ascending: false }),
      admin
        .from("buses")
        .select("id, bus_number")
        .eq("is_active", true)
        .order("bus_number"),
      admin
        .from("teachers")
        .select("id, is_active")
        .eq("staff_member_id", id)
        .maybeSingle(),
    ]);

  if (memberRes.error || detailsRes.error || trainingsRes.error || noticesRes.error) {
    console.error("[staff profile] load:", {
      member: memberRes.error,
      details: detailsRes.error,
      trainings: trainingsRes.error,
      notices: noticesRes.error,
    });
    return NextResponse.json({ error: "Failed to load staff profile" }, { status: 500 });
  }
  if (!memberRes.data) {
    return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
  }

  return NextResponse.json({
    member: memberRes.data,
    details: detailsRes.data,
    trainings: trainingsRes.data ?? [],
    notices: noticesRes.data ?? [],
    buses: busesRes.data ?? [],
    teacher: teacherRes.data ?? null,
  });
}

/**
 * Make the stored child rows for this staff member exactly `rows`: update the
 * ones that carry an id, insert the rest, delete whatever is no longer listed.
 * An id belonging to another staff member is treated as new, never updated.
 */
async function replaceChildRows(
  admin: SupabaseClient,
  table: "staff_trainings" | "staff_notices",
  staffId: string,
  rows: Array<Record<string, unknown> & { id?: string }>,
  insertExtra: Record<string, unknown> = {}
): Promise<string | null> {
  const { data: existing, error: loadErr } = await admin
    .from(table)
    .select("id")
    .eq("staff_member_id", staffId);
  if (loadErr) return loadErr.message;

  const ownIds = new Set((existing ?? []).map((r) => r.id as string));
  const keepIds = new Set<string>();
  const toInsert: Record<string, unknown>[] = [];

  for (const { id, ...values } of rows) {
    if (id && ownIds.has(id)) {
      keepIds.add(id);
      const { error } = await admin.from(table).update(values).eq("id", id);
      if (error) return error.message;
    } else {
      toInsert.push({ ...values, ...insertExtra, staff_member_id: staffId });
    }
  }

  const toDelete = [...ownIds].filter((id) => !keepIds.has(id));
  if (toDelete.length > 0) {
    const { error } = await admin.from(table).delete().in("id", toDelete);
    if (error) return error.message;
  }
  if (toInsert.length > 0) {
    const { error } = await admin.from(table).insert(toInsert);
    if (error) return error.message;
  }
  return null;
}

// PUT /api/staff/[id]/profile
// Body: { fields?, trainings?, notices? }. `fields` is any subset of the
// registry — the page saves one section at a time — and is split between
// staff_members (the core fields) and staff_details. A list, when present,
// replaces the stored one.
export async function PUT(request: NextRequest, context: RouteContext) {
  const caller = await verifyAdminOrEditorWithUser("staff");
  if (!caller) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { admin, user } = caller;
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = staffProfileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { fields, trainings, notices } = parsed.data;

  const { data: member } = await admin
    .from("staff_members")
    .select("id, name, category")
    .eq("id", id)
    .maybeSingle();
  if (!member) {
    return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
  }

  const memberPatch: Record<string, unknown> = {};
  const detailsPatch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields ?? {})) {
    if (value === undefined) continue;
    if (MEMBER_KEYS.has(key)) memberPatch[key] = value;
    else detailsPatch[key] = value;
  }

  // Details first: it is the write with the checks most likely to reject
  // (unique Emp No., PAN/IFSC formats), so a refusal leaves nothing half-saved.
  if (Object.keys(detailsPatch).length > 0) {
    const { error } = await admin
      .from("staff_details")
      .upsert({ staff_member_id: id, ...detailsPatch }, { onConflict: "staff_member_id" });
    if (error) {
      console.error("[staff profile] upsert details:", error);
      if (error.code === "23505") {
        return NextResponse.json(
          { error: `Emp No. "${detailsPatch.employee_no}" is already used by another staff member` },
          { status: 409 }
        );
      }
      if (error.code === "23514") {
        return NextResponse.json(
          { error: "One of the values is not in the expected format" },
          { status: 400 }
        );
      }
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }
    await mirrorStaffDetailsToTeacher(admin, id, detailsPatch);
  }

  if (Object.keys(memberPatch).length > 0) {
    const { error } = await admin
      .from("staff_members")
      .update({ ...memberPatch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[staff profile] update member:", error);
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Another staff member in this category already has that name" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }
    await mirrorStaffToTeacher(admin, id);
  }

  if (trainings) {
    const err = await replaceChildRows(admin, "staff_trainings", id, trainings);
    if (err) {
      console.error("[staff profile] trainings:", err);
      return NextResponse.json({ error: "Failed to save trainings" }, { status: 500 });
    }
  }

  if (notices) {
    const err = await replaceChildRows(admin, "staff_notices", id, notices, {
      recorded_by: user.id,
    });
    if (err) {
      console.error("[staff profile] notices:", err);
      return NextResponse.json({ error: "Failed to save notices" }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
