import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { promises as fs } from "fs";
import path from "path";
import { createClient } from "@/lib/supabase/server";
import { canViewReportCard, getReportCardData } from "@/lib/report-card";
import { ReportCardPDF } from "@/components/pdf/ReportCardPDF";
import { getPdfTemplate } from "@/lib/pdf-templates";

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

    if (!studentId || !examTypeId) {
      return NextResponse.json(
        { error: "student_id and exam_type_id are required" },
        { status: 400 }
      );
    }

    const allowed = await canViewReportCard(supabase, user.id, studentId);
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

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
  } catch (err) {
    console.error("Report card PDF error:", err);
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 }
    );
  }
}
