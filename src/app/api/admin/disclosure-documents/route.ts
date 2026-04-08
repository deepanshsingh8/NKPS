import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { verifyAdmin } from "@/lib/verify-admin";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Failed to parse upload" },
      { status: 400 }
    );
  }

  try {
    const file = formData.get("file") as File | null;
    const docKey = formData.get("docKey") as string | null;

    if (!file || !docKey) {
      return NextResponse.json(
        { error: "Missing file or docKey" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Max 10MB." },
        { status: 400 }
      );
    }

    // Find the existing document row
    const { data: existing } = await admin
      .from("disclosure_documents")
      .select("id, file_url")
      .eq("doc_key", docKey)
      .single();

    if (!existing) {
      return NextResponse.json(
        { error: "Document slot not found" },
        { status: 404 }
      );
    }

    // Delete old file from storage if replacing
    if (existing.file_url) {
      const oldParts = existing.file_url.split("/");
      const oldFileName = oldParts[oldParts.length - 1];
      await admin.storage.from("disclosure-documents").remove([oldFileName]);
    }

    // Upload new file
    const fileExt = file.name.split(".").pop()?.toLowerCase() || "pdf";
    const fileName = `${docKey}-${Date.now()}.${fileExt}`;

    const fileBuffer = await file.arrayBuffer();
    const { error: uploadError } = await admin.storage
      .from("disclosure-documents")
      .upload(fileName, fileBuffer, {
        contentType: file.type || "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      console.error("Disclosure document upload error:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload file" },
        { status: 500 }
      );
    }

    const {
      data: { publicUrl },
    } = admin.storage.from("disclosure-documents").getPublicUrl(fileName);

    // Update the document row
    const { error: updateError } = await admin
      .from("disclosure_documents")
      .update({
        file_url: publicUrl,
        file_name: file.name,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (updateError) {
      console.error("Disclosure document DB update error:", updateError);
      return NextResponse.json(
        { error: "Failed to save document record" },
        { status: 500 }
      );
    }

    revalidatePath("/mandatory-public-disclosure");
    return NextResponse.json({ success: true, file_url: publicUrl });
  } catch (err) {
    console.error("[Disclosure Document Upload Error]", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id, fileUrl } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    // Remove file from storage
    if (fileUrl) {
      const parts = (fileUrl as string).split("/");
      const fileName = parts[parts.length - 1];
      await admin.storage.from("disclosure-documents").remove([fileName]);
    }

    // Clear file_url and file_name on the row (keep the row itself)
    const { error } = await admin
      .from("disclosure_documents")
      .update({
        file_url: null,
        file_name: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      console.error("Disclosure document delete error:", error);
      return NextResponse.json(
        { error: "Failed to clear document" },
        { status: 500 }
      );
    }

    revalidatePath("/mandatory-public-disclosure");
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
