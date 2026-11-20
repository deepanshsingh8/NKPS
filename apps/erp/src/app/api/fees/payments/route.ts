import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { verifyAdminOrEditorWithUser } from "@nkps/shared/lib/verify-admin";
import { feePaymentSchema } from "@nkps/shared/lib/validations";
import { generateReceiptNumber } from "@nkps/shared/lib/password";
import { todayISO } from "@nkps/shared/lib/date";
import {
  type FeeTarget,
  resolveExpectedAmount,
  settledForPeriod,
} from "@/lib/fee-payment-guards";
import { allocateAcrossMonths, formatFeeMonth } from "@/lib/fees";

// POST /api/fees/payments — record a payment against one instalment, or
// against one or more months of the student's bus fee.
//
// Bus fees (migration 139): one payment may cover several months. It is still
// written as ONE ROW PER MONTH — the per-month over-collection guard, the dues
// maths, refunds and reports keep working unchanged — split oldest month first
// (every month but the last paid in full), inserted in a single statement so
// either every month lands or none does, and tied together by
// payment_group_id so the rows print as one receipt. Recording a bus fee
// without a month used to be allowed, and every such payment then fell into
// one shared "no month" bucket where the second was refused as over-collection.
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
      const first = result.error.issues[0]?.message;
      return NextResponse.json(
        { error: first ?? "Invalid data", details: result.error.flatten() },
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
      months: requestedMonths,
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

    const target: FeeTarget = bus_stop_id
      ? { bus_stop_id }
      : { fee_structure_id: fee_structure_id! };
    const resolved = await resolveExpectedAmount(admin, student_id, target);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    const { expected, academicYearId, label: targetLabel } = resolved;

    // What each row to insert carries beyond the shared fields.
    let slices: Array<{ amount: number; month: string | null; status: "paid" | "partial" }>;

    if (bus_stop_id) {
      const months = Array.from(
        new Set(
          requestedMonths && requestedMonths.length > 0
            ? requestedMonths
            : month
              ? [month]
              : []
        )
      ).sort();
      if (months.some((m) => !/^\d{4}-\d{2}$/.test(m))) {
        return NextResponse.json(
          { error: "Pick the bus fee's months from the month list." },
          { status: 400 }
        );
      }

      // Every month must fall inside the session the fee belongs to.
      const { data: year } = await admin
        .from("academic_years")
        .select("start_date, end_date")
        .eq("id", academicYearId)
        .maybeSingle();
      if (year?.start_date && year?.end_date) {
        const first = String(year.start_date).slice(0, 7);
        const last = String(year.end_date).slice(0, 7);
        const outside = months.find((m) => m < first || m > last);
        if (outside) {
          return NextResponse.json(
            {
              error: `${formatFeeMonth(outside)} is outside this session (${formatFeeMonth(first)} – ${formatFeeMonth(last)}).`,
            },
            { status: 400 }
          );
        }
      }

      // What each month still owes — the same guard the single-month path
      // always ran, once per month.
      const owed = await Promise.all(
        months.map(async (m) => ({
          month: m,
          remaining: Math.max(
            0,
            Math.round(
              (expected - (await settledForPeriod(admin, { student_id, target, month: m }))) * 100
            ) / 100
          ),
        }))
      );
      const allocation = allocateAcrossMonths(amount_paid, owed);
      if (!allocation.ok) {
        return NextResponse.json({ error: allocation.error }, { status: 400 });
      }
      slices = allocation.slices.map((sl) => ({
        amount: sl.amount,
        month: sl.month,
        status: sl.full ? "paid" : "partial",
      }));
    } else {
      // An instalment: one row, as before.
      if (Number.isFinite(expected) && amount_paid > expected) {
        return NextResponse.json(
          {
            error: `Amount paid (${amount_paid}) exceeds the ${targetLabel} amount (${expected}). Reduce the amount, or split the surplus into a separate fee.`,
          },
          { status: 400 }
        );
      }

      // Cumulative over-payment guard (#27). The per-transaction check above
      // only bounds a single receipt; without this, recording the same amount
      // twice (e.g. a duplicate entry) lets the running total exceed what is
      // owed. Sum what is already settled against the same instalment, net of
      // refunds, and reject if this payment would push the total past it.
      let alreadySettled = 0;
      if (Number.isFinite(expected)) {
        alreadySettled = await settledForPeriod(admin, {
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

      // M9 — a 'paid' request below the amount still owed is 'partial'.
      let status: "paid" | "partial" = requestedStatus ?? "paid";
      if (status === "paid" && expected > alreadySettled + amount_paid + 0.005) {
        status = "partial";
      }
      slices = [{ amount: amount_paid, month: month || null, status }];
    }

    // One receipt number for the collection; a multi-month collection's rows
    // carry it with a /1, /2… suffix, as the day-book import's split rows do.
    const groupId = slices.length > 1 ? randomUUID() : null;
    const buildRows = (receiptBase: string) =>
      slices.map((sl, i) => ({
        student_id,
        fee_structure_id: fee_structure_id ?? null,
        bus_stop_id: bus_stop_id ?? null,
        academic_year_id: academicYearId,
        amount_paid: sl.amount,
        payment_method,
        month: sl.month,
        receipt_number: slices.length > 1 ? `${receiptBase}/${i + 1}` : receiptBase,
        payment_group_id: groupId,
        payment_date,
        status: sl.status,
        recorded_by: user.id,
        cheque_number: cheque_number ?? null,
        cheque_date: cheque_date ?? null,
        bank_name: bank_name ?? null,
        payer_name: payer_name ?? null,
        transaction_ref: transaction_ref ?? null,
        payment_provider: payment_provider ?? null,
      }));

    // The receipt number is random, not a sequence, so two receipts can in
    // theory collide on the UNIQUE constraint; regenerate and retry on 23505
    // so a legitimate payment is never hard-failed by an unlucky draw. (#19)
    // A multi-row insert is one statement: every month lands, or none does.
    let payments: Record<string, unknown>[] | null = null;
    let error: { code?: string; message?: string } | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await admin
        .from("fee_payments")
        .insert(buildRows(generateReceiptNumber()))
        .select();
      if (!res.error && res.data && res.data.length === slices.length) {
        payments = res.data as Record<string, unknown>[];
        error = null;
        break;
      }
      error = res.error ?? { message: "insert returned no rows" };
      // Only a receipt-number collision is retryable (it's the sole UNIQUE
      // constraint besides the PK); any other error is terminal.
      if (res.error?.code !== "23505") break;
    }

    if (error || !payments) {
      console.error("Fee payment insert error:", error);
      return NextResponse.json(
        { error: "Failed to record payment" },
        { status: 500 }
      );
    }

    const ordered = [...payments].sort((a, b) =>
      String(a.month ?? "").localeCompare(String(b.month ?? ""))
    );
    return NextResponse.json({
      success: true,
      // The first row stands for the collection: its receipt prints them all.
      payment: {
        ...ordered[0],
        receipt_number: groupId
          ? String(ordered[0].receipt_number).replace(/\/\d+$/, "")
          : ordered[0].receipt_number,
      },
      payments: ordered,
      payment_group_id: groupId,
    });
  } catch (err) {
    console.error("API error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
