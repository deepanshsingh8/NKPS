import type { SupabaseClient } from "@supabase/supabase-js";
import { dbErrorMessage } from "@nkps/shared/lib/api-errors";
import type { TransportChangeRequest } from "@nkps/shared/types";

// A change is "permanent" when it has no end date — it becomes the new
// baseline on the enrollment. A dated window is a temporary overlay that we
// never write to the baseline (avoids a revert cron); readers overlay it while
// today ∈ [effective_from, effective_to].
export function isPermanentChange(change: {
  effective_to?: string | null;
}): boolean {
  return !change.effective_to;
}

// Apply an APPROVED change to the enrollment baseline.
//
// A permanent change of stop or direction, and every drop and resume, is
// recorded in the transport history (migration 140) from the change's own
// effective date — so the bus fee is priced at the old arrangement before it
// and the new one from its month on — and the enrollment then carries the
// latest arrangement. A bus change moves the child to another bus and never
// changes the fee. Temporary bus/stop/direction changes are never written: they
// surface as an overlay while their window lasts, and the fee stays as it was
// (the school's rule). Returns { error } on failure.
export async function applyTransportChange(
  admin: SupabaseClient,
  change: {
    id?: string;
    enrollment_id: string;
    change_type: string;
    amended_bus_id?: string | null;
    amended_stop_id?: string | null;
    direction?: string | null;
    effective_from?: string | null;
    effective_to?: string | null;
    reason_note?: string | null;
  },
  actorId?: string | null
): Promise<{ applied: boolean; error?: string }> {
  const permanent = isPermanentChange(change);

  if (change.change_type === "bus_change") {
    if (!permanent || !change.amended_bus_id) return { applied: false };
    const { error } = await admin
      .from("student_enrollments")
      .update({ bus_id: change.amended_bus_id })
      .eq("id", change.enrollment_id);
    if (error) return { applied: false, error: dbErrorMessage(error, "transport apply change") };
    return { applied: true };
  }
  if (!permanent && (change.change_type === "stop_change" || change.change_type === "direction_change")) {
    return { applied: false };
  }

  const { data: enr, error: enrErr } = await admin
    .from("student_enrollments")
    .select("has_transport, bus_stop_id, transport_direction, transport_fee_override")
    .eq("id", change.enrollment_id)
    .maybeSingle();
  if (enrErr || !enr) {
    return { applied: false, error: "The student's enrollment could not be loaded" };
  }
  const next = {
    has_transport: Boolean(enr.has_transport),
    bus_stop_id: (enr.bus_stop_id as string | null) ?? null,
    direction: ((enr.transport_direction as string | null) ?? "both") as string,
    override: enr.transport_fee_override != null ? Number(enr.transport_fee_override) : null,
  };
  switch (change.change_type) {
    case "stop_change":
      if (!change.amended_stop_id) return { applied: false };
      next.bus_stop_id = change.amended_stop_id;
      break;
    case "direction_change":
      if (!change.direction) return { applied: false };
      next.direction = change.direction;
      break;
    case "drop":
      next.has_transport = false;
      break;
    case "resume": {
      next.has_transport = true;
      // Leaving the bus clears the stop, so a resume that names none goes back
      // to the last stop on record.
      let stop = change.amended_stop_id ?? next.bus_stop_id;
      if (!stop) {
        const { data: last } = await admin
          .from("student_transport_periods")
          .select("bus_stop_id")
          .eq("enrollment_id", change.enrollment_id)
          .eq("has_transport", true)
          .order("effective_from", { ascending: false })
          .limit(1)
          .maybeSingle();
        stop = (last?.bus_stop_id as string | null) ?? null;
      }
      next.bus_stop_id = stop;
      if (!next.bus_stop_id) {
        return { applied: false, error: "Pick the stop the student resumes the bus at." };
      }
      break;
    }
    default:
      return { applied: false };
  }

  const { error: rpcError } = await admin.rpc("record_transport_period", {
    p_enrollment_id: change.enrollment_id,
    p_effective_from: (change.effective_from ?? new Date().toISOString()).slice(0, 10),
    p_has_transport: next.has_transport,
    p_bus_stop_id: next.has_transport ? next.bus_stop_id : null,
    p_direction: next.has_transport ? next.direction : "both",
    p_fee_override: next.has_transport && next.direction !== "both" ? next.override : null,
    p_source: "change_request",
    p_note: change.reason_note ?? null,
    p_actor: actorId ?? null,
    p_change_request_id: change.id ?? null,
  });
  if (!rpcError) return { applied: true };

  // PGRST202: migration 140 not applied yet. Fall back to writing the
  // enrollment directly, as before the history existed, so approvals keep
  // working; the history begins once the migration runs.
  if (rpcError.code !== "PGRST202") {
    return { applied: false, error: dbErrorMessage(rpcError, "transport apply change") };
  }
  const patch: Record<string, unknown> = {
    has_transport: next.has_transport,
    bus_stop_id: next.has_transport ? next.bus_stop_id : null,
    transport_direction: next.has_transport ? next.direction : "both",
    transport_fee_override: next.has_transport && next.direction !== "both" ? next.override : null,
  };
  if (!next.has_transport) patch.bus_id = null;
  const { error } = await admin
    .from("student_enrollments")
    .update(patch)
    .eq("id", change.enrollment_id);
  if (error) return { applied: false, error: dbErrorMessage(error, "transport apply change") };
  return { applied: true };
}

// The effective bus/stop for an enrollment today = an active, approved
// temporary amendment within its window, else the enrollment baseline.
export function effectiveTransport(
  baseline: { bus_id: string | null; bus_stop_id: string | null },
  changes: Pick<
    TransportChangeRequest,
    | "change_type"
    | "amended_bus_id"
    | "amended_stop_id"
    | "effective_from"
    | "effective_to"
    | "status"
  >[],
  today: string
): { bus_id: string | null; bus_stop_id: string | null } {
  let busId = baseline.bus_id;
  let stopId = baseline.bus_stop_id;
  for (const c of changes) {
    if (c.status !== "approved") continue;
    if (!c.effective_to) continue; // permanent changes already in baseline
    if (c.effective_from > today || c.effective_to < today) continue;
    if (c.change_type === "bus_change" && c.amended_bus_id)
      busId = c.amended_bus_id;
    if (c.change_type === "stop_change" && c.amended_stop_id)
      stopId = c.amended_stop_id;
  }
  return { bus_id: busId, bus_stop_id: stopId };
}
