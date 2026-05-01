import { NextResponse } from "next/server";
import { verifyAdminOrEditorWithUser } from "@nkps/shared/lib/verify-admin";
import { feePaymentSchema } from "@nkps/shared/lib/validations";
import { generateReceiptNumber } from "@nkps/shared/lib/password";

export async function POST(request: Request) {
  try {
    const auth = await verifyAdminOrEditorWithUser("fees");
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { admin, user } = auth;

    const body = await request.json();
    const result = feePaymentSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid data", details: result.error.flatten() },
        { status: 400 }
      );
    }

    const {
      student_id,
      fee_structure_id,
      amount_paid,
      payment_method,
      month,
      status: requestedStatus,
      cheque_number,
      cheque_date,
      bank_name,
      payer_name,
      transaction_ref,
      payment_provider,
    } = result.data;

    // Status resolution. Look up the structure once and use it to:
    //   1. Reject over-payment outright (M7) — a duplicate ₹10k tuition
    //      payment used to inflate the dues compute and phantom-clear
    //      transport dues, since dues compute sums across structures with
    //      no per-structure attribution.
    //   2. Downgrade an over-eager 'paid' request to 'partial' when the
    //      caller paid less than the structure amount.
    let status: "paid" | "partial" = requestedStatus ?? "paid";
    const { data: structure } = await admin
      .from("fee_structures")
      .select("amount, academic_year_id")
      .eq("id", fee_structure_id)
      .maybeSingle();
    if (!structure) {
      return NextResponse.json(
        { error: "Fee structure not found" },
        { status: 400 }
      );
    }
    const expected = Number(structure.amount);
    if (Number.isFinite(expected) && amount_paid > expected) {
      return NextResponse.json(
        {
          error: `Amount paid (${amount_paid}) exceeds the fee structure amount (${expected}). Reduce the amount, or split the surplus into a separate fee.`,
        },
        { status: 400 }
      );
    }
    if (status === "paid" && expected > amount_paid) {
      status = "partial";
    }

    // Auto-generate receipt number with cryptographically secure random digits
    const receipt_number = generateReceiptNumber();

    const { data: payment, error } = await admin
      .from("fee_payments")
      .insert({
        student_id,
        fee_structure_id,
        academic_year_id: structure.academic_year_id,
        amount_paid,
        payment_method,
        month: month || null,
        receipt_number,
        payment_date: new Date().toISOString().split("T")[0],
        status,
        recorded_by: user.id,
        cheque_number: cheque_number ?? null,
        cheque_date: cheque_date ?? null,
        bank_name: bank_name ?? null,
        payer_name: payer_name ?? null,
        transaction_ref: transaction_ref ?? null,
        payment_provider: payment_provider ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error("Fee payment insert error:", error);
      return NextResponse.json(
        { error: "Failed to record payment" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, payment });
  } catch (err) {
    console.error("API error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
