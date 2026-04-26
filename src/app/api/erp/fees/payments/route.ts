import { NextResponse } from "next/server";
import { verifyAdminOrEditorWithUser } from "@/shared/lib/verify-admin";
import { feePaymentSchema } from "@/shared/lib/validations";
import { generateReceiptNumber } from "@/shared/lib/password";

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
    } = result.data;

    // Status resolution. The admin can override, but if they request 'paid'
    // and the amount is below the structure's amount, we downgrade to
    // 'partial' automatically so totals stay consistent.
    let status: "paid" | "partial" = requestedStatus ?? "paid";
    if (status === "paid") {
      const { data: structure } = await admin
        .from("fee_structures")
        .select("amount")
        .eq("id", fee_structure_id)
        .maybeSingle();
      if (structure && Number(structure.amount) > amount_paid) {
        status = "partial";
      }
    }

    // Auto-generate receipt number with cryptographically secure random digits
    const receipt_number = generateReceiptNumber();

    const { data: payment, error } = await admin
      .from("fee_payments")
      .insert({
        student_id,
        fee_structure_id,
        amount_paid,
        payment_method,
        month: month || null,
        receipt_number,
        payment_date: new Date().toISOString().split("T")[0],
        status,
        recorded_by: user.id,
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
