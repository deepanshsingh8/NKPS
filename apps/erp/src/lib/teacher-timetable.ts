import type { createClient } from "@nkps/shared/lib/supabase/client";
import type { HalfDay } from "./timetable-week";

// Reads for the teacher portal's own-timetable screens (dashboard + weekly
// grid). Browser client, so every table here is RLS-scoped to the signed-in
// teacher — nothing in this file widens what the login could already see.

type BrowserClient = ReturnType<typeof createClient>;

export interface TeacherPeriod {
  id: string;
  day_of_week: number;
  period_number: number;
  group_no: number;
  group_label: string | null;
  start_time: string;
  end_time: string;
  room: string | null;
  is_break: boolean;
  subject: { name: string } | null;
  class: { name: string; section: string } | null;
}

export interface CoverPeriod {
  id: string;
  note: string | null;
  half_day: HalfDay;
  /** Who the teacher is standing in for. */
  absent_teacher_name: string | null;
  period: TeacherPeriod | null;
}

export const DEFAULT_PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

/**
 * Period rows derived from the actual timetable (so a zero period shows and the
 * grid scales past 8), falling back to the default 1–8 when there is nothing.
 */
export function periodNumbers(rows: ReadonlyArray<{ period_number: number }>): number[] {
  const nums = Array.from(new Set(rows.map((r) => r.period_number))).sort(
    (a, b) => a - b
  );
  return nums.length > 0 ? nums : DEFAULT_PERIODS;
}

/** The current year's id, or null when none is flagged current. */
export async function currentYearId(supabase: BrowserClient): Promise<string | null> {
  const { data } = await supabase
    .from("academic_years")
    .select("id")
    .eq("is_current", true)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

const PERIOD_SELECT =
  "id, day_of_week, period_number, group_no, group_label, start_time, end_time, room, is_break, subject:subjects(name)";

type RawPeriod = Omit<TeacherPeriod, "class"> & {
  classes: { name: string; section: string; academic_year_id?: string } | null;
};

function normalise(row: RawPeriod): TeacherPeriod {
  const { classes, ...rest } = row;
  return {
    ...rest,
    class: classes ? { name: classes.name, section: classes.section } : null,
  };
}

/**
 * Every period this teacher takes in the current academic year, ordered by
 * day, then start time (classes run staggered schedules, so period_number is
 * not a time key), then group. Timetable rows hang off year-scoped classes, so
 * once next year's classes exist the teacher's week is in the table twice —
 * the year filter is what keeps each slot from showing doubled. With no year
 * flagged current, every row is returned rather than a blank page.
 */
export async function fetchTeacherPeriods(
  supabase: BrowserClient,
  teacherId: string,
  yearId: string | null
): Promise<TeacherPeriod[]> {
  let query = supabase
    .from("timetable_periods")
    .select(`${PERIOD_SELECT}, classes!inner(name, section, academic_year_id)`)
    .eq("teacher_id", teacherId);
  if (yearId) query = query.eq("classes.academic_year_id", yearId);
  const { data } = await query
    .order("day_of_week", { ascending: true })
    .order("start_time", { ascending: true })
    .order("group_no", { ascending: true });
  return ((data ?? []) as unknown as RawPeriod[]).map(normalise);
}

/**
 * Periods this teacher is covering on `date` (YYYY-MM-DD, school timezone),
 * with the slot's class/subject/time and the absent colleague's name. Reads
 * through the substitutions RLS for teacher logins (substitute or absentee).
 */
export async function fetchCoverPeriods(
  supabase: BrowserClient,
  teacherId: string,
  date: string
): Promise<CoverPeriod[]> {
  const { data } = await supabase
    .from("substitutions")
    .select(
      `id, note, timetable_periods(${PERIOD_SELECT}, classes(name, section)), teacher_absences!inner(absence_date, half_day, teachers(full_name))`
    )
    .eq("substitute_teacher_id", teacherId)
    .eq("teacher_absences.absence_date", date);

  type Raw = {
    id: string;
    note: string | null;
    timetable_periods: RawPeriod | null;
    teacher_absences: { half_day: HalfDay; teachers: { full_name: string } | null } | null;
  };
  return ((data ?? []) as unknown as Raw[])
    .map((s) => ({
      id: s.id,
      note: s.note,
      half_day: s.teacher_absences?.half_day ?? "full",
      absent_teacher_name: s.teacher_absences?.teachers?.full_name ?? null,
      period: s.timetable_periods ? normalise(s.timetable_periods) : null,
    }))
    .sort((a, b) =>
      (a.period?.start_time ?? "").localeCompare(b.period?.start_time ?? "")
    );
}

/** This teacher's own absence on `date`, if the office has recorded one. */
export async function fetchOwnAbsence(
  supabase: BrowserClient,
  teacherId: string,
  date: string
): Promise<{ half_day: HalfDay } | null> {
  const { data } = await supabase
    .from("teacher_absences")
    .select("half_day")
    .eq("teacher_id", teacherId)
    .eq("absence_date", date)
    .maybeSingle();
  return (data as { half_day: HalfDay } | null) ?? null;
}
