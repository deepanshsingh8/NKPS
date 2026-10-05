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
