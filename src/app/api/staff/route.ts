import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/verify-admin";

const VALID_CATEGORIES = ["management", "admin", "pgt", "tgt", "prt", "motherTeachers", "additionalStaff", "busDriver", "peon"];

export async function POST(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { name, subject, category, photo_url, sort_order } = await request.json();

    if (!name || !subject || !category || !VALID_CATEGORIES.includes(category)) {
      return NextResponse.json(
        { error: "Missing required fields or invalid category" },
        { status: 400 }
      );
    }

    const { data, error: insertError } = await admin
      .from("staff_members")
      .insert({
        name,
        subject,
        category,
        photo_url: photo_url || null,
        sort_order: sort_order ?? 0,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Staff DB insert error:", insertError);
      return NextResponse.json(
        { error: "Failed to save staff member" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[Staff Create Error]", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id, old_photo_url, ...updates } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: "Missing staff member ID" },
        { status: 400 }
      );
    }

    // If photo is being replaced, delete old one from storage
    if (updates.photo_url && old_photo_url) {
      const urlParts = (old_photo_url as string).split("/");
      const fileName = urlParts[urlParts.length - 1];
      await admin.storage.from("staff-photos").remove([fileName]);
    }

    const { error } = await admin
      .from("staff_members")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      console.error("Staff update error:", error);
      return NextResponse.json(
        { error: "Failed to update staff member" },
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
    const { id, photo_url } = await request.json();

    // Remove photo from storage if exists
    if (photo_url) {
      const urlParts = (photo_url as string).split("/");
      const fileName = urlParts[urlParts.length - 1];
      await admin.storage.from("staff-photos").remove([fileName]);
    }

    const { error } = await admin
      .from("staff_members")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Staff delete error:", error);
      return NextResponse.json(
        { error: "Failed to delete staff member" },
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
