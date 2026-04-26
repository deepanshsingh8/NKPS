import { NextResponse } from "next/server";
import { verifyAdminOrEditorWithUser } from "@/lib/verify-admin";
import { feeWaiverSchema } from "@/lib/validations";
import { generateReceiptNumber } from "@/lib/password";

// POST /api/erp/fees/waivers
// Records a fee waiver as a fee_payments row with payment_method='waiver',
// amount_paid=0, waiver_amount=<requested>, status='paid'. Counts toward
// "no dues" the same way a real receipt does, but the row is unmistakably
// distinguished by payment_method='waiver' for audit/reporting.
//
// The DB CHECK (`fee_payments_waiver_consistent`) enforces these invariants
// — this endpoint just packages the call cleanly for the admin UI.
export async function POST(request: Request) {
  const auth = await verifyAdminOrEditorWithUser("fees");
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { admin, user } = auth;

  const body = await request.json();
  const parsed = feeWaiverSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { student_id, fee_structure_id, waiver_amount, waiver_reason, month } =
    parsed.data;

  // Receipt number is still generated for waivers — it's the easiest way to
  // reference the entry in dues lists / parent-facing screens.
  const receipt_number = generateReceiptNumber();

  const { data: payment, error } = await admin
    .from("fee_payments")
    .insert({
      student_id,
      fee_structure_id,
      amount_paid: 0,
      payment_method: "waiver",
      waiver_amount,
      waiver_reason,
      month: month || null,
      receipt_number,
      payment_date: new Date().toISOString().split("T")[0],
      status: "paid",
      recorded_by: user.id,
    })
    .select()
    .single();

  if (error) {
    console.error("[fees.waivers.POST] insert:", error);
    return NextResponse.json(
      { error: "Failed to record waiver" },
      { status: 500 }
    );
  }
  return NextResponse.json({ success: true, payment });
}
