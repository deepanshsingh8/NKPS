import { HALF_DAY_CUTOFF_PERIOD } from "@nkps/shared/lib/constants";

// Dates for the week-based timetable screens. Everything is a local-calendar
// "YYYY-MM-DD" string, built from local noon so a DST shift or a UTC server
// cannot roll a date into its neighbour — the same convention the absence API
// uses when it turns an absence_date back into a weekday.

export type HalfDay = "full" | "first_half" | "second_half";

export const HALF_DAY_OPTIONS: ReadonlyArray<{ value: HalfDay; label: string }> = [
  { value: "full", label: "Full day" },
  { value: "first_half", label: "First half (morning)" },
  { value: "second_half", label: "Second half (afternoon)" },
];

/** Short form for badges, where "First half (morning)" does not fit. */
export function halfDayShort(h: HalfDay): string {
  return h === "full" ? "Full day" : h === "first_half" ? "Morning" : "Afternoon";
}

export function halfDayLabel(h: string): string {
  return HALF_DAY_OPTIONS.find((o) => o.value === h)?.label ?? h;
}

function atNoon(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

export function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function todayIso(): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return toIso(d);
}

export function addDaysIso(iso: string, days: number): string {
  const d = atNoon(iso);
  d.setDate(d.getDate() + days);
  return toIso(d);
}

/**
 * The Monday of the school week a date falls in. Sunday belongs to the week
 * AHEAD — on a Sunday the week anyone is planning is tomorrow's, and that is
 * also what the old "next Monday" day headers pointed at.
 */
export function weekStartOf(iso: string): string {
  const js = atNoon(iso).getDay(); // 0=Sun..6=Sat
  return addDaysIso(iso, js === 0 ? 1 : 1 - js);
}

/** Mon=1..Sat=6 → the date of that day in the week starting `weekStart`. */
export function dateForWeekday(weekStart: string, dayOfWeek: number): string {
  return addDaysIso(weekStart, dayOfWeek - 1);
}

/** "28 Sep" */
export function formatDayMonth(iso: string): string {
  return atNoon(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** "Mon, 28 Sep 2026" */
export function formatLongDate(iso: string): string {
  return atNoon(iso).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "28 Sep – 3 Oct 2026" for a Mon–Sat week. */
export function formatWeekRange(weekStart: string): string {
  const end = addDaysIso(weekStart, 5);
  return `${formatDayMonth(weekStart)} – ${formatDayMonth(end)} ${atNoon(end).getFullYear()}`;
}

/**
 * Does an absence of this kind take the teacher out of this period? Mirrors
 * the filter in POST /api/teacher-absences and the substitution suggester,
 * so the grid marks exactly the periods Substitutions asks you to cover.
 */
export function isPeriodAffected(halfDay: HalfDay, periodNumber: number): boolean {
  if (halfDay === "first_half") return periodNumber <= HALF_DAY_CUTOFF_PERIOD;
  if (halfDay === "second_half") return periodNumber > HALF_DAY_CUTOFF_PERIOD;
  return true;
}

// PostgREST returns single-relation joins as either an object or a one-element
// array depending on FK declaration; normalise both shapes.
export function pickOne<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

/** An absence as GET /api/teacher-absences?include=substitutions returns it. */
export interface AbsenceWithCover {
  id: string;
  teacher_id: string;
  absence_date: string;
  half_day: HalfDay;
  reason: string | null;
  teachers:
    | { id: string; full_name: string; employee_id: string | null }
    | { id: string; full_name: string; employee_id: string | null }[]
    | null;
  substitutions?: Array<{
    id: string;
    timetable_period_id: string;
    substitute_teacher_id: string | null;
    substitute:
      | { id: string; full_name: string }
      | { id: string; full_name: string }[]
      | null;
  }>;
}
