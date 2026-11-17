import { NextRequest, NextResponse } from "next/server";
import { verifyAdminWithUser } from "@nkps/shared/lib/verify-admin";
import { feeChangeRequestReviewSchema } from "@nkps/shared/lib/validations";
import { todayISO } from "@nkps/shared/lib/date";
import { generateReceiptNumber } from "@nkps/shared/lib/password";
import { validateWaiver } from "@/lib/fee-waiver";
import {
  describeVerdict,
  isRefundRequest,
  SUPER_ADMIN_REQUIRED_MESSAGE,
} from "@/lib/fee-change-requests";

interface RouteContext {
  params: Promise<{ id: string }>;
}

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
]);

// POST /api/fees/change-requests/[id]/approve
//   Admin-only; a refund request needs a super admin (migration 135). Atomically:
//     1. Claims the pending request (flips status → approved).
//     2. Re-reads the live target row (snapshot for the audit log).
//     3. Applies proposed_changes (or deletes the row for action='delete').
//     4. Writes a fee_change_audit_log row.
//   If the apply step fails the request is reverted to 'pending' so an
//   admin can retry — same pattern as the registration approval flow.
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await verifyAdminWithUser();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { admin, user, isSuperAdmin } = auth;

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const parsed = feeChangeRequestReviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid review payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { review_notes } = parsed.data;

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
      return NextResponse.json(
        { error: SUPER_ADMIN_REQUIRED_MESSAGE, code: "SUPER_ADMIN_REQUIRED" },
        { status: 403 }
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
      reviewed_by: user.id,
      reviewed_at: reviewedAt,
      review_notes: review_notes || null,
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (claimErr) {
    console.error("[fee-change-requests.approve] claim:", claimErr);
    return NextResponse.json(
      { error: "Failed to claim request" },
      { status: 500 }
    );
  }
  if (!claimed) {
    const { data: existing } = await admin
      .from("fee_change_requests")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: `This request is already ${existing.status}` },
      { status: 409 }
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
    return NextResponse.json(
      { error: SUPER_ADMIN_REQUIRED_MESSAGE, code: "SUPER_ADMIN_REQUIRED" },
      { status: 403 }
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
        return NextResponse.json(
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
          { status: recheck.code === "lookup_failed" ? 500 : 409 }
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
      return NextResponse.json(
        {
          error:
            "The discount could not be saved, so the request is still pending. Try again; if it keeps failing, reject it and have it filed again.",
        },
        { status: 500 }
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
    return NextResponse.json(
      { error: "Failed to load target row for approval" },
      { status: 500 }
    );
  }
  if (claimed.action !== "insert" && !liveRow) {
    await revert("target row gone");
    return NextResponse.json(
      {
        error:
          "The target record no longer exists. Reject this request and inform the requester.",
      },
      { status: 409 }
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
        return NextResponse.json(
          {
            error:
              "Cannot delete: other records reference this row. Reject the request or remove the dependents first.",
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "Failed to apply delete. Request reverted to pending." },
        { status: 500 }
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
        return NextResponse.json(
          { error: "Proposed amount_paid is not a valid number." },
          { status: 400 }
        );
      }
    }
    if ("payment_date" in patch) {
      const d = String(patch.payment_date);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d > todayISO()) {
        await revert("invalid payment_date");
        return NextResponse.json(
          { error: "Proposed payment date must be a valid date, not in the future." },
          { status: 400 }
        );
      }
    }
    if ("status" in patch) {
      const s = String(patch.status);
      if (!["paid", "partial", "refunded"].includes(s)) {
        await revert("invalid status");
        return NextResponse.json(
          { error: "Proposed status must be paid, partial, or refunded." },
          { status: 400 }
        );
      }
      // Refund consistency: when flipping to 'refunded', require
      // refund_amount + reason, and stamp refunded_at/refunded_by from
      // the approving admin.
      if (s === "refunded") {
        const refundAmt = Number(patch.refund_amount ?? liveRow.refund_amount);
        if (!Number.isFinite(refundAmt) || refundAmt <= 0) {
          await revert("missing refund_amount");
          return NextResponse.json(
            { error: "Refund requires a positive refund_amount." },
            { status: 400 }
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
          return NextResponse.json(
            { error: "Refund amount cannot exceed the amount paid." },
            { status: 400 }
          );
        }
        const reason = String(patch.refund_reason ?? liveRow.refund_reason ?? "");
        if (reason.trim().length < 5) {
          await revert("missing refund_reason");
          return NextResponse.json(
            { error: "Refund requires a reason (min 5 chars)." },
            { status: 400 }
          );
        }
        patch.refunded_at = reviewedAt;
        patch.refunded_by = user.id;
      }
    }

    if (Object.keys(patch).length === 0) {
      await revert("no editable columns in proposed_changes");
      return NextResponse.json(
        { error: "No editable columns were specified in the request." },
        { status: 400 }
      );
    }

    const { error: updErr } = await admin
      .from(claimed.target_table)
      .update(patch)
      .eq("id", claimed.target_id);

    if (updErr) {
      await revert(`update failed: ${updErr.message}`);
      return NextResponse.json(
        { error: "Failed to apply update. Request reverted to pending." },
        { status: 500 }
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
      performed_by: user.id,
      source_request_id: claimed.id,
      notes: review_notes || null,
    });
  // Audit log failure does not undo the change — the change is real and
  // the user-facing flow already succeeded. Log it loud so we notice.
  if (auditErr) {
    console.error(
      `[fee-change-requests.approve] audit insert failed for request ${id}:`,
      auditErr
    );
  }

  return NextResponse.json({ success: true, id: claimed.id });
}
