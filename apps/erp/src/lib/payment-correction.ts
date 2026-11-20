import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PAYMENT_DETAIL_COLUMNS,
  PAYMENT_METHOD_DETAIL_FIELDS,
  paymentMethodDetailIssues,
  type FeePaymentCorrectionData,
} from "@nkps/shared/lib/validations";
import { todayISO } from "@nkps/shared/lib/date";
import { resolveBusPricing, settledForBusMonth } from "./fee-payment-guards";

// Correcting a recorded payment: the day it was paid, how it was paid and the
// details that go with that, and — transport only — the month it covers.
//
// Before November 2026 only the date could be corrected, so a cash entry that
// was really a cheque stayed "cash" in the day book for good. The rules here
// are the "proper correction process" the office asked for: a reason every
// time, an audit row every time, an admin's approval whenever the clerk asks,
// and some entries never correctable at all.

/** Columns a correction may change. */
export const CORRECTION_COLUMNS = [
  "payment_date",
  "payment_method",
  "month",
  ...PAYMENT_DETAIL_COLUMNS,
] as const;

type PaymentRow = Record<string, unknown> & {
  id: string;
  student_id: string;
  payment_method: string;
  status: string;
  bus_stop_id?: string | null;
  fee_structure_id?: string | null;
  amount_paid: number | string;
  refund_amount?: number | string | null;
  waiver_amount?: number | string | null;
  month?: string | null;
  payment_date?: string | null;
};

/**
 * Why this payment can't be corrected at all, or null if it can.
 *
 *  • a discount (waiver) has no tender to correct — it is changed or removed
 *    as a discount;
 *  • a gateway payment's mode and reference came from the payment gateway,
 *    which verified them; a hand edit would make the record disagree with it;
 *  • a refunded payment is kept as it stood when the money went back.
 */
export function correctionLockReason(row: {
  payment_method: string;
  status: string;
}): string | null {
  if (row.payment_method === "waiver") {
    return "A discount has no payment date or mode to correct.";
  }
  if (row.payment_method === "gateway") {
    return "This payment came through the online payment gateway, which verified its mode and reference, so it can't be changed by hand.";
  }
  if (row.status === "refunded") {
    return "This payment has been refunded; its record is kept as it was at the refund.";
  }
  if (row.status !== "paid" && row.status !== "partial") {
    return "Only a paid or part-paid entry can be corrected.";
  }
  return null;
}

const blankToNull = (v: string | null | undefined): string | null => {
  if (v == null) return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
};

/**
 * The patch a correction request turns into: only the columns that actually
 * change. Switching method clears the details that no longer apply (a cheque
 * number on a cash entry would be a lie), and keeps the ones that still do.
 */
export function buildCorrectionPatch(
  live: PaymentRow,
  input: FeePaymentCorrectionData
): { patch: Record<string, unknown> } | { error: string } {
  const patch: Record<string, unknown> = {};

  if (input.payment_date !== undefined && input.payment_date !== live.payment_date) {
    patch.payment_date = input.payment_date;
  }

  if (input.month !== undefined && input.month !== (live.month ?? "")) {
    if (!live.bus_stop_id) {
      return {
        error:
          "An instalment takes its month from the fee schedule. Only a transport payment's month can be corrected.",
      };
    }
    patch.month = input.month;
  }

  const method = input.payment_method ?? live.payment_method;
  const methodChanged = method !== live.payment_method;
  if (methodChanged) patch.payment_method = method;

  const keep = new Set<string>(
    (PAYMENT_METHOD_DETAIL_FIELDS as Record<string, readonly string[]>)[method] ?? []
  );
  for (const col of PAYMENT_DETAIL_COLUMNS) {
    const liveVal = (live[col] as string | null | undefined) ?? null;
    let next: string | null;
    if (!keep.has(col)) {
      // A detail the method doesn't use: cleared when the method changes,
      // left alone otherwise (it is not this correction's business).
      next = methodChanged ? null : liveVal;
    } else if (input[col] !== undefined) {
      next = blankToNull(input[col] as string | null);
    } else {
      next = liveVal;
    }
    if (next !== liveVal) patch[col] = next;
  }

  if (Object.keys(patch).length === 0) {
    return { error: "Nothing would change — the payment already reads like this." };
  }
  return { patch };
}

/**
 * Checks a correction patch against the live row and the ledger. Run when a
 * correction is filed and again when an approver applies it, since the row or
 * the ledger may have moved in between. Returns the problem, or null.
 */
export async function validateCorrection(
  admin: SupabaseClient,
  live: PaymentRow,
  patch: Record<string, unknown>
): Promise<string | null> {
  const lock = correctionLockReason(live);
  if (lock) return lock;

  if ("payment_date" in patch) {
    const d = String(patch.payment_date ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "Payment date must be a date.";
    if (d > todayISO()) return "Payment date cannot be in the future.";
  }

  if ("payment_method" in patch) {
    const m = String(patch.payment_method);
    if (!["cash", "online", "cheque", "bank_transfer", "upi"].includes(m)) {
      return "A payment can only be corrected to cash, cheque, bank transfer, online or UPI.";
    }
  }

  const resulting = { ...live, ...patch } as PaymentRow & Record<string, string | null>;
  const issues = paymentMethodDetailIssues({
    payment_method: resulting.payment_method,
    cheque_number: resulting.cheque_number as string | null,
    bank_name: resulting.bank_name as string | null,
    transaction_ref: resulting.transaction_ref as string | null,
    payment_provider: resulting.payment_provider as string | null,
  });
  if (issues.length > 0) return issues.map((i) => i.message).join(". ") + ".";

  // Moving a bus payment to another month must not over-collect that month.
  if ("month" in patch) {
    const month = String(patch.month ?? "");
    if (!live.bus_stop_id) {
      return "Only a transport payment's month can be corrected.";
    }
    if (!/^\d{4}-\d{2}$/.test(month)) return "Month must be a month.";
    // Priced the way every fee screen prices it (migration 140): the month's
    // own fee, at the stop the student was on then.
    const pricing = await resolveBusPricing(admin, live.student_id);
    if (pricing.ok) {
      const fee = pricing.monthFee(month);
      if (!fee) return "The student wasn't on the bus that month, so there is no bus fee to move this payment to.";
      const already = await settledForBusMonth(admin, {
        student_id: live.student_id,
        month,
        sessionMonthList: pricing.sessionMonthList,
        excludePaymentId: live.id,
      });
      const mine =
        Math.max(0, Number(live.amount_paid) - Number(live.refund_amount ?? 0)) +
        Number(live.waiver_amount ?? 0);
      if (already + mine > fee.amount + 0.005) {
        return `That month already has ${already} settled against a fee of ${fee.amount}; moving this ${mine} there would over-collect it.`;
      }
    }
  }

  return null;
}

/** The correction columns a patch touches. */
export function correctionColumnsIn(patch: Record<string, unknown>): string[] {
  return Object.keys(patch).filter((k) =>
    (CORRECTION_COLUMNS as readonly string[]).includes(k)
  );
}
