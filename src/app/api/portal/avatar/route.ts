import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

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

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const path = `avatars/${user.id}.jpg`;

    const { error: uploadError } = await admin.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: "image/jpeg" });

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
