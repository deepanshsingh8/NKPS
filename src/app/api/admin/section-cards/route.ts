import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { verifyAdminOrEditor } from "@/lib/verify-admin";

export async function GET(request: NextRequest) {
  const admin = await verifyAdminOrEditor("site_media");
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
  const admin = await verifyAdminOrEditor("site_media");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { section, image_url, ...fields } = body;

    if (!section) {
      return NextResponse.json({ error: "Section is required" }, { status: 400 });
    }

    const name = fields.name?.trim() || null;

    const record: Record<string, unknown> = {
      section,
      title: fields.title?.trim() || null,
      subtitle: fields.subtitle?.trim() || null,
      description: fields.description?.trim() || null,
      quote: fields.quote?.trim() || null,
      name,
      role: fields.role?.trim() || null,
      initials: name ? name.charAt(0).toUpperCase() : null,
      date: fields.date?.trim() || null,
      cta_text: fields.cta_text?.trim() || null,
      cta_link: fields.cta_link?.trim() || null,
      icon: fields.icon?.trim() || null,
      link: fields.link?.trim() || null,
      designation: fields.designation?.trim() || null,
      message: fields.message?.trim() || null,
      year: fields.year?.trim() || null,
      season: fields.season?.trim() || null,
      image_url: image_url || null,
      sort_order: parseInt(fields.sort_order) || 0,
      is_active: fields.is_active !== false,
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
  const admin = await verifyAdminOrEditor("site_media");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, data: updates = {} } = body;

    if (!id) {
      return NextResponse.json({ error: "Card ID is required" }, { status: 400 });
    }

    if (updates.name) {
      updates.initials = (updates.name as string).charAt(0).toUpperCase();
    }

    // Clean up old image from storage if a new image_url is provided
    if (updates.image_url) {
      const { data: existing } = await admin
        .from("section_cards")
        .select("image_url")
        .eq("id", id)
        .single();

      if (existing?.image_url?.includes("/site-media/section-cards/")) {
        const urlParts = existing.image_url.split("/site-media/");
        const oldFileName = urlParts[urlParts.length - 1];
        if (oldFileName) {
          await admin.storage.from("site-media").remove([oldFileName]);
        }
      }
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
  const admin = await verifyAdminOrEditor("site_media");
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
