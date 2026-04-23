import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { promises as fs } from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { verifyAdminOrEditor } from "@/lib/verify-admin";
import { TransferCertificatePDF } from "@/components/pdf/TransferCertificatePDF";
import { SCHOOL } from "@/lib/constants";

export const runtime = "nodejs";

let cachedLogo: Buffer | null = null;
async function loadLogo(): Promise<Buffer | null> {
  if (cachedLogo) return cachedLogo;
  try {
    const logoPath = path.join(process.cwd(), "public", "images", "logo.png");
    cachedLogo = await fs.readFile(logoPath);
    return cachedLogo;
  } catch (err) {
    console.warn("TC: logo not found", err);
    return null;
  }
}

function generateTcNumber(): string {
  const year = new Date().getFullYear();
  const bytes = randomBytes(3);
  const digits = ((bytes[0] << 16) | (bytes[1] << 8) | bytes[2]) % 900000 + 100000;
  return `TC-${year}-${digits}`;
}

function slugify(v: string): string {
  return v
    .replace(/[^\w]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "student";
}

export async function POST(request: NextRequest) {
  const admin = await verifyAdminOrEditor("transfer_certificates");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const student_id = typeof body.student_id === "string" ? body.student_id : null;
  const reason_for_leaving =
    typeof body.reason_for_leaving === "string" ? body.reason_for_leaving.trim() : "";
  const conduct = typeof body.conduct === "string" ? body.conduct.trim() : "Good";
  const last_attended_date =
    typeof body.last_attended_date === "string" ? body.last_attended_date : null;
  const remarks = typeof body.remarks === "string" ? body.remarks.trim() : "";
  const issue_date_input =
    typeof body.issue_date === "string" && body.issue_date
      ? body.issue_date
      : new Date().toISOString().split("T")[0];

  if (!student_id) {
    return NextResponse.json({ error: "student_id is required" }, { status: 400 });
  }
  if (!reason_for_leaving) {
    return NextResponse.json(
      { error: "reason_for_leaving is required" },
      { status: 400 }
    );
  }
  if (!last_attended_date) {
    return NextResponse.json(
      { error: "last_attended_date is required" },
      { status: 400 }
    );
  }

  // Load student
  const { data: student, error: studentErr } = await admin
    .from("students")
    .select("*")
    .eq("id", student_id)
    .single();

  if (studentErr || !student) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  // Load most recent enrollment (for class + academic year)
  const { data: enrollment } = await admin
    .from("student_enrollments")
    .select(
      "id, status, class_id, academic_year_id, classes(name, section), academic_years(name)"
    )
    .eq("student_id", student_id)
    .order("enrollment_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const classInfo = enrollment?.classes as unknown as
    | { name: string; section: string }
    | null;
  const classLabel = classInfo
    ? `${classInfo.name}${classInfo.section ? " - " + classInfo.section : ""}`
    : student.admission_class ?? "—";

  const academicYear =
    (enrollment?.academic_years as unknown as { name: string } | null)?.name ??
    (typeof body.academic_year === "string" ? body.academic_year : "");

  if (!academicYear) {
    return NextResponse.json(
      { error: "Academic year could not be determined" },
      { status: 400 }
    );
  }

  const tc_number = generateTcNumber();

  const logoData = await loadLogo();

  const pdfBuffer = await renderToBuffer(
    <TransferCertificatePDF
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
        tc_number,
        issue_date: issue_date_input,
        academic_year: academicYear,
        student: {
          full_name: student.full_name,
          admission_no: student.admission_no,
          father_name: student.father_name,
          mother_name: student.mother_name,
          date_of_birth: student.date_of_birth,
          gender: student.gender,
          category: student.category,
          religion: student.religion,
          nationality: student.nationality,
          aadhar_number: student.aadhar_number,
          admission_date: student.admission_date,
          previous_school: student.previous_school,
          class_last_attended: classLabel,
          last_attended_date,
          reason_for_leaving,
          conduct: conduct || "Good",
          remarks: remarks || null,
        },
      }}
    />
  );

  // Upload PDF to Supabase Storage
  const fileName = `${tc_number}-${slugify(student.full_name)}.pdf`;
  const upload = await admin.storage
    .from("transfer-certificates")
    .upload(fileName, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (upload.error) {
    console.error("TC storage upload error:", upload.error);
    return NextResponse.json(
      { error: "Failed to upload TC PDF" },
      { status: 500 }
    );
  }

  const { data: publicUrlData } = admin.storage
    .from("transfer-certificates")
    .getPublicUrl(fileName);

  const file_url = publicUrlData.publicUrl;

  // Insert transfer_certificates row (this auto-publishes to public page)
  const { data: tcRow, error: insertErr } = await admin
    .from("transfer_certificates")
    .insert({
      student_id,
      student_name: student.full_name,
      admission_no: student.admission_no,
      file_url,
      academic_year: academicYear,
      upload_date: issue_date_input,
      tc_number,
      issue_date: issue_date_input,
      last_attended_date,
      reason_for_leaving,
      conduct: conduct || "Good",
      class_last_attended: classLabel,
      remarks: remarks || null,
      is_generated: true,
    })
    .select()
    .single();

  if (insertErr) {
    console.error("TC row insert error:", insertErr);
    // Best-effort cleanup
    await admin.storage.from("transfer-certificates").remove([fileName]);
    return NextResponse.json(
      { error: "Failed to save TC record" },
      { status: 500 }
    );
  }

  // Close the student record: mark inactive + terminate active enrollment
  await admin.from("students").update({ is_active: false }).eq("id", student_id);

  if (enrollment?.id && enrollment.status === "active") {
    await admin
      .from("student_enrollments")
      .update({ status: "terminated" })
      .eq("id", enrollment.id);
  }

  return NextResponse.json({
    success: true,
    tc: tcRow,
    file_url,
  });
}
