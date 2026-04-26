import { NextRequest, NextResponse } from "next/server";
import { verifyAdminOrEditor } from "@/shared/lib/verify-admin";
import { createPortalUser } from "@/shared/lib/create-portal-user";
import { mirrorStaffToTeacher } from "@/lib/staff-teacher-sync";

const VALID_CATEGORIES = ["management", "admin", "pgt", "tgt", "prt", "motherTeachers", "prePrimaryCoordinator", "primaryCoordinator", "middleCoordinator", "seniorCoordinator", "additionalStaff", "busDriver", "peon"];

export async function POST(request: NextRequest) {
  const admin = await verifyAdminOrEditor("staff");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { name, subject, category, photo_url, sort_order, email, phone, date_of_birth, address, qualifications } = await request.json();

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
        email: email || null,
        phone: phone || null,
        date_of_birth: date_of_birth || null,
        address: address || null,
        qualifications: qualifications || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Staff DB insert error:", insertError);
      if (insertError.code === "23505") {
        return NextResponse.json(
          { error: `A staff member named "${name}" already exists in the ${category} category` },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "Failed to save staff member" },
        { status: 500 }
      );
    }

    let userCreated = false;
    if (email?.trim()) {
      const result = await createPortalUser({
        email: email.trim(),
        fullName: name.trim(),
        role: "teacher",
        phone: phone || null,
      });
      userCreated = result.success;
    }

    return NextResponse.json({ success: true, data, userCreated });
  } catch (err) {
    console.error("[Staff Create Error]", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const admin = await verifyAdminOrEditor("staff");
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

    // M23 — keep the linked teachers row in sync. Helper no-ops when no
    // teacher is linked to this staff_member.
    await mirrorStaffToTeacher(admin, id);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const admin = await verifyAdminOrEditor("staff");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    // Bulk delete: { ids: string[] }
    if (Array.isArray(body.ids) && body.ids.length > 0) {
      const ids: string[] = body.ids;

      // Fetch photo URLs for cleanup
      const { data: rows } = await admin
        .from("staff_members")
        .select("id, photo_url")
        .in("id", ids);

      const photoFiles = (rows ?? [])
        .filter((r) => r.photo_url)
        .map((r) => {
          const parts = (r.photo_url as string).split("/");
          return parts[parts.length - 1];
        });

      if (photoFiles.length > 0) {
        await admin.storage.from("staff-photos").remove(photoFiles);
      }

      const { error } = await admin
        .from("staff_members")
        .delete()
        .in("id", ids);

      if (error) {
        console.error("Bulk staff delete error:", error);
        return NextResponse.json(
          { error: "Failed to delete staff members" },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, deleted: ids.length });
    }

    // Single delete: { id, photo_url }
    const { id, photo_url } = body;

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
