import type { SupabaseClient } from "@supabase/supabase-js";

export interface ActiveYear {
  id: string;
  name: string;
  is_current: boolean;
}

/**
 * The one definition of "the active academic year" for the transport screens
 * and anything that must agree with them: the requested year if the caller
 * named one that exists, else the row flagged is_current, else the newest by
 * name (so the fallback survives a year switch where no row carries the flag).
 *
 * /api/transport/bus-load and the WhatsApp bus notice both call this, so
 * "who rides bus 9" means the same thing on the buses screen and in the
 * message that goes to those families. Throws on a read error rather than
 * guessing a year.
 */
export async function resolveActiveYear(
  admin: SupabaseClient,
  requestedYearId?: string | null
): Promise<ActiveYear | null> {
  const { data, error } = await admin
    .from("academic_years")
    .select("id, name, is_current")
    .order("name", { ascending: false });
  if (error) throw new Error(`Failed to load academic years: ${error.message}`);

  const years = (data ?? []) as ActiveYear[];
  return (
    (requestedYearId ? years.find((y) => y.id === requestedYearId) : null) ??
    years.find((y) => y.is_current) ??
    years[0] ??
    null
  );
}
