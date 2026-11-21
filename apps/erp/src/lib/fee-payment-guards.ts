import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isTransportBillableMonth,
  sessionMonthOf,
  sessionMonths,
  transportMonthFees,
} from "./fees";
import { loadSessionStopFees, loadTransportPeriods } from "./transport-history";

// The over-collection guards every fee_payments write shares: what one period
// of a fee line costs this student, and how much is already settled against a
// period. Recording a payment and moving a transport payment to another month
// ask the same two questions, so they get one answer.

export type FeeTarget =
  | { fee_structure_id: string; bus_stop_id?: null }
  | { bus_stop_id: string; fee_structure_id?: null };

/**
 * Net amount already settled against one period of one line: cash net of
 * refunds, plus waivers. `month` scopes a recurring line; `anyMonth` counts
 * every row for an instalment, whose month is only a label.
 * `excludePaymentId` leaves one row out — the row being moved, when a
 * correction changes its month.
 */
export async function settledForPeriod(
  admin: SupabaseClient,
  opts: {
    student_id: string;
    target: FeeTarget;
    month: string | null;
    /** Count every row for the line, whatever its month — an instalment is
     *  charged once, so its month is a label, not a period. */
    anyMonth?: boolean;
    excludePaymentId?: string;
  }
): Promise<number> {
  let q = admin
    .from("fee_payments")
    .select("id, amount_paid, refund_amount, waiver_amount")
    .eq("student_id", opts.student_id)
    .in("status", ["paid", "partial", "refunded"]);
  q = opts.target.bus_stop_id
    ? q.eq("bus_stop_id", opts.target.bus_stop_id)
    : q.eq("fee_structure_id", opts.target.fee_structure_id!);
  if (!opts.anyMonth) {
    q = opts.month ? q.eq("month", opts.month) : q.is("month", null);
  }
  const { data } = await q;
  return sumSettled((data ?? []).filter((p) => p.id !== opts.excludePaymentId));
}

function sumSettled(
  rows: Array<{ amount_paid: number | string; refund_amount: number | string | null; waiver_amount: number | string | null }>
): number {
  const total = rows.reduce(
    (sum, p) =>
      sum +
      Math.max(0, Number(p.amount_paid) - Number(p.refund_amount ?? 0)) +
      Number(p.waiver_amount ?? 0),
    0
  );
  // Paise, to keep numeric(10,2) sums free of float noise.
  return Math.round(total * 100) / 100;
}

export type BusPricing =
  | {
      ok: true;
      academicYearId: string;
      sessionMonthList: string[];
      /** What the month costs and the stop it is charged at; null when off the bus. */
      monthFee: (month: string) => { amount: number; bus_stop_id: string } | null;
    }
  | { ok: false; error: string; status: number };

/**
 * The student's bus fee month by month, priced the way every fee screen
 * prices it: from the transport history (migration 140) when there is one —
 * each month at the stop in force that month, nothing for a month off the
 * bus — else the current arrangement every month. A student who has left the
 * bus can still pay for the months they rode.
 */
export async function resolveBusPricing(
  admin: SupabaseClient,
  student_id: string
): Promise<BusPricing> {
  const { data: enrollment } = await admin
    .from("student_enrollments")
    .select("id, academic_year_id, has_transport, bus_stop_id, transport_direction, transport_fee_override")
    .eq("student_id", student_id)
    .order("enrollment_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!enrollment || !enrollment.academic_year_id) {
    return { ok: false, error: "Student has no enrollment this session", status: 400 };
  }
  const academicYearId = enrollment.academic_year_id as string;
  const [{ data: year }, periods, session] = await Promise.all([
    admin.from("academic_years").select("start_date, end_date").eq("id", academicYearId).maybeSingle(),
    loadTransportPeriods(admin, { enrollmentIds: [enrollment.id as string] }),
    loadSessionStopFees(admin, academicYearId),
  ]);
  if (session.error) {
    return { ok: false, error: "Failed to load the bus stop fees", status: 500 };
  }
  const sessionMonthList =
    year?.start_date && year?.end_date ? sessionMonths(String(year.start_date), String(year.end_date)) : [];

  const monthFees = transportMonthFees({
    periods: periods.get(enrollment.id as string) ?? [],
    sessionMonthList,
    stopFees: session.stopFees,
  });
  if (monthFees) {
    return {
      ok: true,
      academicYearId,
      sessionMonthList,
      monthFee: (m) => {
        const f = monthFees.find((x) => x.month === m);
        return f && f.amount > 0 && f.bus_stop_id ? { amount: f.amount, bus_stop_id: f.bus_stop_id } : null;
      },
    };
  }

  // No history: the current arrangement, every month — the old rule.
  if (!enrollment.has_transport || !enrollment.bus_stop_id) {
    return { ok: false, error: "Student has no active transport enrollment", status: 400 };
  }
  const stopId = enrollment.bus_stop_id as string;
  const oneSide =
    (enrollment.transport_direction as string) !== "both" && enrollment.transport_fee_override != null;
  const stopFee = session.stopFees.find((f) => f.bus_stop_id === stopId);
  if (!oneSide && !stopFee) {
    return { ok: false, error: "No active fee is defined for this bus stop", status: 400 };
  }
  const amount = oneSide ? Number(enrollment.transport_fee_override) : Number(stopFee!.amount);
  return {
    ok: true,
    academicYearId,
    sessionMonthList,
    // Nothing for a month the bus does not run (June) — the same rule the
    // month-by-month pricing above applies.
    monthFee: (m) =>
      isTransportBillableMonth(m) && (sessionMonthList.length === 0 || sessionMonthList.includes(m))
        ? { amount, bus_stop_id: stopId }
        : null,
  };
}

/**
 * Settled against one bus month: every bus payment that names that month,
 * whichever stop it was taken at and however its month was written ("2026-04",
 * "April, 2026", or a yearless "APR").
 */
export async function settledForBusMonth(
  admin: SupabaseClient,
  opts: {
    student_id: string;
    month: string;
    sessionMonthList: string[];
    excludePaymentId?: string;
  }
): Promise<number> {
  const { data } = await admin
    .from("fee_payments")
    .select("id, month, amount_paid, refund_amount, waiver_amount")
    .eq("student_id", opts.student_id)
    .not("bus_stop_id", "is", null)
    .in("status", ["paid", "partial", "refunded"]);
  return sumSettled(
    (data ?? []).filter(
      (p) =>
        p.id !== opts.excludePaymentId &&
        sessionMonthOf(p.month as string | null, opts.sessionMonthList) === opts.month
    )
  );
}
