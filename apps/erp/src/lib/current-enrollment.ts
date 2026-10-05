import type { SupabaseClient } from "@supabase/supabase-js";

export interface CurrentEnrollment {
  id: string;
  class_id: string;
  academic_year_id: string;
  status: string;
}

const COLUMNS = "id, class_id, academic_year_id, status";

/**
 * The enrollment a portal page should treat as "this student's class".
 *
 * A returning student has one `student_enrollments` row per session, and a
 * bare `.limit(1).single()` picked an arbitrary one — in practice the
 * first-ever row — so a year-2 student saw an empty attendance register and
 * the wrong class calendar. Prefer the active row in the current session;
 * fall back to the most recent enrollment (alumni, or no current session
 * configured) so the page still has something to show.
 *
 * Browser-safe: runs under the caller's RLS, so a student only ever resolves
 * their own rows and a parent only their children's.
 */
export async function getCurrentEnrollment(
  supabase: SupabaseClient,
  studentId: string
): Promise<CurrentEnrollment | null> {
  const { data: currentYear } = await supabase
    .from("academic_years")
    .select("id")
    .eq("is_current", true)
    .limit(1)
    .maybeSingle();

  if (currentYear?.id) {
    const { data: active } = await supabase
      .from("student_enrollments")
      .select(COLUMNS)
      .eq("student_id", studentId)
      .eq("academic_year_id", currentYear.id)
      .eq("status", "active")
      .order("enrollment_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (active) return active as CurrentEnrollment;
  }

  const { data: latest } = await supabase
    .from("student_enrollments")
    .select(COLUMNS)
    .eq("student_id", studentId)
    .order("enrollment_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (latest as CurrentEnrollment | null) ?? null;
}
