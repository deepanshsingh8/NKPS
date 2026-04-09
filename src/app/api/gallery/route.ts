import { NextRequest, NextResponse } from "next/server";
import { verifyAdminOrEditor } from "@/lib/verify-admin";

export async function POST(request: NextRequest) {
  const admin = await verifyAdminOrEditor();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { url, alt, category, currentCount = 0, gallery_event_id } = await request.json();

    if (!url || !alt || !category) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const { error: insertError } = await admin
      .from("gallery_images")
      .insert({
        src: url,
        alt,
        category,
        sort_order: currentCount,
        gallery_event_id: gallery_event_id || null,
      });

    if (insertError) {
      console.error("Gallery DB insert error:", insertError);
      return NextResponse.json(
        { error: "Failed to save image record" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, src: url });
  } catch (err) {
    console.error("[Gallery Upload Error]", err);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const admin = await verifyAdminOrEditor();
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
