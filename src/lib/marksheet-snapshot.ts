// Snapshot builder for finalized marksheets (Phase 5).
//
// A "snapshot" captures everything the ReportCardPDF component needs to
// render a single student's report card for a specific (class, exam) pair.
// Once finalized, the PDF route serves from the snapshot so future mark
// edits don't mutate distributed marksheets.
//
// Schema version bumps whenever the shape changes; the renderer branches on
// version to stay backward-compatible with older saved snapshots.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ReportCardAttendance,
  ReportCardExamGroup,
  ReportCardStudent,
} from "@/lib/report-card";
import { getReportCardData } from "@/lib/report-card";
import { getPdfTemplate } from "@/lib/pdf-templates";
import type { PdfFooter } from "@/lib/pdf-templates";

export const MARKSHEET_SCHEMA_VERSION = "v1";

export interface MarksheetSnapshotSchool {
  name: string;
  addressLine: string;
  affiliation: string;
  affiliationNumber: string;
}

export interface MarksheetSnapshotV1 {
  schema_version: "v1";
  student: ReportCardStudent;
  exam: ReportCardExamGroup;
  attendance: ReportCardAttendance | null;
  school: MarksheetSnapshotSchool;
  footer: PdfFooter;
  generated_on_iso: string;
}

/**
 * Build a snapshot for a single student × exam. Returns null when there's
 * no matching data (e.g. student has no published marks yet — the caller
 * should skip rather than store an empty snapshot).
 */
export async function buildMarksheetSnapshot(
  supabase: SupabaseClient,
  studentId: string,
  examTypeId: string
): Promise<MarksheetSnapshotV1 | null> {
  // includeUnpublished=true so finalize works before online publish happens
  // (admin flow: generate official printed marksheets ahead of portal release).
  const data = await getReportCardData(supabase, studentId, null, {
    includeUnpublished: true,
  });
  if (!data) return null;

  const exam = data.exams.find((e) => e.exam_type_id === examTypeId);
  if (!exam) return null;

  const { header, footer } = await getPdfTemplate(supabase, "report_card");

  return {
    schema_version: "v1",
    student: data.student,
    exam,
    attendance: data.attendance,
    school: {
      name: header.school_name,
      addressLine: header.address_line,
      affiliation: header.affiliation ?? "",
      affiliationNumber: header.affiliation_number ?? "",
    },
    footer,
    generated_on_iso: new Date().toISOString(),
  };
}
