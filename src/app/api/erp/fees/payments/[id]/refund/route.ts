import { NextRequest, NextResponse } from "next/server";
import { verifyAdminOrEditorWithUser } from "@/lib/verify-admin";
import { feeRefundSchema } from "@/lib/validations";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/erp/fees/payments/[id]/refund
// Marks a previously-recorded payment as refunded with reason + amount.
// The DB CHECK constraint (`fee_payments_refund_consistent`) enforces that
// `refund_amount > 0` whenever status flips to 'refunded'.
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await verifyAdminOrEditorWithUser("fees");
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { admin, user } = auth;

  const { id } = await context.params;
  const body = await request.json();
  const parsed = feeRefundSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { refund_amount, refund_reason } = parsed.data;

  const { data: existing, error: lookupErr } = await admin
    .from("fee_payments")
    .select("id, amount_paid, status, payment_method")
    .eq("id", id)
    .maybeSingle();
  if (lookupErr) {
    console.error("[fees.refund] lookup:", lookupErr);
    return NextResponse.json({ error: "Failed to load payment" }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }
  if (existing.status === "refunded") {
    return NextResponse.json(
      { error: "Payment is already refunded" },
      { status: 400 }
    );
  }
  if (existing.payment_method === "waiver") {
    return NextResponse.json(
      { error: "Waivers cannot be refunded — delete the waiver row instead" },
      { status: 400 }
    );
  }
  if (refund_amount > Number(existing.amount_paid)) {
    return NextResponse.json(
      {
        error: `Refund amount cannot exceed the original payment (${existing.amount_paid}).`,
      },
      { status: 400 }
    );
  }

  const { error: updateErr } = await admin
    .from("fee_payments")
    .update({
      status: "refunded",
      refund_amount,
      refund_reason,
      refunded_at: new Date().toISOString(),
      refunded_by: user.id,
    })
    .eq("id", id);
  if (updateErr) {
    console.error("[fees.refund] update:", updateErr);
    return NextResponse.json({ error: "Failed to refund payment" }, { status: 500 });
  }

  return NextResponse.json({ success: true, id });
}
