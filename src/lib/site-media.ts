import { createAdminClient } from "@/lib/supabase/admin";
import type { SiteMedia } from "@/types";

/**
 * Fetch all site media for a given page, keyed by slot name.
 * No caching layer — relies on page-level ISR / revalidatePath for freshness.
 */
export async function getPageMedia(
  page: string
): Promise<Record<string, SiteMedia>> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("site_media")
    .select("*")
    .eq("page", page)
    .order("sort_order");

  const map: Record<string, SiteMedia> = {};
  for (const item of data ?? []) {
    map[item.slot] = item as SiteMedia;
  }
  return map;
}

/**
 * Helper: get the current URL for a slot, falling back to the provided default.
 */
export function mediaUrl(
  media: Record<string, SiteMedia>,
  slot: string,
  fallback: string
): string {
  return media[slot]?.current_url || fallback;
}
