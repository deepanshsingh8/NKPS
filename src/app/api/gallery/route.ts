import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/verify-admin";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file

export async function POST(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to parse upload: ${msg}. Try uploading fewer or smaller images.` },
      { status: 400 }
    );
  }

  try {
    const files = formData.getAll("files") as File[];
    const altText = formData.get("alt") as string;
    const category = formData.get("category") as string;
    const currentCount = parseInt(formData.get("currentCount") as string) || 0;
    const galleryEventId = formData.get("gallery_event_id") as string | null;

    if (!files.length || !altText || !category) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const results = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Skip files that are too large
      if (file.size > MAX_FILE_SIZE) {
        results.push({
          name: file.name,
          success: false,
          error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 10MB.`,
        });
        continue;
      }

      const fileExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const fileName = `${Date.now()}-${i}.${fileExt}`;

      // Convert File to ArrayBuffer for reliable upload
      let fileBuffer: ArrayBuffer;
      try {
        fileBuffer = await file.arrayBuffer();
      } catch {
        results.push({
          name: file.name,
          success: false,
          error: "Failed to read file data",
        });
        continue;
      }

      // Upload to storage using admin client
      const { error: uploadError } = await admin.storage
        .from("gallery")
        .upload(fileName, fileBuffer, {
          contentType: file.type || "image/jpeg",
          upsert: false,
        });

      if (uploadError) {
        console.error("Gallery storage upload error:", uploadError);
        results.push({
          name: file.name,
          success: false,
          error: "Failed to upload image",
        });
        continue;
      }

      const {
        data: { publicUrl },
      } = admin.storage.from("gallery").getPublicUrl(fileName);

      // Insert into database using admin client (bypasses RLS)
      const { error: insertError } = await admin
        .from("gallery_images")
        .insert({
          src: publicUrl,
          alt: files.length > 1 ? `${altText} ${i + 1}` : altText,
          category,
          sort_order: currentCount + i,
          gallery_event_id: galleryEventId || null,
        });

      if (insertError) {
        console.error("Gallery DB insert error:", insertError);
        results.push({
          name: file.name,
          success: false,
          error: "Failed to save image record",
        });
        continue;
      }

      results.push({ name: file.name, success: true });
    }

    const allSucceeded = results.every((r) => r.success);
    return NextResponse.json(
      { results, success: allSucceeded },
      { status: allSucceeded ? 200 : 207 }
    );
  } catch (err) {
    console.error("[Gallery Upload Error]", err);
    return NextResponse.json(
      { error: "Upload failed" },
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
    const { id, src } = await request.json();

    // Extract file name from URL for storage deletion
    const urlParts = (src as string).split("/");
    const fileName = urlParts[urlParts.length - 1];

    await admin.storage.from("gallery").remove([fileName]);

    const { error } = await admin
      .from("gallery_images")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Gallery delete DB error:", error);
      return NextResponse.json({ error: "Failed to delete image" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
