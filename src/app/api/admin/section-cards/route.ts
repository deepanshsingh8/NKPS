import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { verifyAdmin } from "@/lib/verify-admin";

export async function GET(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const section = request.nextUrl.searchParams.get("section");

  let query = admin
    .from("section_cards")
    .select("*")
    .order("section")
    .order("sort_order");

  if (section) {
    query = query.eq("section", section);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Fetch section cards error:", error);
    return NextResponse.json({ error: "Failed to fetch section cards" }, { status: 500 });
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
    const section = formData.get("section") as string;

    if (!section) {
      return NextResponse.json({ error: "Section is required" }, { status: 400 });
    }

    let imageUrl: string | null = null;

    if (file && file.size > 0) {
      const fileExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const fileName = `section-cards/${section}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await admin.storage
        .from("site-media")
        .upload(fileName, file, { upsert: false });

      if (uploadError) {
        console.error("Section card upload error:", uploadError);
        return NextResponse.json({ error: "Image upload failed" }, { status: 500 });
      }

      const { data: { publicUrl } } = admin.storage.from("site-media").getPublicUrl(fileName);
      imageUrl = publicUrl;
    }

    const name = (formData.get("name") as string)?.trim() || null;

    const record: Record<string, unknown> = {
      section,
      title: (formData.get("title") as string)?.trim() || null,
      subtitle: (formData.get("subtitle") as string)?.trim() || null,
      description: (formData.get("description") as string)?.trim() || null,
      quote: (formData.get("quote") as string)?.trim() || null,
      name,
      role: (formData.get("role") as string)?.trim() || null,
      initials: name ? name.charAt(0).toUpperCase() : null,
      date: (formData.get("date") as string)?.trim() || null,
      cta_text: (formData.get("cta_text") as string)?.trim() || null,
      cta_link: (formData.get("cta_link") as string)?.trim() || null,
      icon: (formData.get("icon") as string)?.trim() || null,
      link: (formData.get("link") as string)?.trim() || null,
      image_url: imageUrl,
      sort_order: parseInt(formData.get("sort_order") as string) || 0,
      is_active: formData.get("is_active") !== "false",
    };

    const { data, error: insertError } = await admin
      .from("section_cards")
      .insert(record)
      .select()
      .single();

    if (insertError) {
      console.error("Section card insert error:", insertError);
      return NextResponse.json({ error: "Failed to create card" }, { status: 500 });
    }

    revalidatePath("/");

    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const contentType = request.headers.get("content-type") || "";
    const isFormData = contentType.includes("multipart/form-data");

    let id: string;
    let updates: Record<string, unknown> = {};
    let newFile: File | null = null;

    if (isFormData) {
      const formData = await request.formData();
      id = formData.get("id") as string;
      newFile = formData.get("file") as File | null;

      const fields = ["title", "subtitle", "description", "quote", "name", "role", "date", "cta_text", "cta_link", "icon", "link", "sort_order", "is_active"];
      for (const field of fields) {
        const val = formData.get(field);
        if (val !== null) {
          if (field === "sort_order") {
            updates[field] = parseInt(val as string) || 0;
          } else if (field === "is_active") {
            updates[field] = val !== "false";
          } else {
            updates[field] = (val as string).trim() || null;
          }
        }
      }

      if (updates.name) {
        updates.initials = (updates.name as string).charAt(0).toUpperCase();
      }
    } else {
      const body = await request.json();
      id = body.id;
      updates = body.data || {};

      if (updates.name) {
        updates.initials = (updates.name as string).charAt(0).toUpperCase();
      }
    }

    if (!id) {
      return NextResponse.json({ error: "Card ID is required" }, { status: 400 });
    }

    // Handle new image upload
    if (newFile && newFile.size > 0) {
      // Get old image URL to clean up
      const { data: existing } = await admin
        .from("section_cards")
        .select("image_url, section")
        .eq("id", id)
        .single();

      // Delete old image from storage if it was an upload
      if (existing?.image_url?.includes("/site-media/section-cards/")) {
        const urlParts = existing.image_url.split("/site-media/");
        const oldFileName = urlParts[urlParts.length - 1];
        if (oldFileName) {
          await admin.storage.from("site-media").remove([oldFileName]);
        }
      }

      const section = existing?.section || "unknown";
      const fileExt = newFile.name.split(".").pop()?.toLowerCase() || "jpg";
      const fileName = `section-cards/${section}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await admin.storage
        .from("site-media")
        .upload(fileName, newFile, { upsert: false });

      if (uploadError) {
        console.error("Section card image replace error:", uploadError);
        return NextResponse.json({ error: "Image upload failed" }, { status: 500 });
      }

      const { data: { publicUrl } } = admin.storage.from("site-media").getPublicUrl(fileName);
      updates.image_url = publicUrl;
    }

    updates.updated_at = new Date().toISOString();

    const { error: updateError } = await admin
      .from("section_cards")
      .update(updates)
      .eq("id", id);

    if (updateError) {
      console.error("Section card update error:", updateError);
      return NextResponse.json({ error: "Failed to update card" }, { status: 500 });
    }

    revalidatePath("/");

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "Card ID is required" }, { status: 400 });
    }

    // Get image URL to clean up storage
    const { data: card } = await admin
      .from("section_cards")
      .select("image_url")
      .eq("id", id)
      .single();

    if (card?.image_url?.includes("/site-media/section-cards/")) {
      const urlParts = card.image_url.split("/site-media/");
      const fileName = urlParts[urlParts.length - 1];
      if (fileName) {
        await admin.storage.from("site-media").remove([fileName]);
      }
    }

    const { error } = await admin
      .from("section_cards")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Section card delete error:", error);
      return NextResponse.json({ error: "Failed to delete card" }, { status: 500 });
    }

    revalidatePath("/");

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
