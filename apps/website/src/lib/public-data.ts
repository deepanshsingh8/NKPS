import { createPublicClient } from "@nkps/shared/lib/supabase/public";
import { todayISO } from "@nkps/shared/lib/date";
import type { CalendarEvent, StaffMember } from "@nkps/shared/types";

// Server-side reads for sections that used to query Supabase from each
// visitor's browser. Called from pages with `revalidate`, so the database
// sees one read per ISR window instead of one per page view. The anon client
// keeps them to what the RLS policies publish.

export async function getUpcomingPublicEvents(
  limit: number
): Promise<CalendarEvent[]> {
  const { data } = await createPublicClient()
    .from("calendar_events")
    .select("*")
    .gte("start_date", todayISO())
    .is("class_id", null) // Only school-wide events
    .eq("is_public", true) // Only events the admin marked public
    .order("start_date", { ascending: true })
    .limit(limit);
  return (data as CalendarEvent[] | null) ?? [];
}

export const PUBLIC_STAFF_CATEGORIES = [
  "management",
  "pgt",
  "tgt",
  "prt",
  "motherTeachers",
  "admin",
] as const;

/** Grouped by category, or null when the read failed or came back empty. */
export async function getPublicStaffDirectory(): Promise<Record<
  string,
  StaffMember[]
> | null> {
  // public_staff_directory, not staff_members: the base table also holds
  // date_of_birth, address, phone, email and license_number. The view
  // (migration 098) exposes only these columns. Columns are listed explicitly
  // so widening the view can never silently widen this page.
  const { data, error } = await createPublicClient()
    .from("public_staff_directory")
    .select("id, name, subject, category, photo_url, qualifications, sort_order")
    .in("category", PUBLIC_STAFF_CATEGORIES as unknown as string[])
    .order("sort_order")
    .order("name");
  if (error || !data || data.length === 0) return null;
  const grouped: Record<string, StaffMember[]> = {};
  for (const member of data as StaffMember[]) {
    (grouped[member.category] ??= []).push(member);
  }
  return grouped;
}

export interface PublicGalleryImage {
  id: string;
  src: string;
  alt: string;
  category: string;
}

export interface PublicGalleryEvent {
  id: string;
  title: string;
  event_date: string;
  academic_year: string | null;
  image_count: number;
  cover_url: string | null;
}

export async function getPublicGallery(): Promise<{
  images: PublicGalleryImage[];
  events: PublicGalleryEvent[];
}> {
  const supabase = createPublicClient();
  const [{ data: images }, { data: events }, { data: eventImgs }] =
    await Promise.all([
      supabase
        .from("gallery_images")
        .select("id, src, alt, category")
        .is("gallery_event_id", null)
        .order("sort_order", { ascending: true }),
      supabase
        .from("gallery_events")
        .select("id, title, event_date, academic_year, cover_image_url")
        .eq("is_public", true)
        .order("event_date", { ascending: false }),
      // Image counts and the first image per event (cover fallback). RLS
      // limits these to images of public events.
      supabase
        .from("gallery_images")
        .select("gallery_event_id, src")
        .not("gallery_event_id", "is", null)
        .order("sort_order", { ascending: true }),
    ]);

  const counts: Record<string, number> = {};
  const firstImages: Record<string, string> = {};
  for (const img of (eventImgs ?? []) as {
    gallery_event_id: string | null;
    src: string;
  }[]) {
    if (!img.gallery_event_id) continue;
    counts[img.gallery_event_id] = (counts[img.gallery_event_id] || 0) + 1;
    firstImages[img.gallery_event_id] ??= img.src;
  }

  return {
    images: (images ?? []).map((img) => ({
      id: String(img.id),
      src: img.src,
      alt: img.alt,
      category: img.category,
    })),
    events: (events ?? []).map((e) => ({
      id: e.id,
      title: e.title,
      event_date: e.event_date,
      academic_year: e.academic_year,
      image_count: counts[e.id] || 0,
      cover_url: e.cover_image_url || firstImages[e.id] || null,
    })),
  };
}
