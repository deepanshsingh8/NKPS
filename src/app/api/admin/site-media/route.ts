import { NextRequest, NextResponse } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { verifyAdmin } from "@/lib/verify-admin";

const PAGE_ROUTES: Record<string, string> = {
  home: "/",
  about: "/about",
  "student-life": "/student-life",
  global: "/",
};

function revalidateAll(page: string) {
  revalidateTag("site-media", "max");
  // Revalidate the specific page so static HTML is regenerated
  const route = PAGE_ROUTES[page];
  if (route) revalidatePath(route);
  // Global slots affect multiple pages
  if (page === "global") {
    revalidatePath("/about");
    revalidatePath("/student-life");
  }
}

export async function GET() {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await admin
    .from("site_media")
    .select("*")
    .order("page")
    .order("section")
    .order("sort_order");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const slot = formData.get("slot") as string;

    if (!file || !slot) {
      return NextResponse.json({ error: "Missing file or slot" }, { status: 400 });
    }

    const fileExt = file.name.split(".").pop();
    const fileName = `${slot}-${Date.now()}.${fileExt}`;

    // Upload to site-media storage bucket
    const { error: uploadError } = await admin.storage
      .from("site-media")
      .upload(fileName, file, { upsert: false });

    if (uploadError) {
      return NextResponse.json(
        { error: `Upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    const {
      data: { publicUrl },
    } = admin.storage.from("site-media").getPublicUrl(fileName);

    // Update the slot's current_url and get the page for revalidation
    const { data: updated, error: updateError } = await admin
      .from("site_media")
      .update({ current_url: publicUrl, updated_at: new Date().toISOString() })
      .eq("slot", slot)
      .select("page")
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: `DB update failed: ${updateError.message}` },
        { status: 500 }
      );
    }

    revalidateAll(updated?.page ?? "home");

    return NextResponse.json({ success: true, url: publicUrl });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slot, action } = await request.json();

  if (!slot || action !== "reset") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Get the default_url and page for this slot
  const { data: record, error: fetchError } = await admin
    .from("site_media")
    .select("default_url, current_url, page")
    .eq("slot", slot)
    .single();

  if (fetchError || !record) {
    return NextResponse.json({ error: "Slot not found" }, { status: 404 });
  }

  // Optionally delete the old file from storage if it was a custom upload
  if (record.current_url !== record.default_url && record.current_url.includes("/site-media/")) {
    const urlParts = record.current_url.split("/site-media/");
    const fileName = urlParts[urlParts.length - 1];
    if (fileName) {
      await admin.storage.from("site-media").remove([fileName]);
    }
  }

  // Reset to default
  const { error: updateError } = await admin
    .from("site_media")
    .update({ current_url: record.default_url, updated_at: new Date().toISOString() })
    .eq("slot", slot);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  revalidateAll(record.page);

  return NextResponse.json({ success: true });
}
