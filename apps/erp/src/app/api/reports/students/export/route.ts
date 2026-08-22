import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@nkps/shared/lib/supabase/server";
import { createAdminClient } from "@nkps/shared/lib/supabase/admin";
import { contentDispositionAttachment, csvEscape } from "@nkps/shared/lib/utils";
import {
  reportFiltersSchema,
  REPORT_EXPORT_FORMATS,
  type ReportExportFormat,
} from "@nkps/shared/lib/report-filters";
import {
  resolveFields,
  applyFieldVisibility,
} from "@nkps/shared/lib/report-fields";
import { runStudentReport, toMatrix, ReportQueryError } from "@/lib/report-query";

export const runtime = "nodejs";

/**
 * POST /api/reports/students/export?format=csv|xlsx
 *
 * ── Why this route authenticates by hand ────────────────────────────────────
 * `verifyAdminOrEditor` reads a bearer token from the Authorization header. A
 * file download is a form post or a plain navigation, which carries cookies
 * and no bearer token, so that helper would return null for a perfectly valid
 * admin. This is the same cookie-client + explicit editor_permissions lookup
 * that /api/green-sheet/csv uses, with the query then run on the service-role
 * client because the underlying tables have no editor SELECT policy.
 *
 * POST rather than GET: the filter set plus a 100-key field list does not fit
 * comfortably in a URL, and putting a student name search in a query string
 * writes it into access logs.
 */
export async function POST(request: Request) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, must_change_password")
    .eq("id", user.id)
    .single();
  if (!profile || profile.must_change_password) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const isAdmin = profile.role === "admin";
  if (!isAdmin) {
    const { data: perm } = await supabase
      .from("editor_permissions")
      .select("feature_key")
      .eq("editor_id", user.id)
      .eq("feature_key", "reports")
      .maybeSingle();
    if (!perm) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // ── Request ───────────────────────────────────────────────────────────────
  const format = (new URL(request.url).searchParams.get("format") ??
    "csv") as ReportExportFormat;
  if (!REPORT_EXPORT_FORMATS.includes(format) || format === "pdf") {
    return NextResponse.json(
      { error: `Unsupported format: ${format}` },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = reportFiltersSchema.safeParse(
    (body as { filters?: unknown })?.filters ?? body
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid report request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const filters = parsed.data;
  const fields = applyFieldVisibility(resolveFields(filters.fields), isAdmin);

  // ── Run ───────────────────────────────────────────────────────────────────
  let result;
  try {
    // Service-role: `students` and `student_enrollments` have no editor SELECT
    // policy, so a cookie-scoped read returns an empty sheet rather than an
    // error — the failure mode audit #29 documented on the green sheet.
    result = await runStudentReport(createAdminClient(), filters, fields);
  } catch (err) {
    if (err instanceof ReportQueryError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[reports.students.export]", err);
    return NextResponse.json({ error: "Failed to run report" }, { status: 500 });
  }

  const { headers, body: cells } = toMatrix(result.rows, fields);

  // Audit trail. One screen can export the entire student master, so who ran
  // what, over how many rows, is worth a line in the log even before a
  // dedicated table exists.
  console.info(
    "[reports.students.export]",
    JSON.stringify({
      actor: user.id,
      admin: isAdmin,
      session: result.session.name,
      format,
      columns: fields.map((f) => f.key),
      rows: result.total,
    })
  );

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `student-report-${result.session.name}-${stamp}`;

  if (format === "csv") {
    // csvEscape, not manual quoting: it also neutralises leading = + - @, and
    // student names and addresses are attacker-controllable via bulk import.
    const lines = [
      headers.map(csvEscape).join(","),
      ...cells.map((row) => row.map(csvEscape).join(",")),
    ];
    // BOM so Excel opens UTF-8 names (Hindi, diacritics) correctly instead of
    // rendering them as mojibake.
    return new NextResponse(`﻿${lines.join("\r\n")}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": contentDispositionAttachment(`${filename}.csv`),
        "Cache-Control": "no-store",
      },
    });
  }

  // xlsx
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...cells]);
  sheet["!cols"] = fields.map((f) => ({ wch: f.width ?? 14 }));
  // Freeze the header row — a 100-column report is unreadable without it.
  sheet["!freeze"] = { xSplit: "0", ySplit: "1" };
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Students");
  const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": contentDispositionAttachment(`${filename}.xlsx`),
      "Cache-Control": "no-store",
    },
  });
}
