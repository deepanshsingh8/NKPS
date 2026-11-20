import { NextRequest, NextResponse } from "next/server";
import { verifyAdminOrEditorWithUser } from "@nkps/shared/lib/verify-admin";
import { feePaymentCorrectionSchema } from "@nkps/shared/lib/validations";
import {
  buildCorrectionPatch,
  correctionLockReason,
  validateCorrection,
} from "@/lib/payment-correction";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/fees/payments/[id]/correct
// Corrects a recorded payment: the day it was paid, the payment mode and the
// details that go with it, and — for a transport payment — the month it
// covers. Replaces the date-only route.
//
//   • Admins apply it directly. The before/after rows and the reason go to
//     fee_change_audit_log, which the admin proxy would never have written.
//   • Editors (the fee clerk) cannot change a recorded payment: their
//     correction is checked exactly as an admin's would be, then filed as a
//     change request for an admin to approve. Checking at filing means a
//     request that could never be applied is refused now, not at review.
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await verifyAdminOrEditorWithUser("fees");
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { admin, user, role } = auth;
  const { id } = await context.params;

  const body = await request.json().catch(() => ({}));
  const parsed = feePaymentCorrectionSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message;
    return NextResponse.json(
      { error: first ?? "Invalid data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { reason } = parsed.data;

  const { data: live, error: lookupErr } = await admin
    .from("fee_payments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (lookupErr) {
    console.error("[fees.payment-correct] lookup:", lookupErr);
    return NextResponse.json({ error: "Failed to load payment" }, { status: 500 });
  }
  if (!live) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  const lock = correctionLockReason(live);
  if (lock) {
    return NextResponse.json({ error: lock, code: "NOT_CORRECTABLE" }, { status: 400 });
  }

  const built = buildCorrectionPatch(live, parsed.data);
  if ("error" in built) {
    return NextResponse.json({ error: built.error }, { status: 400 });
  }
  const { patch } = built;

  const problem = await validateCorrection(admin, live, patch);
  if (problem) {
    return NextResponse.json({ error: problem }, { status: 400 });
  }

  if (role === "editor") {
    const { data: created, error: reqErr } = await admin
      .from("fee_change_requests")
      .insert({
        target_table: "fee_payments",
        target_id: id,
        action: "update",
        current_snapshot: live,
        proposed_changes: patch,
        reason,
        requested_by: user.id,
      })
      .select("id")
      .single();
    if (reqErr) {
      if (reqErr.code === "23505") {
        return NextResponse.json(
          {
            error:
              "A change request is already waiting for this payment. Wait for it to be reviewed, or cancel it under Fees → Change Requests, then file one correction covering everything.",
          },
          { status: 409 }
        );
      }
      console.error("[fees.payment-correct] request insert:", reqErr);
      return NextResponse.json(
        { error: "Failed to file the correction request" },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true, pending: true, request_id: created.id });
  }

  // Optimistic concurrency: every column being changed must still hold the
  // value this correction was built from, or someone else moved it first.
  let update = admin.from("fee_payments").update(patch).eq("id", id);
  for (const col of Object.keys(patch)) {
    const before = live[col];
    update = before == null ? update.is(col, null) : update.eq(col, before);
  }
  const { data: updated, error: updateErr } = await update.select("*");
  if (updateErr) {
    console.error("[fees.payment-correct] update:", updateErr);
    return NextResponse.json({ error: "Failed to correct the payment" }, { status: 500 });
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json(
      { error: "The payment was changed by someone else meanwhile. Refresh and try again." },
      { status: 409 }
    );
  }

  const { error: auditErr } = await admin.from("fee_change_audit_log").insert({
    target_table: "fee_payments",
    target_id: id,
    action: "update",
    before_snapshot: live,
    after_snapshot: updated[0],
    performed_by: user.id,
    notes: reason,
  });
  // The correction is real either way; a lost audit row is logged loudly
  // rather than reported as a failed edit.
  if (auditErr) {
    console.error("[fees.payment-correct] audit insert:", auditErr);
  }

  return NextResponse.json({ success: true, payment: updated[0] });
}
