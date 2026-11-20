import type { SupabaseClient } from "@supabase/supabase-js";
import { generateReceiptNumber } from "@nkps/shared/lib/password";
import { todayISO } from "@nkps/shared/lib/date";
import { fetchAllRows } from "@nkps/shared/lib/fetch-all-rows";
import { annualizedAmount } from "./fees";
import type { WaiverRequestVerdict } from "./fee-change-requests";

// Shared waiver logic so every path that writes a discount enforces the SAME
// guards — the direct admin insert, the editor's change request (at filing
// AND at approval), the bulk concession import, and the inbox's up-front
// verdict:
//   • cap   — a waiver may not exceed the fee still owed on that structure
//   • dedup — one active waiver per (student, structure, month)
// The rule itself is the pure checkWaiverAgainstLedger() below; the callers
// differ only in which rows they hand it.

export interface WaiverInput {
  student_id: string;
  fee_structure_id: string;
  waiver_amount: number;
  waiver_reason: string;
  month?: string | null;
}

export type WaiverProblemCode =
  | "invalid_amount"
  | "structure_not_found"
  | "lookup_failed"
  | "duplicate_applied"
  | "duplicate_pending"
  | "exceeds_outstanding";

export interface WaiverValidation {
  ok: boolean;
  error?: string;
  code?: WaiverProblemCode;
  /** Present on failure: the same verdict the inbox shows for this case. */
  verdict?: WaiverRequestVerdict;
  academic_year_id?: string;
}

/** A fee_payments row (or a pending discount request standing in for one). */
export interface WaiverLedgerRow {
  amount_paid: number | string | null;
  waiver_amount: number | string | null;
  refund_amount: number | string | null;
  status: string;
  payment_method: string;
  month: string | null;
  receipt_number?: string | null;
  payment_date?: string | null;
  /** Set when the row is a discount still awaiting approval, not a receipt. */
  pending_request?: { id: string; requested_at: string } | null;
}

export type WaiverCheck =
  | { ok: true; remaining: number }
  | { ok: false; code: WaiverProblemCode; verdict: WaiverRequestVerdict };

const rupees = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);

/**
 * The waiver rule, with no I/O. `rows` are every payment and waiver against
 * this student's structure, plus — where the caller wants them counted — the
 * discounts still waiting for approval, as rows carrying `pending_request`.
 */
export function checkWaiverAgainstLedger(opts: {
  structure: { amount: number | string; frequency: string };
  rows: WaiverLedgerRow[];
  waiver_amount: number;
  month: string | null;
}): WaiverCheck {
  const { structure, rows, waiver_amount } = opts;
  const month = opts.month || null;

  if (!Number.isFinite(waiver_amount) || waiver_amount <= 0) {
    return {
      ok: false,
      code: "invalid_amount",
      verdict: { kind: "invalid", message: "Discount amount must be a positive number." },
    };
  }

  // Dedup: at most one active (non-refunded) waiver per (student, structure,
  // month). A null month is its own bucket. An applied discount is reported
  // ahead of a pending one — it is the more decisive reason.
  const sameBucket = rows.filter(
    (p) =>
      p.payment_method === "waiver" &&
      p.status !== "refunded" &&
      (p.month || null) === month
  );
  const applied = sameBucket.find((p) => !p.pending_request);
  if (applied) {
    return {
      ok: false,
      code: "duplicate_applied",
      verdict: {
        kind: "duplicate_applied",
        amount: Number(applied.waiver_amount ?? 0),
        receipt_number: applied.receipt_number ?? null,
        payment_date: applied.payment_date ?? null,
      },
    };
  }
  const pending = sameBucket.find((p) => p.pending_request);
  if (pending?.pending_request) {
    return {
      ok: false,
      code: "duplicate_pending",
      verdict: {
        kind: "duplicate_pending",
        amount: Number(pending.waiver_amount ?? 0),
        request_id: pending.pending_request.id,
        requested_at: pending.pending_request.requested_at,
      },
    };
  }

  // Cap: a waiver can't clear more than is still owed on this structure.
  // Refunded rows count their net cash: a partial refund keeps amount_paid
  // intact and records the returned portion separately.
  const obligation = annualizedAmount(structure);
  const settled = rows
    .filter(
      (p) =>
        p.status === "paid" || p.status === "partial" || p.status === "refunded"
    )
    .reduce(
      (sum, p) =>
        sum +
        Math.max(0, Number(p.amount_paid ?? 0) - Number(p.refund_amount ?? 0)) +
        Number(p.waiver_amount ?? 0),
      0
    );
  const remaining = obligation - settled;
  // Allow a sub-rupee tolerance for float noise.
  if (waiver_amount > remaining + 0.5) {
    return {
      ok: false,
      code: "exceeds_outstanding",
      verdict: {
        kind: "exceeds_outstanding",
        remaining: Math.max(0, Math.round(remaining * 100) / 100),
      },
    };
  }

  return { ok: true, remaining };
}

/** The message a filing or import caller shows for a failed check. */
function filingMessage(check: Extract<WaiverCheck, { ok: false }>): string {
  const v = check.verdict;
  switch (v.kind) {
    case "duplicate_applied":
      return `This instalment already has a ${rupees(v.amount)} discount${
        v.receipt_number ? ` (receipt ${v.receipt_number})` : ""
      }. Only one discount per instalment is allowed.`;
    case "duplicate_pending":
      return `A ${rupees(
        v.amount
      )} discount for this instalment is already waiting for approval. Wait for it to be reviewed, or have an admin reject it first.`;
    case "exceeds_outstanding":
      return `Discount is more than is still owed on this instalment (${rupees(
        v.remaining
      )}).`;
    case "invalid":
      return v.message;
    default:
      return "Discount rejected.";
  }
}

const LEDGER_SELECT =
  "amount_paid, waiver_amount, refund_amount, status, payment_method, month, receipt_number, payment_date";

type PendingInsertRow = {
  id: string;
  requested_at: string;
  proposed_changes: Record<string, unknown> | null;
};

/** A pending discount request, as the ledger row it would become. */
function pendingAsLedgerRow(r: PendingInsertRow): WaiverLedgerRow {
  const p = r.proposed_changes ?? {};
  return {
    amount_paid: 0,
    waiver_amount: Number(p.waiver_amount ?? 0),
    refund_amount: null,
    status: "paid",
    payment_method: "waiver",
    month: (p.month as string | null) || null,
    pending_request: { id: r.id, requested_at: r.requested_at },
  };
}

// Validates a proposed waiver against the live ledger. Re-run at apply time
// (not just request time) so a waiver can't slip past after the student has
// since paid or another waiver landed.
//
// `includePending` also counts discounts still waiting for approval. Every
// FILING path sets it: before November 2026 none did, so the same discount
// could be filed twice and the second copy could never be approved. The
// approve route leaves it off — there, only what is actually applied matters,
// and the request being approved is itself one of the pending ones.
export async function validateWaiver(
  admin: SupabaseClient,
  input: WaiverInput,
  opts: {
    includePending?: boolean;
    /** Leave this discount out — it is the one being changed. */
    excludePaymentId?: string;
  } = {}
): Promise<WaiverValidation> {
  const { student_id, fee_structure_id, waiver_amount } = input;
  const month = input.month || null;

  if (!Number.isFinite(waiver_amount) || waiver_amount <= 0) {
    return {
      ok: false,
      code: "invalid_amount",
      error: "Waiver amount must be a positive number.",
      verdict: { kind: "invalid", message: "Discount amount must be a positive number." },
    };
  }

  const { data: structure, error: structErr } = await admin
    .from("fee_structures")
    .select("amount, frequency, academic_year_id")
    .eq("id", fee_structure_id)
    .maybeSingle();
  if (structErr) {
    return { ok: false, code: "lookup_failed", error: "Failed to load fee structure." };
  }
  if (!structure) {
    return {
      ok: false,
      code: "structure_not_found",
      error: "Fee structure not found.",
      verdict: {
        kind: "invalid",
        message:
          "The instalment this discount was filed against no longer exists in the fee schedule. Reject the request and file it again against the current instalment.",
      },
    };
  }

  const { data: payments, error: payErr } = await admin
    .from("fee_payments")
    .select(`id, ${LEDGER_SELECT}`)
    .eq("student_id", student_id)
    .eq("fee_structure_id", fee_structure_id);
  if (payErr) {
    return { ok: false, code: "lookup_failed", error: "Failed to load existing payments." };
  }
  const rows: WaiverLedgerRow[] = ((payments ?? []) as Array<WaiverLedgerRow & { id: string }>)
    .filter((p) => p.id !== opts.excludePaymentId);

  if (opts.includePending) {
    const { data: pending, error: pendErr } = await admin
      .from("fee_change_requests")
      .select("id, requested_at, proposed_changes")
      .eq("status", "pending")
      .eq("action", "insert")
      .eq("target_table", "fee_payments")
      .eq("proposed_changes->>student_id", student_id)
      .eq("proposed_changes->>fee_structure_id", fee_structure_id);
    if (pendErr) {
      return {
        ok: false,
        code: "lookup_failed",
        error: "Failed to check for discounts awaiting approval.",
      };
    }
    for (const r of (pending ?? []) as PendingInsertRow[]) {
      if ((r.proposed_changes?.payment_method as string | undefined) !== "waiver") continue;
      rows.push(pendingAsLedgerRow(r));
    }
  }

  const check = checkWaiverAgainstLedger({ structure, rows, waiver_amount, month });
  if (!check.ok) {
    return {
      ok: false,
      code: check.code,
      error: filingMessage(check),
      verdict: check.verdict,
    };
  }

  return { ok: true, academic_year_id: structure.academic_year_id as string };
}

/**
 * The inbox's up-front answer to "will Approve work?" for every pending
 * discount request, in one batched pass.
 *
 * Requests are judged oldest first, and each one that passes is added to the
 * ledger the later ones are judged against — so of two identical requests the
 * older reads "ok" and the newer reads "duplicate_pending", which is what
 * approving them in that order would actually do.
 *
 * Requests that are not pending discount inserts are left out of the result.
 */
export async function assessPendingWaiverRequests(
  admin: SupabaseClient,
  requests: Array<{
    id: string;
    status: string;
    action: string;
    requested_at: string;
    proposed_changes: Record<string, unknown> | null;
  }>
): Promise<Record<string, WaiverRequestVerdict>> {
  const candidates = requests
    .filter(
      (r) =>
        r.status === "pending" &&
        r.action === "insert" &&
        r.proposed_changes?.payment_method === "waiver"
    )
    .sort(
      (a, b) =>
        a.requested_at.localeCompare(b.requested_at) || a.id.localeCompare(b.id)
    );
  if (candidates.length === 0) return {};

  const studentIds = new Set<string>();
  const structureIds = new Set<string>();
  for (const r of candidates) {
    const sid = r.proposed_changes?.student_id;
    const fsid = r.proposed_changes?.fee_structure_id;
    if (typeof sid === "string") studentIds.add(sid);
    if (typeof fsid === "string") structureIds.add(fsid);
  }

  const verdicts: Record<string, WaiverRequestVerdict> = {};
  if (studentIds.size === 0 || structureIds.size === 0) {
    for (const r of candidates) {
      verdicts[r.id] = { kind: "invalid", message: "This request names no student or instalment." };
    }
    return verdicts;
  }

  const [structuresRes, paymentsRes] = await Promise.all([
    admin
      .from("fee_structures")
      .select("id, amount, frequency")
      .in("id", Array.from(structureIds)),
    fetchAllRows<WaiverLedgerRow & { student_id: string; fee_structure_id: string }>(
      (from, to) =>
        admin
          .from("fee_payments")
          .select(`id, student_id, fee_structure_id, ${LEDGER_SELECT}`)
          .in("student_id", Array.from(studentIds))
          .in("fee_structure_id", Array.from(structureIds))
          .order("id", { ascending: true })
          .range(from, to)
    ),
  ]);
  // A verdict built on a short read could call a good request a duplicate, or
  // the reverse. Say nothing rather than something wrong: the approve route
  // still runs the real check.
  if (structuresRes.error || paymentsRes.error || paymentsRes.truncated) {
    console.error(
      "[fee-waiver.assess] ledger read failed:",
      structuresRes.error ?? paymentsRes.error ?? "truncated"
    );
    return {};
  }

  const structureById = new Map(
    (structuresRes.data ?? []).map((s) => [s.id as string, s])
  );
  const ledger = new Map<string, WaiverLedgerRow[]>();
  const keyOf = (sid: string, fsid: string) => `${sid}|${fsid}`;
  for (const p of paymentsRes.data) {
    const k = keyOf(p.student_id, p.fee_structure_id);
    const list = ledger.get(k);
    if (list) list.push(p);
    else ledger.set(k, [p]);
  }

  for (const r of candidates) {
    const p = r.proposed_changes ?? {};
    const sid = String(p.student_id ?? "");
    const fsid = String(p.fee_structure_id ?? "");
    const structure = structureById.get(fsid);
    if (!structure) {
      verdicts[r.id] = {
        kind: "invalid",
        message:
          "The instalment this discount was filed against no longer exists in the fee schedule. Reject the request and file it again against the current instalment.",
      };
      continue;
    }
    const k = keyOf(sid, fsid);
    const rows = ledger.get(k) ?? [];
    const check = checkWaiverAgainstLedger({
      structure: structure as { amount: number; frequency: string },
      rows,
      waiver_amount: Number(p.waiver_amount ?? NaN),
      month: (p.month as string | null) || null,
    });
    if (check.ok) {
      verdicts[r.id] = { kind: "ok" };
      // Later requests for the same instalment are judged as if this one
      // had been approved first.
      rows.push(pendingAsLedgerRow(r));
      ledger.set(k, rows);
    } else {
      verdicts[r.id] = check.verdict;
    }
  }
  return verdicts;
}

// Builds the fee_payments row for a validated waiver. Used directly by admins
// and stored as proposed_changes for an editor's change request.
export function buildWaiverRow(
  input: WaiverInput,
  academicYearId: string,
  recordedBy: string
): Record<string, unknown> {
  return {
    student_id: input.student_id,
    fee_structure_id: input.fee_structure_id,
    academic_year_id: academicYearId,
    amount_paid: 0,
    payment_method: "waiver",
    waiver_amount: input.waiver_amount,
    waiver_reason: input.waiver_reason,
    month: input.month || null,
    receipt_number: generateReceiptNumber(),
    payment_date: todayISO(),
    status: "paid",
    recorded_by: recordedBy,
  };
}
