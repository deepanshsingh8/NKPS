import type { SupabaseClient } from "@supabase/supabase-js";

// Parents and students may not read `teachers` or `staff_members` — those rows
// carry phone, address and date of birth (migration 128). The portal screens
// that label a timetable period or a bus only need a name, so they ask these
// two SECURITY DEFINER functions (migration 127), which return id + name and
// nothing else.

async function lookup(
  supabase: SupabaseClient,
  fn: "teacher_display_names" | "staff_display_names",
  nameKey: "full_name" | "name",
  ids: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  const names = new Map<string, string>();
  if (unique.length === 0) return names;
  const { data } = await supabase.rpc(fn, { p_ids: unique });
  for (const row of (data ?? []) as Record<string, string>[]) {
    names.set(row.id, row[nameKey]);
  }
  return names;
}

export function teacherDisplayNames(
  supabase: SupabaseClient,
  ids: (string | null | undefined)[]
) {
  return lookup(supabase, "teacher_display_names", "full_name", ids);
}

export function staffDisplayNames(
  supabase: SupabaseClient,
  ids: (string | null | undefined)[]
) {
  return lookup(supabase, "staff_display_names", "name", ids);
}
