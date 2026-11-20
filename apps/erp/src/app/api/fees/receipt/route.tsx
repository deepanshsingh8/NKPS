import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { promises as fs } from "fs";
import path from "path";
import { createClient } from "@nkps/shared/lib/supabase/server";
import { createAdminClient } from "@nkps/shared/lib/supabase/admin";
import { FeeReceiptPDF } from "@/components/pdf/FeeReceiptPDF";
import { SCHOOL } from "@nkps/shared/lib/constants";
import {
  feeLineLabel,
  formatFeeMonth,
  formatMonthSpan,
  isDiscountPayment,
  paymentDisplayAmount,
} from "@/lib/fees";
import { CORRECTION_COLUMNS } from "@/lib/payment-correction";

export const runtime = "nodejs";

let cachedLogo: Buffer | null = null;
async function loadLogo(): Promise<Buffer | null> {
  if (cachedLogo) return cachedLogo;
  try {
    const logoPath = path.join(process.cwd(), "public", "images", "logo.png");
    cachedLogo = await fs.readFile(logoPath);
    return cachedLogo;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const paymentId = searchParams.get("payment_id");
    if (!paymentId) {
      return NextResponse.json(
        { error: "payment_id is required" },
        { status: 400 }
      );
    }

    // Use admin client so we can always fetch the full joined payload, then
    // enforce authorization ourselves below.
    const admin = createAdminClient();

    const { data: payment, error: payErr } = await admin
      .from("fee_payments")
      .select(
        // `*` rather than a column list: payment_group_id (migration 139) is
        // read when it exists, and a database the migration hasn't reached
        // yet still prints every receipt instead of failing on a missing
        // column.
        "*, fee_structure:fee_structures(fee_type, instalment_name, month_label, academic_year_id, academic_years(name)), bus_stop:bus_stops(name), academic_year:academic_years(name)"
      )
      .eq("id", paymentId)
      .single();

    if (payErr || !payment) {
      // A failed embed or a missing column would otherwise read as "not
      // found" with nothing in the logs to say otherwise.
      if (payErr && payErr.code !== "PGRST116") {
        console.error("Receipt payment query failed:", payErr);
      }
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    // Authorization
    const { data: profile } = await admin
      .from("profiles")
      .select("role, student_id, parent_id")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // "Office bucket": admin always, plus staff (replaces the old editor role)
    // and any teacher granted the `fees` capability. Students/parents follow
    // the owner-student / linked-parent paths below.
    let isAdmin = profile.role === "admin" || profile.role === "staff";
    if (!isAdmin && profile.role === "teacher") {
      const { data: perm } = await admin
        .from("editor_permissions")
        .select("feature_key")
        .eq("editor_id", user.id)
        .eq("feature_key", "fees")
        .maybeSingle();
      if (perm) isAdmin = true;
    }
    const isOwnerStudent =
      profile.role === "student" && profile.student_id === payment.student_id;

    let isLinkedParent = false;
    if (profile.role === "parent" && profile.parent_id) {
      const { data: link } = await admin
        .from("student_parents")
        .select("student_id")
        .eq("parent_id", profile.parent_id)
        .eq("student_id", payment.student_id)
        .maybeSingle();
      isLinkedParent = !!link;
    }

    if (!isAdmin && !isOwnerStudent && !isLinkedParent) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Load student
    const { data: student } = await admin
      .from("students")
      .select("full_name, admission_no, father_name")
      .eq("id", payment.student_id)
      .single();

    if (!student) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    // Resolve class (most recent enrollment)
    const { data: enrollment } = await admin
      .from("student_enrollments")
      .select("roll_number, classes(name, section), academic_years(name)")
      .eq("student_id", payment.student_id)
      .order("enrollment_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const classInfo =
      (enrollment?.classes as unknown as { name: string; section: string } | null) ?? null;
    const classLabel = classInfo
      ? `${classInfo.name}${classInfo.section ? " - " + classInfo.section : ""}`
      : "—";

    const feeStructure = payment.fee_structure as unknown as {
      fee_type: string;
      instalment_name: string | null;
      month_label: string | null;
      academic_years: { name: string } | null;
    } | null;

    const busStop = payment.bus_stop as unknown as {
      name: string;
    } | null;

    // Transport receipts use the stop name as the line description so
    // parents see "100 Feet Road" rather than a generic "Transport".
    // Scheduled fees name the instalment — a receipt reading just "Tuition
    // Fee" can't be told from the other three instalments of the same year.
    const feeTypeLabel = busStop
      ? `Transport — ${busStop.name}`
      : feeStructure
        ? feeLineLabel(feeStructure)
        : "Fee";

    const academicYearName =
      (payment.academic_year as unknown as { name: string } | null)?.name ??
      feeStructure?.academic_years?.name ??
      (enrollment?.academic_years as unknown as { name: string } | null)?.name ??
      "";

    const logoData = await loadLogo();

    // A collection (migration 139) — several bus months, several instalments,
    // or a mix — is one row per fee but one payment: print it as one receipt
    // under the shared receipt number, listing each fee and the total. Not
    // once any row in it has been refunded — then each row's receipt has to
    // tell its own story.
    let collection: {
      receipt_number: string;
      amount: number;
      fee_type: string | null;
      month: string | null;
      lines: Array<{ label: string; amount: number; part: boolean }>;
    } | null = null;
    if (payment.payment_group_id) {
      const { data: groupRows } = await admin
        .from("fee_payments")
        .select(
          "id, month, amount_paid, status, receipt_number, fee_structure_id, bus_stop_id, fee_structure:fee_structures(fee_type, instalment_name), bus_stop:bus_stops(name)"
        )
        .eq("payment_group_id", payment.payment_group_id)
        .eq("student_id", payment.student_id);
      const suffix = (r: { receipt_number: string | null }) =>
        Number(String(r.receipt_number ?? "").split("/")[1] ?? 0);
      const rows = (groupRows ?? []).sort((a, b) => suffix(a) - suffix(b));
      if (rows.length > 1 && rows.every((r) => r.status !== "refunded")) {
        const allBus = rows.every((r) => r.bus_stop_id);
        const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
        collection = {
          receipt_number: String(payment.receipt_number ?? "").replace(/\/\d+$/, ""),
          amount:
            Math.round(rows.reduce((sum, r) => sum + Number(r.amount_paid), 0) * 100) / 100,
          // Bus months alone keep the familiar "Transport — Stop · For April –
          // June 2026"; a mix is listed line by line instead.
          fee_type: allBus ? null : "Several fees (listed below)",
          month: allBus
            ? formatMonthSpan(rows.map((r) => String(r.month ?? "")).filter(Boolean))
            : null,
          lines: rows.map((r) => {
            type FsEmbed = { fee_type: string; instalment_name: string | null };
            const fs = one(r.fee_structure as unknown as FsEmbed | FsEmbed[] | null);
            const stop = one(r.bus_stop as unknown as { name: string } | { name: string }[] | null);
            return {
              label: r.bus_stop_id
                ? `${allBus ? "" : `Transport${stop?.name ? ` (${stop.name})` : ""} — `}${formatFeeMonth(r.month as string | null) ?? "—"}`
                : fs
                  ? feeLineLabel(fs)
                  : "Fee",
              amount: Number(r.amount_paid),
              part: r.status === "partial",
            };
          }),
        };
      }
    }

    // The latest correction of this payment's date, mode, details or month,
    // if any — printed so a re-downloaded receipt says it differs from the
    // one first handed over.
    const { data: auditRows } = await admin
      .from("fee_change_audit_log")
      .select("before_snapshot, after_snapshot, performed_at")
      .eq("target_table", "fee_payments")
      .eq("target_id", payment.id)
      .eq("action", "update")
      .order("performed_at", { ascending: false });
    const correctedAt =
      (auditRows ?? []).find((r) => {
        const before = (r.before_snapshot ?? {}) as Record<string, unknown>;
        const after = (r.after_snapshot ?? {}) as Record<string, unknown>;
        return CORRECTION_COLUMNS.some(
          (c) => JSON.stringify(before[c] ?? null) !== JSON.stringify(after[c] ?? null)
        );
      })?.performed_at ?? null;

    const buffer = await renderToBuffer(
      <FeeReceiptPDF
        school={{
          name: SCHOOL.name,
          addressLine: SCHOOL.address.full,
          affiliation: SCHOOL.affiliation,
          affiliationNumber: SCHOOL.affiliationNumber,
          phone: SCHOOL.phone[0],
          email: SCHOOL.email[0],
        }}
        logoData={logoData ?? undefined}
        data={{
          receipt_number:
            collection?.receipt_number ??
            payment.receipt_number ??
            payment.id.slice(0, 8).toUpperCase(),
          payment_date: payment.payment_date,
          fee_type: collection?.fee_type ?? feeTypeLabel,
          // A discount's value lives in waiver_amount; its amount_paid is 0.
          amount: collection?.amount ?? paymentDisplayAmount(payment),
          payment_method: payment.payment_method,
          month: collection?.month ?? formatFeeMonth(payment.month),
          academic_year: academicYearName,
          status: payment.status,
          refund_amount: payment.refund_amount != null ? Number(payment.refund_amount) : null,
          refund_reason: payment.refund_reason ?? null,
          refunded_at: payment.refunded_at ?? null,
          remarks:
            payment.remarks ??
            (isDiscountPayment(payment) ? payment.waiver_reason ?? null : null),
          lines: collection?.lines ?? null,
          cheque_number: payment.cheque_number ?? null,
          cheque_date: payment.cheque_date ?? null,
          bank_name: payment.bank_name ?? null,
          payer_name: payment.payer_name ?? null,
          transaction_ref: payment.transaction_ref ?? null,
          payment_provider: payment.payment_provider ?? null,
          corrected_at: (correctedAt as string | null) ?? null,
          student: {
            full_name: student.full_name,
            admission_no: student.admission_no,
            father_name: student.father_name,
            class_label: classLabel,
            roll_number: enrollment?.roll_number ?? null,
          },
        }}
      />
    );

    // Both parts sanitised: imported receipts carry the source sheet's text
    // in their number, and a quote or a non-Latin-1 character there would
    // corrupt the header or make the Headers constructor throw.
    const safe = (s: string) => s.replace(/[^\w\-]+/g, "_");
    const filename = `fee-receipt_${safe(payment.receipt_number ?? paymentId)}_${safe(student.full_name)}.pdf`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        // attachment: the buttons say Download, and every caller saves the
        // file rather than opening a viewer tab.
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("Receipt PDF error:", err);
    return NextResponse.json(
      { error: "Failed to generate receipt" },
      { status: 500 }
    );
  }
}
