import { NextRequest, NextResponse } from "next/server";
import { verifyAdminOrEditor } from "@/lib/verify-admin";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const admin = await verifyAdminOrEditor("transfer_certificates");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { url, studentName, academicYear, admissionNo, studentId } =
      await request.json();

    if (!url || !studentName || !academicYear) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const linkedStudentId =
      typeof studentId === "string" && UUID_RE.test(studentId) ? studentId : null;

    // If a student is linked, resolve their active enrollment up front so we
    // can both record class context on the TC and close the student afterwards.
    let activeEnrollmentId: string | null = null;
    if (linkedStudentId) {
      const { data: student, error: studentErr } = await admin
        .from("students")
        .select("id")
        .eq("id", linkedStudentId)
        .maybeSingle();
      if (studentErr || !student) {
        return NextResponse.json(
          { error: "Linked student not found" },
          { status: 400 }
        );
      }

      const { data: enrollment } = await admin
        .from("student_enrollments")
        .select("id, status")
        .eq("student_id", linkedStudentId)
        .eq("status", "active")
        .order("enrollment_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      activeEnrollmentId = enrollment?.id ?? null;
    }

    const { error: insertError } = await admin
      .from("transfer_certificates")
      .insert({
        student_id: linkedStudentId,
        student_name: studentName,
        admission_no: admissionNo || null,
        file_url: url,
        academic_year: academicYear,
        upload_date: new Date().toISOString().split("T")[0],
      });

    if (insertError) {
      console.error("TC DB insert error:", insertError);
      return NextResponse.json(
        { error: "Failed to save certificate record" },
        { status: 500 }
      );
    }

    // TC saved. If linked to a student, close the student record:
    // mark inactive + terminate the active enrollment. Failures here are
    // logged but don't fail the request — admin can re-run status update
    // from the students page if needed.
    let studentClosed = false;
    if (linkedStudentId) {
      const { error: studentUpdateErr } = await admin
        .from("students")
        .update({ is_active: false })
        .eq("id", linkedStudentId);

      if (studentUpdateErr) {
        console.error("TC: failed to mark student inactive:", studentUpdateErr);
      } else if (activeEnrollmentId) {
        const { error: enrollmentErr } = await admin
          .from("student_enrollments")
          .update({ status: "terminated" })
          .eq("id", activeEnrollmentId);
        if (enrollmentErr) {
          console.error(
            "TC: failed to terminate enrollment:",
            enrollmentErr
          );
        } else {
          studentClosed = true;
        }
      } else {
        // No active enrollment to terminate, but student is now inactive.
        studentClosed = true;
      }
    }

    return NextResponse.json({ success: true, studentClosed });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const admin = await verifyAdminOrEditor("transfer_certificates");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id, fileUrl } = await request.json();

    const urlParts = (fileUrl as string).split("/");
    const fileName = urlParts[urlParts.length - 1];

    await admin.storage.from("transfer-certificates").remove([fileName]);

    const { error } = await admin
      .from("transfer_certificates")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("TC delete DB error:", error);
      return NextResponse.json({ error: "Failed to delete certificate" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
