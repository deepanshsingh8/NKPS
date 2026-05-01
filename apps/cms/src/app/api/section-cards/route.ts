import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { verifyAdminOrEditor } from "@nkps/shared/lib/verify-admin";
import {
  sectionCardCreateSchema,
  sectionCardUpdateSchema,
} from "@nkps/shared/lib/validations";

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
    const parsed = sectionCardCreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const fields = parsed.data;
    const name = fields.name ?? null;

    const record: Record<string, unknown> = {
      section: fields.section,
      title: fields.title ?? null,
      subtitle: fields.subtitle ?? null,
      description: fields.description ?? null,
      quote: fields.quote ?? null,
      name,
      role: fields.role ?? null,
      initials: name ? name.charAt(0).toUpperCase() : null,
      date: fields.date ?? null,
      cta_text: fields.cta_text ?? null,
      cta_link: fields.cta_link ?? null,
      icon: fields.icon ?? null,
      link: fields.link ?? null,
      designation: fields.designation ?? null,
      message: fields.message ?? null,
      year: fields.year ?? null,
      season: fields.season ?? null,
      image_url: fields.image_url || null,
      sort_order: fields.sort_order ?? 0,
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
    const parsed = sectionCardUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { id, data: parsedUpdates } = parsed.data;
    // Mutable copy for the auto-derived fields below.
    const updates: Record<string, unknown> = { ...parsedUpdates };

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
