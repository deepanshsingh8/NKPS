import type { SupabaseClient } from "@supabase/supabase-js";

// The over-collection guards every fee_payments write shares: what one period
// of a fee line costs this student, and how much is already settled against a
// period. Recording a payment, recording several bus months at once, and
// moving a transport payment to another month all ask the same two questions,
// so they get one answer.

export type FeeTarget =
  | { fee_structure_id: string; bus_stop_id?: null }
  | { bus_stop_id: string; fee_structure_id?: null };

export type ExpectedAmount =
  | { ok: true; expected: number; academicYearId: string; label: string }
  | { ok: false; error: string; status: number };

/**
 * What one period of this line costs the student: the instalment's amount, or
 * for transport the stop's flat fee — or the student's one-side custom
 * override. The enrollment also supplies the academic year for transport,
 * since stops are not year-scoped but their fees are.
 */
export async function resolveExpectedAmount(
  admin: SupabaseClient,
  student_id: string,
  target: FeeTarget
): Promise<ExpectedAmount> {
  if (target.bus_stop_id) {
    const { data: enrollment } = await admin
      .from("student_enrollments")
      .select("academic_year_id, transport_direction, transport_fee_override, bus_stop_id")
      .eq("student_id", student_id)
      .eq("has_transport", true)
      .order("enrollment_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!enrollment || !enrollment.academic_year_id) {
      return { ok: false, error: "Student has no active transport enrollment", status: 400 };
    }
    const academicYearId = enrollment.academic_year_id as string;
    const isOneSide =
      (enrollment.transport_direction as string) !== "both" &&
      enrollment.transport_fee_override != null;
    if (isOneSide) {
      return {
        ok: true,
        expected: Number(enrollment.transport_fee_override),
        academicYearId,
        label: "bus stop fee",
      };
    }
    const { data: stopFee } = await admin
      .from("bus_stop_fees")
      .select("amount")
      .eq("bus_stop_id", target.bus_stop_id)
      .eq("academic_year_id", academicYearId)
      .eq("is_active", true)
      .maybeSingle();
    if (!stopFee) {
      return { ok: false, error: "No active fee is defined for this bus stop", status: 400 };
    }
    return { ok: true, expected: Number(stopFee.amount), academicYearId, label: "bus stop fee" };
  }

  const { data: structure } = await admin
    .from("fee_structures")
    .select("amount, academic_year_id")
    .eq("id", target.fee_structure_id!)
    .maybeSingle();
  if (!structure) {
    return { ok: false, error: "Fee structure not found", status: 400 };
  }
  return {
    ok: true,
    expected: Number(structure.amount),
    academicYearId: structure.academic_year_id as string,
    label: "fee structure",
  };
}

/**
 * Net amount already settled against one period of one line: cash net of
 * refunds, plus waivers. `month` scopes monthly fees (transport); one-time and
 * annual lines carry a null month. `excludePaymentId` leaves one row out — the
 * row being moved, when a correction changes its month.
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
  const total = (data ?? [])
    .filter((p) => p.id !== opts.excludePaymentId)
    .reduce(
      (sum, p) =>
        sum +
        Math.max(0, Number(p.amount_paid) - Number(p.refund_amount ?? 0)) +
        Number(p.waiver_amount ?? 0),
      0
    );
  // Paise, to keep numeric(10,2) sums free of float noise.
  return Math.round(total * 100) / 100;
}
