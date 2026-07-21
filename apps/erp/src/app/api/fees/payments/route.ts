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
      bus_stop_id,
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

    // Status resolution. Look up the target row (fee structure or bus stop
    // fee) once and use it to:
    //   1. Reject over-payment outright (M7).
    //   2. Downgrade an over-eager 'paid' request to 'partial' when the
    //      caller paid less than the target amount.
    let status: "paid" | "partial" = requestedStatus ?? "paid";
    let expected: number;
    let academicYearId: string;
    const targetLabel = bus_stop_id ? "bus stop fee" : "fee structure";

    if (bus_stop_id) {
      // Resolve the student's current transport config so the expected amount
      // matches what they actually owe: the stop's flat fee, or their one-side
      // custom override. The enrollment also supplies the academic year (stops
      // are not year-scoped; their fee is).
      const { data: enrollment } = await admin
        .from("student_enrollments")
        .select(
          "academic_year_id, transport_direction, transport_fee_override, bus_stop_id"
        )
        .eq("student_id", student_id)
        .eq("has_transport", true)
        .order("enrollment_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!enrollment || !enrollment.academic_year_id) {
        return NextResponse.json(
          { error: "Student has no active transport enrollment" },
          { status: 400 }
        );
      }
      academicYearId = enrollment.academic_year_id as string;
      const isOneSide =
        (enrollment.transport_direction as string) !== "both" &&
        enrollment.transport_fee_override != null;
      if (isOneSide) {
        expected = Number(enrollment.transport_fee_override);
      } else {
        const { data: stopFee } = await admin
          .from("bus_stop_fees")
          .select("amount")
          .eq("bus_stop_id", bus_stop_id)
          .eq("academic_year_id", academicYearId)
          .eq("is_active", true)
          .maybeSingle();
        if (!stopFee) {
          return NextResponse.json(
            { error: "No active fee is defined for this bus stop" },
            { status: 400 }
          );
        }
        expected = Number(stopFee.amount);
      }
    } else {
      const { data: structure } = await admin
        .from("fee_structures")
        .select("amount, academic_year_id")
        .eq("id", fee_structure_id!)
        .maybeSingle();
      if (!structure) {
        return NextResponse.json(
          { error: "Fee structure not found" },
          { status: 400 }
        );
      }
      expected = Number(structure.amount);
      academicYearId = structure.academic_year_id as string;
    }

    if (Number.isFinite(expected) && amount_paid > expected) {
      return NextResponse.json(
        {
          error: `Amount paid (${amount_paid}) exceeds the ${targetLabel} amount (${expected}). Reduce the amount, or split the surplus into a separate fee.`,
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
        fee_structure_id: fee_structure_id ?? null,
        bus_stop_id: bus_stop_id ?? null,
        academic_year_id: academicYearId,
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
