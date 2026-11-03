import { NextRequest, NextResponse } from "next/server";
import { verifyAdminOrEditorWithUser } from "@nkps/shared/lib/verify-admin";
import { feePaymentDateSchema } from "@nkps/shared/lib/validations";
import { todayISO } from "@nkps/shared/lib/date";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/fees/payments/[id]/date
// Corrects the payment date on a recorded payment — the day the parent paid
// was keyed in wrong, or the payment predates the required date field.
// Admins only; an editor files a change request instead (the same rule that
// keeps an editor from editing fee_payments through /api/admin). Written here
// rather than through the admin proxy so the change lands in
// fee_change_audit_log with its reason, like an approved request would.
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await verifyAdminOrEditorWithUser("fees");
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { admin, user, role } = auth;

  const { id } = await context.params;

  if (role !== "admin") {
    return NextResponse.json(
      {
        error: "Editors must file a change request to change a payment date.",
        code: "EDITOR_MUST_REQUEST",
      },
      { status: 403 }
    );
  }

  const body = await request.json();
  const parsed = feePaymentDateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { payment_date, reason } = parsed.data;
  if (payment_date > todayISO()) {
    return NextResponse.json(
      { error: "Payment date cannot be in the future" },
      { status: 400 }
    );
  }

  const { data: existing, error: lookupErr } = await admin
    .from("fee_payments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (lookupErr) {
    console.error("[fees.payment-date] lookup:", lookupErr);
    return NextResponse.json({ error: "Failed to load payment" }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }
  if (existing.payment_method === "waiver") {
    return NextResponse.json(
      { error: "A waiver has no payment date to correct" },
      { status: 400 }
    );
  }
  if (existing.payment_date === payment_date) {
    return NextResponse.json({ success: true, id });
  }

  // Optimistic-concurrency guard, as on the refund route: if someone else
  // moved the date since we read it, this matches zero rows.
  let update = admin
    .from("fee_payments")
    .update({ payment_date })
    .eq("id", id);
  update = existing.payment_date
    ? update.eq("payment_date", existing.payment_date)
    : update.is("payment_date", null);
  const { data: updated, error: updateErr } = await update.select("*");
  if (updateErr) {
    console.error("[fees.payment-date] update:", updateErr);
    return NextResponse.json(
      { error: "Failed to update payment date" },
      { status: 500 }
    );
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json(
      { error: "Payment was modified by another request. Refresh and try again." },
      { status: 409 }
    );
  }

  const { error: auditErr } = await admin.from("fee_change_audit_log").insert({
    target_table: "fee_payments",
    target_id: id,
    action: "update",
    before_snapshot: existing,
    after_snapshot: updated[0],
    performed_by: user.id,
    notes: reason,
  });
  // The date change is real either way; a lost audit row is logged loudly
  // rather than reported as a failed edit.
  if (auditErr) {
    console.error("[fees.payment-date] audit insert:", auditErr);
  }

  return NextResponse.json({ success: true, id });
}
