import type { SupabaseClient } from "@supabase/supabase-js";
import { generateReceiptNumber } from "@nkps/shared/lib/password";
import { validateWaiver } from "./fee-waiver";
import { correctionColumnsIn, validateCorrection } from "./payment-correction";
import {
  describeVerdict,
  isRefundRequest,
  SUPER_ADMIN_REQUIRED_MESSAGE,
} from "./fee-change-requests";

// Columns on fee_payments that an approved change request may modify.
// Anything outside this set is silently dropped — student_id, receipt
// numbers, FK references, etc. are not editable through this flow (a
// wholly wrong row should be deleted and re-recorded instead).
const FEE_PAYMENT_EDITABLE_COLUMNS = new Set<string>([
  "amount_paid",
  "status",
  "payment_method",
  "payment_date",
  "cheque_number",
  "cheque_date",
  "bank_name",
  "payer_name",
  "transaction_ref",
  "payment_provider",
  "month",
  "remarks",
  "refund_amount",
  "refund_reason",
  // A discount's amount — on a waiver row only, checked below.
  "waiver_amount",
]);

export type ApplyOutcome =
  | { ok: true; id: string }
  | { ok: false; status: number; body: Record<string, unknown> };

const fail = (body: Record<string, unknown>, status: number): ApplyOutcome => ({
  ok: false,
  status,
  body,
});

/**
 * Approve one fee change request and apply it. The single approve route and
 * the bulk route both call this, so approving one request and approving
 * twenty run the same checks.
 *
 * Atomically:
 *   1. Claims the pending request (flips status → approved).
 *   2. Re-reads the live target row (snapshot for the audit log).
 *   3. Applies proposed_changes (or deletes the row for action='delete').
 *   4. Writes a fee_change_audit_log row.
 * If the apply step fails the request is reverted to 'pending' so an
 * admin can retry — same pattern as the registration approval flow.
 * A refund request needs a super admin (migration 135).
 */
export async function applyFeeChangeRequest(
  admin: SupabaseClient,
  opts: { id: string; reviewerId: string; isSuperAdmin: boolean; reviewNotes?: string | null }
): Promise<ApplyOutcome> {
  const { id, reviewerId, isSuperAdmin } = opts;
  const reviewNotes = opts.reviewNotes ?? null;

  // Refund requests are reserved for super admins. Checked before the claim
  // so a plain admin's click never flips the row even momentarily; the claim
  // below re-reads the row, so a request edited in between cannot slip past.
  if (!isSuperAdmin) {
    const { data: peek } = await admin
      .from("fee_change_requests")
      .select("action, proposed_changes")
      .eq("id", id)
      .maybeSingle();
    if (
      peek &&
      isRefundRequest(peek.action, peek.proposed_changes as Record<string, unknown> | null)
    ) {
      return fail(
        { error: SUPER_ADMIN_REQUIRED_MESSAGE, code: "SUPER_ADMIN_REQUIRED" },
        403
      );
    }
  }

  // Atomic claim — flips pending → approved and returns the row that was
  // actually modified. Two admins clicking "approve" simultaneously: only
  // one gets a row back; the loser bails out at the 'no row' branch.
  const reviewedAt = new Date().toISOString();
  const { data: claimed, error: claimErr } = await admin
    .from("fee_change_requests")
    .update({
      status: "approved",
      reviewed_by: reviewerId,
      reviewed_at: reviewedAt,
      review_notes: reviewNotes || null,
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (claimErr) {
    console.error("[fee-change-requests.approve] claim:", claimErr);
    return fail(
      { error: "Failed to claim request" },
      500
    );
  }
  if (!claimed) {
    const { data: existing } = await admin
      .from("fee_change_requests")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (!existing) {
      return fail({ error: "Request not found" }, 404);
    }
    return fail(
      { error: `This request is already ${existing.status}` },
      409
    );
  }

  // The pre-claim peek and the claim are two reads; if the request was turned
  // into a refund in between, a plain admin must still not apply it.
  if (
    !isSuperAdmin &&
    isRefundRequest(
      claimed.action,
      claimed.proposed_changes as Record<string, unknown> | null
    )
  ) {
    await admin
      .from("fee_change_requests")
      .update({
        status: "pending",
        reviewed_by: null,
        reviewed_at: null,
        review_notes: null,
      })
      .eq("id", id);
    return fail(
      { error: SUPER_ADMIN_REQUIRED_MESSAGE, code: "SUPER_ADMIN_REQUIRED" },
      403
    );
  }

  // Helper to revert the request to pending if the apply step fails. The
  // request is stranded as 'approved' otherwise — no underlying change,
  // misleading audit trail.
  const revert = async (reason: string) => {
    await admin
      .from("fee_change_requests")
      .update({
        status: "pending",
        reviewed_by: null,
        reviewed_at: null,
        review_notes: null,
      })
      .eq("id", id);
    console.error(`[fee-change-requests.approve] reverted: ${reason}`);
  };

  // For an INSERT there is no live target row. Apply it on its own path: a
  // proposed waiver is re-validated against the *current* ledger (cap + dedup)
  // so it can't slip through after the student paid or another waiver landed
  // between request and approval.
  let insertedId: string | null = null;
  let insertedRow: Record<string, unknown> | null = null;
  if (claimed.action === "insert") {
    const proposed = (claimed.proposed_changes ?? {}) as Record<string, unknown>;
    if (proposed.payment_method === "waiver") {
      const recheck = await validateWaiver(admin, {
        student_id: String(proposed.student_id ?? ""),
        fee_structure_id: String(proposed.fee_structure_id ?? ""),
        waiver_amount: Number(proposed.waiver_amount ?? 0),
        waiver_reason: String(proposed.waiver_reason ?? ""),
        month: (proposed.month as string | null) ?? null,
      });
      if (!recheck.ok) {
        await revert(`waiver re-validation failed: ${recheck.code} ${recheck.error}`);
        // Say what is actually wrong and what to do about it. The verdict
        // goes back too, so the inbox can show the explanation on the request
        // itself instead of only in a toast that disappears.
        const message = recheck.verdict
          ? describeVerdict(recheck.verdict)
          : `Cannot approve this discount: ${recheck.error}`;
        return fail(
          {
            error: message,
            code:
              recheck.code === "duplicate_applied"
                ? "DUPLICATE_WAIVER"
                : recheck.code === "exceeds_outstanding"
                  ? "EXCEEDS_OUTSTANDING"
                  : "WAIVER_INVALID",
            verdict: recheck.verdict ?? null,
          },
          recheck.code === "lookup_failed" ? 500 : 409
        );
      }
    }
    // The receipt number in proposed_changes was drawn when the request was
    // FILED. Receipt numbers are random, not a sequence, so a receipt issued
    // in between can take it — and re-inserting the same number would then
    // fail on every retry, leaving the request unapprovable for good. Draw a
    // fresh one on a collision; it is the sole UNIQUE column besides the PK.
    let created: Record<string, unknown> | null = null;
    let insErr: { code?: string; message?: string } | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await admin
        .from(claimed.target_table)
        .insert(proposed)
        .select("*")
        .single();
      if (!res.error && res.data) {
        created = res.data as Record<string, unknown>;
        insErr = null;
        break;
      }
      insErr = res.error;
      if (res.error?.code !== "23505") break;
      proposed.receipt_number = generateReceiptNumber();
    }
    if (insErr || !created) {
      await revert(`insert failed: ${insErr?.code} ${insErr?.message}`);
      return fail(
        {
          error:
            "The discount could not be saved, so the request is still pending. Try again; if it keeps failing, reject it and have it filed again.",
        },
        500
      );
    }
    insertedId = created.id as string;
    insertedRow = created;
  }

  // Snapshot the live row for the audit log (and to detect drift). Inserts
  // skip this — there is no prior row.
  const { data: liveRow, error: liveErr } =
    claimed.action === "insert"
      ? { data: null, error: null }
      : await admin
          .from(claimed.target_table)
          .select("*")
          .eq("id", claimed.target_id)
          .maybeSingle();
  if (liveErr) {
    await revert("live-row lookup failed");
    return fail(
      { error: "Failed to load target row for approval" },
      500
    );
  }
  if (claimed.action !== "insert" && !liveRow) {
    await revert("target row gone");
    return fail(
      {
        error:
          "The target record no longer exists. Reject this request and inform the requester.",
      },
      409
    );
  }

  // Apply the change.
  if (claimed.action === "insert") {
    // Already applied above.
  } else if (claimed.action === "delete") {
    const { error: delErr } = await admin
      .from(claimed.target_table)
      .delete()
      .eq("id", claimed.target_id);
    if (delErr) {
      await revert(`delete failed: ${delErr.message}`);
      // FK violation: payments referenced elsewhere. Tell the admin
      // exactly why so they can decide whether to reject the request.
      if (
        delErr.code === "23503" ||
        /foreign key/i.test(delErr.message ?? "")
      ) {
        return fail(
          {
            error:
              "Cannot delete: other records reference this row. Reject the request or remove the dependents first.",
          },
          409
        );
      }
      return fail(
        { error: "Failed to apply delete. Request reverted to pending." },
        500
      );
    }
  } else {
    // action === 'update'. Filter proposed_changes to the editable set.
    const proposed = (claimed.proposed_changes ?? {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(proposed)) {
      if (FEE_PAYMENT_EDITABLE_COLUMNS.has(k)) patch[k] = v;
    }

    // Basic safety rails. The reviewer is responsible for verifying the
    // amount makes sense; we only block the obvious garbage.
    if ("amount_paid" in patch) {
      const amt = Number(patch.amount_paid);
      if (!Number.isFinite(amt) || amt < 0) {
        await revert("invalid amount_paid");
        return fail(
          { error: "Proposed amount_paid is not a valid number." },
          400
        );
      }
    }
    // A correction (date, mode and its details, transport month) is checked
    // again here with the rules it was filed under: the payment may have been
    // refunded since, and a mode change must still carry the details that
    // mode needs. Approving a cash → cheque change with no cheque number used
    // to go straight through.
    // A changed discount amount: only on a discount, and within what is still
    // owed on its instalment, leaving this discount itself out.
    if ("waiver_amount" in patch) {
      if (liveRow.payment_method !== "waiver") {
        await revert("waiver_amount on a non-waiver row");
        return fail({ error: "Only a discount has a discount amount." }, 400);
      }
      const recheck = await validateWaiver(
        admin,
        {
          student_id: String(liveRow.student_id),
          fee_structure_id: String(liveRow.fee_structure_id),
          waiver_amount: Number(patch.waiver_amount),
          waiver_reason: String(liveRow.waiver_reason ?? ""),
          month: (liveRow.month as string | null) ?? null,
        },
        { excludePaymentId: String(liveRow.id) }
      );
      if (!recheck.ok) {
        await revert(`discount change rejected: ${recheck.error}`);
        return fail({ error: `This discount change can't be applied: ${recheck.error}` }, 409);
      }
    }

    const correction = correctionColumnsIn(patch);
    if (correction.length > 0) {
      const subset = Object.fromEntries(correction.map((k) => [k, patch[k]]));
      const problem = await validateCorrection(admin, liveRow, subset);
      if (problem) {
        await revert(`correction rejected: ${problem}`);
        return fail(
          { error: `This correction can't be applied: ${problem}` },
          409
        );
      }
    }
    if ("status" in patch) {
      const s = String(patch.status);
      if (!["paid", "partial", "refunded"].includes(s)) {
        await revert("invalid status");
        return fail(
          { error: "Proposed status must be paid, partial, or refunded." },
          400
        );
      }
      // Refund consistency: when flipping to 'refunded', require
      // refund_amount + reason, and stamp refunded_at/refunded_by from
      // the approving admin.
      if (s === "refunded") {
        const refundAmt = Number(patch.refund_amount ?? liveRow.refund_amount);
        if (!Number.isFinite(refundAmt) || refundAmt <= 0) {
          await revert("missing refund_amount");
          return fail(
            { error: "Refund requires a positive refund_amount." },
            400
          );
        }
        // A refund can never exceed the amount actually paid. Use the proposed
        // amount_paid if this same request also edits it, otherwise the live
        // value. Mirrors the invariant the direct refund path enforces.
        const effectivePaid =
          "amount_paid" in patch
            ? Number(patch.amount_paid)
            : Number(liveRow.amount_paid);
        if (Number.isFinite(effectivePaid) && refundAmt > effectivePaid) {
          await revert("refund exceeds amount paid");
          return fail(
            { error: "Refund amount cannot exceed the amount paid." },
            400
          );
        }
        const reason = String(patch.refund_reason ?? liveRow.refund_reason ?? "");
        if (reason.trim().length < 5) {
          await revert("missing refund_reason");
          return fail(
            { error: "Refund requires a reason (min 5 chars)." },
            400
          );
        }
        patch.refunded_at = reviewedAt;
        patch.refunded_by = reviewerId;
      }
    }

    if (Object.keys(patch).length === 0) {
      await revert("no editable columns in proposed_changes");
      return fail(
        { error: "No editable columns were specified in the request." },
        400
      );
    }

    const { error: updErr } = await admin
      .from(claimed.target_table)
      .update(patch)
      .eq("id", claimed.target_id);

    if (updErr) {
      await revert(`update failed: ${updErr.message}`);
      return fail(
        { error: "Failed to apply update. Request reverted to pending." },
        500
      );
    }
  }

  // Re-read after the apply for the audit log.
  const afterRow =
    claimed.action === "delete"
      ? null
      : claimed.action === "insert"
        ? insertedRow
        : (
            await admin
              .from(claimed.target_table)
              .select("*")
              .eq("id", claimed.target_id)
              .maybeSingle()
          ).data;

  const { error: auditErr } = await admin
    .from("fee_change_audit_log")
    .insert({
      target_table: claimed.target_table,
      target_id: claimed.action === "insert" ? insertedId : claimed.target_id,
      action: claimed.action,
      before_snapshot: liveRow,
      after_snapshot: afterRow,
      performed_by: reviewerId,
      source_request_id: claimed.id,
      notes: reviewNotes || null,
    });
  // Audit log failure does not undo the change — the change is real and
  // the user-facing flow already succeeded. Log it loud so we notice.
  if (auditErr) {
    console.error(
      `[fee-change-requests.approve] audit insert failed for request ${id}:`,
      auditErr
    );
  }

  return { ok: true, id: claimed.id as string };
}

/**
 * Reject one pending fee change request. No side effect on the target row;
 * the requester sees the rejection and its note in their own list. Rejecting
 * a refund request, like approving one, is a super admin's call.
 */
export async function rejectFeeChangeRequest(
  admin: SupabaseClient,
  opts: { id: string; reviewerId: string; isSuperAdmin: boolean; reviewNotes?: string | null }
): Promise<ApplyOutcome> {
  const { id, reviewerId, isSuperAdmin } = opts;

  if (!isSuperAdmin) {
    const { data: peek } = await admin
      .from("fee_change_requests")
      .select("action, proposed_changes")
      .eq("id", id)
      .maybeSingle();
    if (
      peek &&
      isRefundRequest(peek.action, peek.proposed_changes as Record<string, unknown> | null)
    ) {
      return fail(
        { error: SUPER_ADMIN_REQUIRED_MESSAGE, code: "SUPER_ADMIN_REQUIRED" },
        403
      );
    }
  }

  const { data: updated, error: updErr } = await admin
    .from("fee_change_requests")
    .update({
      status: "rejected",
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      review_notes: opts.reviewNotes || null,
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (updErr) {
    console.error("[fee-change-requests.reject]", updErr);
    return fail({ error: "Failed to reject request" }, 500);
  }
  if (!updated) {
    const { data: existing } = await admin
      .from("fee_change_requests")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (!existing) return fail({ error: "Request not found" }, 404);
    return fail({ error: `This request is already ${existing.status}` }, 409);
  }
  return { ok: true, id };
}
