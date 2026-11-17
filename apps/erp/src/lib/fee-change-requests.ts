// Shared vocabulary for the fee change-request queue (migration 056) and the
// super-admin rule layered on it (migration 135).
//
// A *refund request* is an update that flips a payment's status to
// 'refunded'. It is the one kind of request only a super admin may approve or
// reject — it is money leaving the school. Edits, deletes and waiver inserts
// stay with any admin. Both the API (approve/reject routes) and the UI
// (inbox badges, button visibility) decide with this function so they can
// never disagree about which requests are refunds.

export type FeeChangeRequestAction = "insert" | "update" | "delete";

export function isRefundRequest(
  action: FeeChangeRequestAction | string,
  proposedChanges: Record<string, unknown> | null | undefined
): boolean {
  if (action !== "update") return false;
  return proposedChanges?.status === "refunded";
}

/** Error payload the refund route and the approve/reject routes return when
 *  the caller must go through (or wait for) a super admin. The fees UI
 *  pattern-matches `code`; the message is what the user reads. */
export const SUPER_ADMIN_REQUIRED_MESSAGE =
  "Only a super admin can approve a refund. File a refund request and a super admin will review it.";

// ---------------------------------------------------------------------------
// Pending discount (waiver) requests — can this one actually be applied?
// ---------------------------------------------------------------------------
//
// A discount request is re-checked against the live ledger when it is
// approved (lib/fee-waiver.ts). Until November 2026 the inbox gave no hint of
// that check, so a request that could never pass — a second copy of a
// discount already applied, or one of two identical requests — failed only
// when someone pressed Approve, went back to pending, and sat in the queue
// for good. The inbox now shows the same verdict up front, and the approve
// route returns it on failure.

export type WaiverRequestVerdict =
  /** Passes the cap and the one-discount-per-instalment rule today. */
  | { kind: "ok" }
  /** The instalment already carries an applied discount in the same month bucket. */
  | {
      kind: "duplicate_applied";
      amount: number;
      receipt_number: string | null;
      payment_date: string | null;
    }
  /** An earlier pending request covers the same instalment. */
  | {
      kind: "duplicate_pending";
      amount: number;
      request_id: string;
      requested_at: string;
    }
  /** Larger than what is still owed on the instalment. */
  | { kind: "exceeds_outstanding"; remaining: number }
  /** Cannot be applied for some other reason (fee removed, bad amount). */
  | { kind: "invalid"; message: string };

const rupees = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);

function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Whether Approve can succeed for a request with this verdict. */
export function verdictBlocksApproval(v: WaiverRequestVerdict | undefined): boolean {
  return (
    v?.kind === "duplicate_applied" ||
    v?.kind === "exceeds_outstanding" ||
    v?.kind === "invalid"
  );
}

/** Whether the verdict says this request is a copy of another discount. */
export function verdictIsDuplicate(v: WaiverRequestVerdict | undefined): boolean {
  return v?.kind === "duplicate_applied" || v?.kind === "duplicate_pending";
}

/** Short label for the inbox card badge. Null for a request that is fine. */
export function verdictBadge(v: WaiverRequestVerdict | undefined): string | null {
  switch (v?.kind) {
    case "duplicate_applied":
      return "Already applied — duplicate";
    case "duplicate_pending":
      return "Duplicate of an earlier request";
    case "exceeds_outstanding":
      return "More than is still owed";
    case "invalid":
      return "Can't be applied";
    default:
      return null;
  }
}

/** The full explanation shown in the review dialog. */
export function describeVerdict(v: WaiverRequestVerdict | undefined): string | null {
  switch (v?.kind) {
    case "duplicate_applied": {
      const detail = [
        v.receipt_number ? `receipt ${v.receipt_number}` : null,
        shortDate(v.payment_date) ? `recorded ${shortDate(v.payment_date)}` : null,
      ]
        .filter(Boolean)
        .join(", ");
      return `This discount has already been applied: the instalment carries a ${rupees(
        v.amount
      )} discount${detail ? ` (${detail})` : ""}. Approving would discount it twice, so it cannot be approved. Reject it as a duplicate.`;
    }
    case "duplicate_pending":
      return `Another request filed ${
        shortDate(v.requested_at) ?? "earlier"
      } asks for the same ${rupees(
        v.amount
      )} discount on this instalment. Only one of them can be applied — approve one and reject the other as a duplicate.`;
    case "exceeds_outstanding":
      return `The discount is more than is still owed on this instalment (${rupees(
        v.remaining
      )}). The family has paid, or been discounted, more since the request was filed. Reject it, or have a smaller discount filed.`;
    case "invalid":
      return v.message;
    default:
      return null;
  }
}

/** Review note recorded when a request is rejected as a duplicate. */
export function duplicateRejectNote(v: WaiverRequestVerdict | undefined): string {
  if (v?.kind === "duplicate_applied") {
    return `Duplicate: this discount was already applied${
      v.receipt_number ? ` (receipt ${v.receipt_number})` : ""
    }.`;
  }
  return "Duplicate of another request for the same discount.";
}
