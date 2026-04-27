import { NextRequest, NextResponse } from "next/server";
import { verifyAdminOrEditor } from "@nkps/shared/lib/verify-admin";

// Buckets the admin UI is allowed to upload to. Any other bucket (e.g. a
// future "private-uploads" or "internal") would need an explicit entry here
// before this endpoint will sign for it.
//
// Allowed extensions per bucket are intentionally narrow — admins should
// upload finished assets, not arbitrary files. Add more here when a real
// product use case appears, not preemptively.
const BUCKET_RULES: Record<string, { exts: string[]; description: string }> = {
  gallery: {
    exts: ["jpg", "jpeg", "png", "webp"],
    description: "gallery images",
  },
  "site-media": {
    exts: ["jpg", "jpeg", "png", "webp", "svg"],
    description: "site media assets",
  },
  "transfer-certificates": {
    exts: ["pdf"],
    description: "transfer certificate PDFs",
  },
  staff: {
    exts: ["jpg", "jpeg", "png", "webp"],
    description: "staff profile photos",
  },
  avatars: {
    exts: ["jpg", "jpeg", "png", "webp"],
    description: "user avatars",
  },
  "disclosure-documents": {
    exts: ["pdf"],
    description: "mandatory public disclosure PDFs",
  },
  articles: {
    exts: ["jpg", "jpeg", "png", "webp"],
    description: "article cover images",
  },
};

function fileExtension(name: string): string | null {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1]! : null;
}

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

    if (typeof bucket !== "string" || typeof fileName !== "string") {
      return NextResponse.json(
        { error: "bucket and fileName must be strings" },
        { status: 400 }
      );
    }

    const rule = BUCKET_RULES[bucket];
    if (!rule) {
      return NextResponse.json(
        { error: `Uploads to '${bucket}' are not allowed` },
        { status: 403 }
      );
    }

    // Reject path traversal and absolute paths up front. Storage paths must
    // be a flat filename or a forward-slash path with no `..` segments.
    if (
      fileName.includes("..") ||
      fileName.startsWith("/") ||
      fileName.includes("\\")
    ) {
      return NextResponse.json(
        { error: "Invalid fileName" },
        { status: 400 }
      );
    }

    const ext = fileExtension(fileName);
    if (!ext || !rule.exts.includes(ext)) {
      return NextResponse.json(
        {
          error: `'${ext ?? "?"}' isn't a permitted extension for ${rule.description}. Allowed: ${rule.exts.join(", ")}`,
        },
        { status: 415 }
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
