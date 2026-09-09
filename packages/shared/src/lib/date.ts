// Civil dates in the school's timezone.
//
// Why this exists: `new Date().toISOString().slice(0, 10)` converts to UTC
// before truncating. India is UTC+05:30, so between 00:00 and 05:30 IST that
// expression returns YESTERDAY. Server code on Vercel runs in UTC and hits
// this always; browser code in India hits it too, because the conversion
// happens regardless of the local zone.
//
// The damage is not theoretical. A fee collected at 00:30 IST on 1 April was
// being stamped `payment_date = 31 March` — the previous financial year. And
// `new Date(); d.setDate(1); d.toISOString()` evaluated to the LAST day of the
// previous month, so the attendance register opened on the wrong month.
//
// Every date stored in this system (payment_date, attendance.date, due dates,
// exam dates) is a civil date — "the 9th of September" as the school means it,
// with no time and no zone. Format them here, never through toISOString().

/**
 * The school's civil timezone. A per-school setting once `school_config`
 * lands; until then every deployment is in India.
 */
export const SCHOOL_TIME_ZONE = "Asia/Kolkata";

/**
 * Format a moment as a `YYYY-MM-DD` civil date in the given timezone.
 *
 * Built on Intl.formatToParts rather than a locale format string, so the
 * output can't drift with the runtime's locale data.
 */
export function toISODate(
  date: Date = new Date(),
  timeZone: string = SCHOOL_TIME_ZONE
): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  let year = "";
  let month = "";
  let day = "";
  for (const part of parts) {
    if (part.type === "year") year = part.value;
    else if (part.type === "month") month = part.value;
    else if (part.type === "day") day = part.value;
  }
  return `${year}-${month}-${day}`;
}

/**
 * Today's civil date in the school's timezone, as `YYYY-MM-DD`.
 *
 * The drop-in replacement for `new Date().toISOString().slice(0, 10)`.
 */
export function todayISO(timeZone: string = SCHOOL_TIME_ZONE): string {
  return toISODate(new Date(), timeZone);
}

/**
 * The first day of the month containing `date`, as `YYYY-MM-DD`.
 *
 * Derived from the already-localised parts rather than by mutating a Date with
 * `setDate(1)` — mutating first and converting after is what produced the
 * previous month's last day when run before 05:30 IST.
 */
export function firstDayOfMonthISO(
  date: Date = new Date(),
  timeZone: string = SCHOOL_TIME_ZONE
): string {
  const iso = toISODate(date, timeZone);
  return `${iso.slice(0, 7)}-01`;
}
