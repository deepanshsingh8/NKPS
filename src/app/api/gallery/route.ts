import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/verify-admin";

export async function POST(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const altText = formData.get("alt") as string;
    const category = formData.get("category") as string;
    const currentCount = parseInt(formData.get("currentCount") as string) || 0;

    if (!files.length || !altText || !category) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const results = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}-${i}.${fileExt}`;

      // Upload to storage using admin client
      const { error: uploadError } = await admin.storage
        .from("gallery")
        .upload(fileName, file);

      if (uploadError) {
        results.push({
          name: file.name,
          success: false,
          error: `Storage: ${uploadError.message}`,
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
        });

      if (insertError) {
        results.push({
          name: file.name,
          success: false,
          error: `Database: ${insertError.message}`,
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
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
