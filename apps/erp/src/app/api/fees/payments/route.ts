import { NextResponse } from "next/server";
import { verifyAdminOrEditorWithUser } from "@nkps/shared/lib/verify-admin";
import { feePaymentSchema } from "@nkps/shared/lib/validations";
import { generateReceiptNumber } from "@nkps/shared/lib/password";
import { todayISO } from "@nkps/shared/lib/date";
import {
  type FeeTarget,
  resolveExpectedAmount,
  settledForPeriod,
} from "@/lib/fee-payment-guards";

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
      bus_stop_id,
      amount_paid,
      payment_method,
      month,
      payment_date,
      status: requestedStatus,
      cheque_number,
      cheque_date,
      bank_name,
      payer_name,
      transaction_ref,
      payment_provider,
    } = result.data;

    if (payment_date > todayISO()) {
      return NextResponse.json(
        { error: "Payment date cannot be in the future" },
        { status: 400 }
      );
    }

    // Status resolution. Look up the target row (fee structure or bus stop
    // fee) once and use it to:
    //   1. Reject over-payment outright (M7).
    //   2. Downgrade an over-eager 'paid' request to 'partial' when the
    //      caller paid less than the target amount.
    let status: "paid" | "partial" = requestedStatus ?? "paid";
    const target: FeeTarget = bus_stop_id
      ? { bus_stop_id }
      : { fee_structure_id: fee_structure_id! };
    const resolved = await resolveExpectedAmount(admin, student_id, target);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    const { expected, academicYearId, label: targetLabel } = resolved;

    if (Number.isFinite(expected) && amount_paid > expected) {
      return NextResponse.json(
        {
          error: `Amount paid (${amount_paid}) exceeds the ${targetLabel} amount (${expected}). Reduce the amount, or split the surplus into a separate fee.`,
        },
        { status: 400 }
      );
    }

    // Cumulative over-payment guard (#27). The per-transaction check above only
    // bounds a single receipt; without this, recording the same amount twice
    // (e.g. a duplicate entry) lets the running total exceed what is owed for
    // this period. Sum what is already settled against the SAME target and
    // period (month scopes monthly fees; one-time/annual fees carry a null
    // month), net of refunds, and reject if this payment would push the total
    // past `expected`.
    if (Number.isFinite(expected)) {
      const alreadySettled = await settledForPeriod(admin, {
        student_id,
        target,
        month: month || null,
      });
      // Round to paise to avoid float noise on numeric(10,2) values.
      const cumulative = Math.round((alreadySettled + amount_paid) * 100) / 100;
      if (cumulative > expected + 0.005) {
        const remaining = Math.max(0, expected - alreadySettled);
        return NextResponse.json(
          {
            error: `This ${targetLabel} already has ${alreadySettled} settled against ${expected}. Recording ${amount_paid} more would over-collect; at most ${remaining} remains due.`,
          },
          { status: 400 }
        );
      }
    }

    if (status === "paid" && expected > amount_paid) {
      status = "partial";
    }

    // Insert with a cryptographically-random receipt number. The number is not
    // a sequence, so two receipts issued the same year can theoretically
    // collide on the UNIQUE constraint; regenerate and retry on 23505 so a
    // legitimate payment is never hard-failed by an unlucky draw. (#19)
    let payment: unknown = null;
    let error: { code?: string; message?: string } | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await admin
        .from("fee_payments")
        .insert({
          student_id,
          fee_structure_id: fee_structure_id ?? null,
          bus_stop_id: bus_stop_id ?? null,
          academic_year_id: academicYearId,
          amount_paid,
          payment_method,
          month: month || null,
          receipt_number: generateReceiptNumber(),
          payment_date,
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
      if (!res.error) {
        payment = res.data;
        error = null;
        break;
      }
      error = res.error;
      // Only a receipt-number collision is retryable (it's the sole UNIQUE
      // constraint besides the PK); any other error is terminal.
      if (res.error.code !== "23505") break;
    }

    if (error || !payment) {
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
