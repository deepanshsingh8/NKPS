import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { promises as fs } from "fs";
import path from "path";
import { createClient } from "@/lib/supabase/server";
import { canViewReportCard, getReportCardData } from "@/lib/report-card";
import type { ReportCardExamGroup } from "@/lib/report-card";
import { ReportCardPDF } from "@/components/pdf/ReportCardPDF";
import { getPdfTemplate } from "@/lib/pdf-templates";
import {
  computeFinalResult,
  computeRanksForClass,
} from "@/lib/final-result";
import type { FinalResult } from "@/types";

export const runtime = "nodejs";

// Cache the logo bytes across invocations in the same Node process.
let cachedLogo: Buffer | null = null;
async function loadLogo(): Promise<Buffer | null> {
  if (cachedLogo) return cachedLogo;
  try {
    const logoPath = path.join(process.cwd(), "public", "images", "logo.png");
    cachedLogo = await fs.readFile(logoPath);
    return cachedLogo;
  } catch (err) {
    console.warn("Report card: logo not found, PDF will render without it", err);
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
    const studentId = searchParams.get("student_id");
    const examTypeId = searchParams.get("exam_type_id");
    const academicYearId = searchParams.get("academic_year_id");

    if (!studentId) {
      return NextResponse.json(
        { error: "student_id is required" },
        { status: 400 }
      );
    }

    // Mode selection: legacy if exam_type_id is present, final-result if
    // academic_year_id is present without exam_type_id. At least one scope
    // must be specified.
    if (!examTypeId && !academicYearId) {
      return NextResponse.json(
        {
          error:
            "Either exam_type_id (legacy per-exam) or academic_year_id (final-result) is required",
        },
        { status: 400 }
      );
    }

    const allowed = await canViewReportCard(supabase, user.id, studentId);
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const generatedOn = new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const logoData = await loadLogo();
    const { header, footer } = await getPdfTemplate(supabase, "report_card");

    // =============================================================
    // Legacy mode — byte-identical to the pre-Phase-3 path.
    // =============================================================
    if (examTypeId) {
      const data = await getReportCardData(supabase, studentId, academicYearId);
      if (!data) {
        return NextResponse.json({ error: "Student not found" }, { status: 404 });
      }

      const exam = data.exams.find((e) => e.exam_type_id === examTypeId);
      if (!exam) {
        return NextResponse.json(
          { error: "No published results for this exam" },
          { status: 404 }
        );
      }

      const buffer = await renderToBuffer(
        <ReportCardPDF
          school={{
            name: header.school_name,
            addressLine: header.address_line,
            affiliation: header.affiliation ?? "",
            affiliationNumber: header.affiliation_number ?? "",
          }}
          student={data.student}
          exam={exam}
          attendance={data.attendance}
          logoData={logoData ?? undefined}
          generatedOn={generatedOn}
          footer={footer}
        />
      );

      const safeName = data.student.name.replace(/[^\w\-]+/g, "_");
      const safeExam = exam.exam_type_name.replace(/[^\w\-]+/g, "_");
      const filename = `report-card_${safeName}_${safeExam}.pdf`;

      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "private, no-store",
        },
      });
    }

    // =============================================================
    // Final-result mode — Phase 3.
    // =============================================================
    // Non-null assertion guard: academicYearId is guaranteed present here
    // (400 guard above rejects the both-absent case, legacy branch handles
    // examTypeId).
    const yearId = academicYearId!;

    // Resolve active enrollment for this (student, year). Missing enrollment
    // = 404 since we can't locate the student's class for this year.
    const { data: enrollment } = await supabase
      .from("student_enrollments")
      .select("class_id")
      .eq("student_id", studentId)
      .eq("academic_year_id", yearId)
      .eq("status", "active")
      .maybeSingle();

    if (!enrollment?.class_id) {
      return NextResponse.json(
        { error: "No active enrollment for this student in the given academic year" },
        { status: 404 }
      );
    }
    const classId = enrollment.class_id as string;

    // Load result_master for this (class, year). Missing → clearer 400 than
    // silently falling back to legacy, since caller didn't supply an exam.
    const { data: masterRow } = await supabase
      .from("result_masters")
      .select(
        "id, include_non_scholastic, non_scholastic_placement, show_extra_separately, show_rank"
      )
      .eq("class_id", classId)
      .eq("academic_year_id", yearId)
      .maybeSingle();

    if (!masterRow) {
      return NextResponse.json(
        {
          error:
            "No result master configured for this class/year — specify exam_type_id for a legacy per-exam report card.",
        },
        { status: 400 }
      );
    }

    // Compute final result for this student. Null = no recorded marks OR
    // config has zero main subjects (both surface as the same empty state).
    const finalResult = await computeFinalResult(supabase, {
      student_id: studentId,
      academic_year_id: yearId,
    });

    if (!finalResult) {
      return NextResponse.json(
        { error: "No results recorded for this student" },
        { status: 404 }
      );
    }

    // Attach rank only when the master opts in (N+1 cohort compute is
    // expensive; skip when not needed).
    let enriched: FinalResult = finalResult;
    if (masterRow.show_rank) {
      const ranks = await computeRanksForClass(supabase, {
        class_id: classId,
        academic_year_id: yearId,
      });
      const rank = ranks.get(studentId) ?? null;
      enriched = { ...finalResult, rank };
    }

    // Reuse getReportCardData for student header + attendance. Re-fetching
    // `.exams` here is a minor (~20ms) duplication versus the dedicated
    // compute above; keeps the diff minimal. Flagged as a follow-up.
    const data = await getReportCardData(supabase, studentId, yearId);
    if (!data) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    // The PDF component still requires an `exam` prop (drives the
    // class-teacher remark block and Document title fallback). For
    // final-result mode we synthesize a virtual group — no single exam is
    // the "final" source of truth.
    const virtualExam: ReportCardExamGroup = {
      exam_type_id: "__final_result__",
      exam_type_name: "Final Result",
      sort_order: 0,
      subjects: [],
      total_obtained: 0,
      total_max: 0,
      percentage: 0,
      overall_grade: enriched.overall.grade ?? "",
      remark: null,
    };

    // Resolve the academic year label for the filename.
    const { data: yearRow } = await supabase
      .from("academic_years")
      .select("label")
      .eq("id", yearId)
      .maybeSingle();
    const yearLabel = (yearRow?.label as string | undefined) ?? "year";

    const resultMasterProp = {
      include_non_scholastic: Boolean(masterRow.include_non_scholastic),
      non_scholastic_placement: masterRow.non_scholastic_placement as
        | "below"
        | "above"
        | "separate_page",
      show_extra_separately: Boolean(masterRow.show_extra_separately),
      show_rank: Boolean(masterRow.show_rank),
    };

    const buffer = await renderToBuffer(
      <ReportCardPDF
        school={{
          name: header.school_name,
          addressLine: header.address_line,
          affiliation: header.affiliation ?? "",
          affiliationNumber: header.affiliation_number ?? "",
        }}
        student={data.student}
        exam={virtualExam}
        attendance={data.attendance}
        logoData={logoData ?? undefined}
        generatedOn={generatedOn}
        footer={footer}
        finalResult={enriched}
        resultMaster={resultMasterProp}
      />
    );

    const safeName = data.student.name.replace(/[^\w\-]+/g, "_");
    const safeYear = yearLabel.replace(/[^\w\-]+/g, "_");
    const filename = `report-card_${safeName}_final-result_${safeYear}.pdf`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("Report card PDF error:", err);
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 }
    );
  }
}
