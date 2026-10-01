import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { createAdminClient } from "@nkps/shared/lib/supabase/admin";
import { sniffUpload } from "@nkps/shared/lib/file-sniff";

export async function POST(request: NextRequest) {
  try {
    const headersList = await headers();
    const authHeader = headersList.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accessToken = authHeader.slice(7);
    const admin = createAdminClient();

    const {
      data: { user },
      error: authError,
    } = await admin.auth.getUser(accessToken);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fail closed while a forced password change is pending, matching the
    // verifyAdmin* helpers — a user mid-onboarding shouldn't be writing data.
    const { data: profile } = await admin
      .from("profiles")
      .select("must_change_password")
      .eq("id", user.id)
      .single();
    if (profile?.must_change_password) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate before storing. Three failure modes worth catching:
    //  - oversized file (DoS / quota burn) — cap at 5 MB
    //  - non-image upload (a renamed .pdf or .exe) — reject by reported MIME
    //  - SVG / HTML disguised as image (XSS surface when later rendered with
    //    `<img>` from Supabase storage) — only allow PNG/JPEG/WEBP
    const MAX_BYTES = 5 * 1024 * 1024;
    const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Image must be under 5 MB" },
        { status: 413 }
      );
    }
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json(
        { error: "Only JPEG, PNG, or WEBP images are allowed" },
        { status: 415 }
      );
    }

    // Magic-byte sniff is cheap insurance — `file.type` is browser-supplied
    // and trivially spoofable. Store under what the bytes say, not the label.
    const sniffed = await sniffUpload(file, ["jpeg", "png", "webp"]);
    if (!sniffed) {
      return NextResponse.json(
        { error: "File contents do not match an image format" },
        { status: 415 }
      );
    }

    const path = `avatars/${user.id}.${sniffed.ext}`;

    const { error: uploadError } = await admin.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: sniffed.mime });

    if (uploadError) {
      console.error("Avatar upload error:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload avatar" },
        { status: 500 }
      );
    }

    const {
      data: { publicUrl },
    } = admin.storage.from("avatars").getPublicUrl(path);

    const avatarUrl = `${publicUrl}?t=${Date.now()}`;

    const { error: updateError } = await admin
      .from("profiles")
      .update({ avatar_url: avatarUrl })
      .eq("id", user.id);

    if (updateError) {
      console.error("Avatar profile update error:", updateError);
      return NextResponse.json(
        { error: "Failed to update profile" },
        { status: 500 }
      );
    }

    return NextResponse.json({ avatarUrl });
  } catch (err) {
    console.error("[Avatar Upload Error]", err);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}
