import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/verify-admin";

export async function POST(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const studentName = formData.get("studentName") as string;
    const academicYear = formData.get("academicYear") as string;
    const admissionNo = formData.get("admissionNo") as string | null;

    if (!file || !studentName || !academicYear) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const fileName = `${Date.now()}-${studentName.replace(/\s+/g, "-").toLowerCase()}.pdf`;

    const { error: uploadError } = await admin.storage
      .from("transfer-certificates")
      .upload(fileName, file);

    if (uploadError) {
      console.error("TC storage upload error:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload certificate" },
        { status: 500 }
      );
    }

    const {
      data: { publicUrl },
    } = admin.storage.from("transfer-certificates").getPublicUrl(fileName);

    const { error: insertError } = await admin
      .from("transfer_certificates")
      .insert({
        student_name: studentName,
        admission_no: admissionNo || null,
        file_url: publicUrl,
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

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const admin = await verifyAdmin();
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
