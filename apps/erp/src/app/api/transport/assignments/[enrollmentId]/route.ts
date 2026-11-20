import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminOrEditorWithUser } from "@nkps/shared/lib/verify-admin";

interface RouteContext {
  params: Promise<{ enrollmentId: string }>;
}

// /api/transport/assignments/[enrollmentId] — a student's bus arrangement
// over time (migration 140), so the bus fee is priced month by month.
//
//   GET    → the transport history, oldest first, named
//   POST   → { kind: "change" | "past", effective_from, has_transport,
//              bus_stop_id, transport_direction, transport_fee_override,
//              bus_id?, pickup_address?, note? }
//            "change": the assignment from a date — becomes the current one
//              when it is the latest; also sets bus and pickup landmark.
//            "past":   records a change that already happened (a correction),
//              without touching the current bus or pickup.
//   DELETE → ?period_id=… removes a history entry made by mistake.
//
// The Student Assignments page used to write the enrollment through the admin
// proxy with no date and no record, which is how a stop change came to be
// priced across the whole year.

const arrangementSchema = z
  .object({
    kind: z.enum(["change", "past"]),
    effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date the change takes effect"),
    has_transport: z.boolean(),
    bus_stop_id: z.string().uuid().nullable().optional(),
    transport_direction: z.enum(["both", "pickup_only", "drop_only"]).default("both"),
    transport_fee_override: z.number().finite().positive().nullable().optional(),
    bus_id: z.string().uuid().nullable().optional(),
    pickup_address: z.string().trim().max(300).nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.has_transport && !v.bus_stop_id) {
      ctx.addIssue({ code: "custom", message: "Select a bus stop for a student on transport.", path: ["bus_stop_id"] });
    }
    if (v.has_transport && v.transport_direction !== "both" && !v.transport_fee_override) {
      ctx.addIssue({ code: "custom", message: "A one-side fee greater than 0 is required.", path: ["transport_fee_override"] });
    }
  });

async function loadEnrollment(
  admin: NonNullable<Awaited<ReturnType<typeof verifyAdminOrEditorWithUser>>>["admin"],
  enrollmentId: string
) {
  const { data } = await admin
    .from("student_enrollments")
    .select("id, academic_year_id, academic_years(start_date, end_date)")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (!data) return null;
  const y = data.academic_years as unknown as
    | { start_date: string | null; end_date: string | null }
    | { start_date: string | null; end_date: string | null }[]
    | null;
  const year = Array.isArray(y) ? y[0] ?? null : y;
  return { id: data.id as string, start: year?.start_date ?? null, end: year?.end_date ?? null };
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await verifyAdminOrEditorWithUser("transport");
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { admin } = auth;
  const { enrollmentId } = await context.params;

  const { data, error } = await admin
    .from("student_transport_periods")
    .select(
      "id, effective_from, has_transport, bus_stop_id, transport_direction, transport_fee_override, source, note, recorded_by, created_at, bus_stops(name)"
    )
    .eq("enrollment_id", enrollmentId)
    .order("effective_from", { ascending: true });
  if (error) {
    // Before migration 140 the table doesn't exist: there is simply no history.
    if (error.code === "42P01" || error.code === "PGRST205") {
      return NextResponse.json({ periods: [], available: false });
    }
    console.error("[transport.history] read:", error);
    return NextResponse.json({ error: "Failed to load the transport history" }, { status: 500 });
  }
  const actorIds = Array.from(new Set((data ?? []).map((r) => r.recorded_by).filter(Boolean))) as string[];
  const { data: profiles } = actorIds.length
    ? await admin.from("profiles").select("id, full_name, email").in("id", actorIds)
    : { data: [] as Array<{ id: string; full_name: string | null; email: string | null }> };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? p.email ?? "Unknown"]));
  return NextResponse.json({
    available: true,
    periods: (data ?? []).map((r) => {
      const stop = Array.isArray(r.bus_stops) ? r.bus_stops[0] : r.bus_stops;
      return {
        id: r.id,
        effective_from: r.effective_from,
        has_transport: r.has_transport,
        bus_stop_id: r.bus_stop_id,
        stop_name: (stop as { name: string } | null)?.name ?? null,
        transport_direction: r.transport_direction,
        transport_fee_override: r.transport_fee_override,
        source: r.source,
        note: r.note,
        recorded_by_name: r.recorded_by ? nameById.get(r.recorded_by) ?? null : null,
        created_at: r.created_at,
      };
    }),
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await verifyAdminOrEditorWithUser("transport");
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { admin, user } = auth;
  const { enrollmentId } = await context.params;

  const parsed = arrangementSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }
  const v = parsed.data;

  const enrollment = await loadEnrollment(admin, enrollmentId);
  if (!enrollment) return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });
  if (enrollment.start && v.effective_from < enrollment.start.slice(0, 10)) {
    return NextResponse.json(
      { error: `The date is before this session began (${enrollment.start.slice(0, 10)}).` },
      { status: 400 }
    );
  }
  if (enrollment.end && v.effective_from > enrollment.end.slice(0, 10)) {
    return NextResponse.json(
      { error: `The date is after this session ends (${enrollment.end.slice(0, 10)}).` },
      { status: 400 }
    );
  }

  const { error: rpcError } = await admin.rpc("record_transport_period", {
    p_enrollment_id: enrollmentId,
    p_effective_from: v.effective_from,
    p_has_transport: v.has_transport,
    p_bus_stop_id: v.has_transport ? v.bus_stop_id ?? null : null,
    p_direction: v.has_transport ? v.transport_direction : "both",
    p_fee_override: v.has_transport && v.transport_direction !== "both" ? v.transport_fee_override ?? null : null,
    p_source: v.kind === "past" ? "correction" : "assignment",
    p_note: v.note || null,
    p_actor: user.id,
    p_change_request_id: null,
  });

  if (rpcError) {
    // PGRST202: migration 140 not applied yet. A current-assignment change
    // still saves the old way (no date, no history); a past correction can't.
    if (rpcError.code === "PGRST202" && v.kind === "change") {
      const { error } = await admin
        .from("student_enrollments")
        .update({
          has_transport: v.has_transport,
          bus_stop_id: v.has_transport ? v.bus_stop_id : null,
          bus_id: v.has_transport ? v.bus_id ?? null : null,
          transport_direction: v.has_transport ? v.transport_direction : "both",
          transport_fee_override:
            v.has_transport && v.transport_direction !== "both" ? v.transport_fee_override ?? null : null,
          pickup_address: v.pickup_address || null,
        })
        .eq("id", enrollmentId);
      if (error) {
        console.error("[transport.assignment] fallback update:", error);
        return NextResponse.json({ error: "Failed to save transport assignment" }, { status: 500 });
      }
      return NextResponse.json({
        success: true,
        warning: "Saved, but without a date: the transport history needs migration 140 to be run.",
      });
    }
    if (rpcError.code === "PGRST202") {
      return NextResponse.json(
        { error: "Recording a past change needs migration 140 to be run first." },
        { status: 409 }
      );
    }
    console.error("[transport.assignment] record:", rpcError);
    return NextResponse.json({ error: "Failed to save transport assignment" }, { status: 500 });
  }

  // The bus and the pickup landmark don't change the fee, so they aren't
  // history; a current change sets them directly.
  if (v.kind === "change") {
    const { error } = await admin
      .from("student_enrollments")
      .update({
        bus_id: v.has_transport ? v.bus_id ?? null : null,
        pickup_address: v.pickup_address || null,
      })
      .eq("id", enrollmentId);
    if (error) {
      console.error("[transport.assignment] bus/pickup update:", error);
      return NextResponse.json(
        { error: "The change was recorded, but the bus or pickup landmark could not be saved." },
        { status: 500 }
      );
    }
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await verifyAdminOrEditorWithUser("transport");
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { admin } = auth;
  const { enrollmentId } = await context.params;
  const periodId = new URL(request.url).searchParams.get("period_id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(periodId)) {
    return NextResponse.json({ error: "period_id is required" }, { status: 400 });
  }
  const { data: period } = await admin
    .from("student_transport_periods")
    .select("id, enrollment_id")
    .eq("id", periodId)
    .maybeSingle();
  if (!period || period.enrollment_id !== enrollmentId) {
    return NextResponse.json({ error: "History entry not found" }, { status: 404 });
  }
  const { error } = await admin.rpc("delete_transport_period", { p_period_id: periodId });
  if (error) {
    console.error("[transport.history] delete:", error);
    return NextResponse.json({ error: "Failed to remove the entry" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
