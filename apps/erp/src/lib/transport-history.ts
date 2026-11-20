import type { SupabaseClient } from "@supabase/supabase-js";
import type { TransportPeriod } from "@nkps/shared/types";
import { fetchAllRows } from "@nkps/shared/lib/fetch-all-rows";
import type { StopFeeLookup } from "./fees";

// Reads for month-by-month bus pricing (migration 140). Every screen that
// prices a bus fee — the fee desk, the dues register, the portals, the
// download gate, the dashboard, the report builder and the payments route —
// passes what these return to resolveEffectiveFeeLines(), so they all price
// the same months the same way.
//
// Works with any client. Under RLS a reader sees the history of exactly the
// enrollments they can already see. A failed read (or a database the migration
// hasn't reached) reads as "no history", which prices the current arrangement
// every month — the behaviour before the history existed.

const PERIOD_SELECT =
  "id, enrollment_id, effective_from, has_transport, bus_stop_id, transport_direction, transport_fee_override, source, note, recorded_by, created_at";

/** Enrollment id → its transport history, oldest first. */
export async function loadTransportPeriods(
  client: SupabaseClient,
  scope: { enrollmentIds: string[] } | { academicYearId: string }
): Promise<Map<string, TransportPeriod[]>> {
  const rows: TransportPeriod[] = [];
  if ("academicYearId" in scope) {
    const { data, error } = await fetchAllRows<TransportPeriod>((from, to) =>
      client
        .from("student_transport_periods")
        .select(PERIOD_SELECT)
        .eq("academic_year_id", scope.academicYearId)
        .order("id", { ascending: true })
        .range(from, to)
    );
    if (error) {
      console.warn("[transport-history] periods read failed; pricing the current arrangement:", error);
      return new Map();
    }
    rows.push(...data);
  } else {
    const ids = Array.from(new Set(scope.enrollmentIds.filter(Boolean)));
    // Chunked: a long id list in one query string outgrows the URL.
    for (let i = 0; i < ids.length; i += 150) {
      const chunk = ids.slice(i, i + 150);
      const { data, error } = await client
        .from("student_transport_periods")
        .select(PERIOD_SELECT)
        .in("enrollment_id", chunk);
      if (error) {
        console.warn("[transport-history] periods read failed; pricing the current arrangement:", error);
        return new Map();
      }
      rows.push(...((data ?? []) as TransportPeriod[]));
    }
  }
  const byEnrollment = new Map<string, TransportPeriod[]>();
  for (const r of rows) {
    const id = r.enrollment_id as string;
    const list = byEnrollment.get(id);
    if (list) list.push(r);
    else byEnrollment.set(id, [r]);
  }
  for (const list of byEnrollment.values()) {
    list.sort((a, b) => a.effective_from.localeCompare(b.effective_from));
  }
  return byEnrollment;
}

/** Every active stop fee of a session, named — the fees a history can price at. */
export async function loadSessionStopFees(
  client: SupabaseClient,
  academicYearId: string
): Promise<{ stopFees: StopFeeLookup[]; error: string | null }> {
  const { data, error } = await fetchAllRows<{
    bus_stop_id: string;
    amount: number;
    frequency: string;
    is_active: boolean;
    bus_stops: { name: string } | { name: string }[] | null;
  }>((from, to) =>
    client
      .from("bus_stop_fees")
      .select("bus_stop_id, amount, frequency, is_active, bus_stops(name)")
      .eq("academic_year_id", academicYearId)
      .eq("is_active", true)
      .order("id", { ascending: true })
      .range(from, to)
  );
  if (error) return { stopFees: [], error };
  return {
    error: null,
    stopFees: data.map((f) => {
      const stop = Array.isArray(f.bus_stops) ? f.bus_stops[0] : f.bus_stops;
      return {
        bus_stop_id: f.bus_stop_id,
        stop_name: stop?.name ?? "",
        amount: f.amount,
        frequency: f.frequency,
        is_active: f.is_active,
      };
    }),
  };
}
