import { NextRequest, NextResponse } from "next/server";
import { verifyAdminOrEditor } from "@/lib/verify-admin";

export async function POST(request: NextRequest) {
  const admin = await verifyAdminOrEditor();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { bucket, fileName } = await request.json();

    if (!bucket || !fileName) {
      return NextResponse.json(
        { error: "Missing bucket or fileName" },
        { status: 400 }
      );
    }

    const { data, error } = await admin.storage
      .from(bucket)
      .createSignedUploadUrl(fileName);

    if (error) {
      console.error("Signed upload URL error:", error);
      return NextResponse.json(
        { error: "Failed to create upload URL" },
        { status: 500 }
      );
    }

    // Build public URL for after upload completes
    const {
      data: { publicUrl },
    } = admin.storage.from(bucket).getPublicUrl(fileName);

    return NextResponse.json({
      signedUrl: data.signedUrl,
      token: data.token,
      path: data.path,
      publicUrl,
    });
  } catch {
    return NextResponse.json(
      { error: "Unexpected error" },
      { status: 500 }
    );
  }
}
