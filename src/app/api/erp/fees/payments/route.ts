import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { feePaymentSchema } from "@/lib/validations";
import { generateReceiptNumber } from "@/lib/password";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!callerProfile || callerProfile.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: admin access required" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const result = feePaymentSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid data", details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { student_id, fee_structure_id, amount_paid, payment_method, month } =
      result.data;

    // Auto-generate receipt number with cryptographically secure random digits
    const receipt_number = generateReceiptNumber();

    const { data: payment, error } = await supabase
      .from("fee_payments")
      .insert({
        student_id,
        fee_structure_id,
        amount_paid,
        payment_method,
        month: month || null,
        receipt_number,
        payment_date: new Date().toISOString().split("T")[0],
        status: "paid",
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
