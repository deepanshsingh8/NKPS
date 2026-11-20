import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { verifyAdminOrEditorWithUser } from "@nkps/shared/lib/verify-admin";
import { feePaymentSchema } from "@nkps/shared/lib/validations";
import { generateReceiptNumber } from "@nkps/shared/lib/password";
import { todayISO } from "@nkps/shared/lib/date";
import { resolveExpectedAmount, settledForPeriod } from "@/lib/fee-payment-guards";
import { allocateOldestFirst, feeLineLabel, formatFeeMonth } from "@/lib/fees";

// POST /api/fees/payments — record one collection: a single instalment, one
// or more months of the student's bus fee, or any mix of instalments and bus
// months on one receipt.
//
// Each fee in the collection is still ONE fee_payments ROW — the
// per-instalment and per-month over-collection guards, the dues maths,
// refunds and reports keep working unchanged. The money is split oldest due
// first: every item but the last-due one must be paid in full, and that one
// may be part-paid. The rows go in a single insert (all of them land or none
// does), share one receipt number (suffixed /1, /2… when there are several),
// and are tied by payment_group_id so they print as one receipt.
//
// History: a bus fee could be recorded one month per entry, an instalment one
// per entry; a parent paying Q2 and the July–September bus fee together got
// four receipts. A bus fee recorded without a month fell into a shared "no
// month" bucket where the second was refused as over-collection.

type Item =
  | { kind: "fs"; fee_structure_id: string }
  | { kind: "bus"; bus_stop_id: string; month: string };

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
      items: requestedItems,
      payment_date,
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

    // Everything the collection covers, in one shape. The single-fee fields
    // are the older form of the same request.
    let items: Item[];
    if (requestedItems && requestedItems.length > 0) {
      items = requestedItems.map((it) =>
        it.fee_structure_id
          ? { kind: "fs" as const, fee_structure_id: it.fee_structure_id }
          : { kind: "bus" as const, bus_stop_id: it.bus_stop_id!, month: it.month! }
      );
    } else if (fee_structure_id) {
      items = [{ kind: "fs", fee_structure_id }];
    } else {
      const ms = requestedMonths && requestedMonths.length > 0 ? requestedMonths : month ? [month] : [];
      items = ms.map((m) => ({ kind: "bus" as const, bus_stop_id: bus_stop_id!, month: m }));
    }
    // One entry per instalment / bus month.
    const seen = new Set<string>();
    items = items.filter((it) => {
      const k = it.kind === "fs" ? `fs:${it.fee_structure_id}` : `bus:${it.bus_stop_id}:${it.month}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (items.length === 0) {
      return NextResponse.json({ error: "Tick what this payment is for." }, { status: 400 });
    }

    // ── Instalments ───────────────────────────────────────────────────────
    const fsIds = items.flatMap((it) => (it.kind === "fs" ? [it.fee_structure_id] : []));
    type Structure = {
      id: string;
      amount: number;
      frequency: string;
      due_date: string | null;
      month_label: string | null;
      academic_year_id: string;
      fee_type: string;
      instalment_name: string | null;
    };
    const structures = new Map<string, Structure>();
    if (fsIds.length > 0) {
      const { data, error } = await admin
        .from("fee_structures")
        .select("id, amount, frequency, due_date, month_label, academic_year_id, fee_type, instalment_name")
        .in("id", fsIds);
      if (error) {
        console.error("Fee structure lookup error:", error);
        return NextResponse.json({ error: "Failed to load the fees" }, { status: 500 });
      }
      for (const row of (data ?? []) as Structure[]) structures.set(row.id, row);
      if (fsIds.some((id) => !structures.has(id))) {
        return NextResponse.json({ error: "Fee structure not found" }, { status: 400 });
      }
    }

    // ── Bus fee ───────────────────────────────────────────────────────────
    const stopIds = Array.from(
      new Set(items.flatMap((it) => (it.kind === "bus" ? [it.bus_stop_id] : [])))
    );
    if (stopIds.length > 1) {
      return NextResponse.json(
        { error: "A payment can cover one bus stop's fee." },
        { status: 400 }
      );
    }
    let busFee: { expected: number; academicYearId: string } | null = null;
    if (stopIds.length === 1) {
      const resolved = await resolveExpectedAmount(admin, student_id, { bus_stop_id: stopIds[0] });
      if (!resolved.ok) {
        return NextResponse.json({ error: resolved.error }, { status: resolved.status });
      }
      busFee = { expected: resolved.expected, academicYearId: resolved.academicYearId };
    }

    // Every fee in one collection belongs to one session.
    const years = new Set<string>([
      ...Array.from(structures.values()).map((s) => s.academic_year_id),
      ...(busFee ? [busFee.academicYearId] : []),
    ]);
    if (years.size !== 1) {
      return NextResponse.json(
        { error: "A payment can only cover fees of one session." },
        { status: 400 }
      );
    }
    const academicYearId = Array.from(years)[0];

    const { data: year } = await admin
      .from("academic_years")
      .select("start_date, end_date")
      .eq("id", academicYearId)
      .maybeSingle();
    const yearStart = year?.start_date ? String(year.start_date).slice(0, 10) : null;
    if (busFee && year?.start_date && year?.end_date) {
      const first = String(year.start_date).slice(0, 7);
      const last = String(year.end_date).slice(0, 7);
      const outside = items.find(
        (it) => it.kind === "bus" && (it.month < first || it.month > last)
      );
      if (outside && outside.kind === "bus") {
        return NextResponse.json(
          {
            error: `${formatFeeMonth(outside.month)} is outside this session (${formatFeeMonth(first)} – ${formatFeeMonth(last)}).`,
          },
          { status: 400 }
        );
      }
    }

    // What each item still owes — the over-collection guard, per item.
    const priced = await Promise.all(
      items.map(async (it) => {
        if (it.kind === "fs") {
          const st = structures.get(it.fee_structure_id)!;
          // An instalment is charged once: its month is a label, so count
          // every receipt against it. A legacy recurring row is charged per
          // period and keeps its period scope.
          const recurring = st.frequency === "monthly" || st.frequency === "quarterly";
          const settled = await settledForPeriod(admin, {
            student_id,
            target: { fee_structure_id: st.id },
            month: st.month_label ?? null,
            anyMonth: !recurring,
          });
          return {
            key: `fs:${st.id}`,
            label: feeLineLabel(st),
            due: st.due_date ?? yearStart ?? "",
            remaining: Math.max(0, Math.round((Number(st.amount) - settled) * 100) / 100),
            row: { fee_structure_id: st.id, bus_stop_id: null, month: st.month_label ?? null },
          };
        }
        const settled = await settledForPeriod(admin, {
          student_id,
          target: { bus_stop_id: it.bus_stop_id },
          month: it.month,
        });
        return {
          key: `bus:${it.month}`,
          label: `Transport — ${formatFeeMonth(it.month)}`,
          due: `${it.month}-01`,
          remaining: Math.max(0, Math.round((busFee!.expected - settled) * 100) / 100),
          row: { fee_structure_id: null, bus_stop_id: it.bus_stop_id, month: it.month },
        };
      })
    );
    const allocation = allocateOldestFirst(
      amount_paid,
      priced.map(({ key, label, due, remaining }) => ({ key, label, due, remaining })),
      { one: "fee", many: "fees" }
    );
    if (!allocation.ok) {
      return NextResponse.json({ error: allocation.error }, { status: 400 });
    }
    const byKey = new Map(priced.map((p) => [p.key, p]));
    const slices = allocation.slices.map((sl) => ({
      ...byKey.get(sl.key)!.row,
      amount: sl.amount,
      status: (sl.full ? "paid" : "partial") as "paid" | "partial",
    }));

    // One receipt number for the collection; with several rows each carries
    // it with a /1, /2… suffix, as the day-book import's split rows do.
    const groupId = slices.length > 1 ? randomUUID() : null;
    const buildRows = (receiptBase: string) =>
      slices.map((sl, i) => ({
        student_id,
        fee_structure_id: sl.fee_structure_id,
        bus_stop_id: sl.bus_stop_id,
        academic_year_id: academicYearId,
        amount_paid: sl.amount,
        payment_method,
        month: sl.month,
        receipt_number: slices.length > 1 ? `${receiptBase}/${i + 1}` : receiptBase,
        // Named only when there is a group. A single payment then never
        // depends on migration 139's column, so recording keeps working on a
        // database the migration hasn't reached yet.
        ...(groupId ? { payment_group_id: groupId } : {}),
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
    // A multi-row insert is one statement: every row lands, or none does.
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

    // Back in allocation (oldest-due-first) order — the order the receipt
    // lists them in.
    const ordered = [...payments].sort(
      (a, b) =>
        Number(String(a.receipt_number).split("/")[1] ?? 0) -
        Number(String(b.receipt_number).split("/")[1] ?? 0)
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
