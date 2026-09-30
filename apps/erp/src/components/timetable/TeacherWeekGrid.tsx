"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@nkps/shared/components/ui/button";
import { cn } from "@nkps/shared/lib/utils";
import { CalendarPlus, UserCheck, UserX, CircleAlert } from "lucide-react";
import {
  dateForWeekday,
  formatDayMonth,
  halfDayShort,
  isPeriodAffected,
  pickOne,
  todayIso,
  type AbsenceWithCover,
} from "@/lib/timetable-week";

const DAYS = [
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
];

export interface TeacherPeriod {
  id: string;
  day_of_week: number;
  period_number: number;
  /** migration 119 — names the parallel track, e.g. "Basketball". */
  group_label?: string | null;
  start_time: string;
  end_time: string;
  room: string | null;
  is_break: boolean;
  class_id: string;
  subject_id: string | null;
  classes:
    | { id: string; name: string; section: string | null }
    | { id: string; name: string; section: string | null }[]
    | null;
  subjects:
    | { id: string; name: string; code: string | null }
    | { id: string; name: string; code: string | null }[]
    | null;
}

interface Props {
  periods: TeacherPeriod[];
  /** Monday of the week on screen, YYYY-MM-DD. */
  weekStart: string;
  /** This teacher's absences inside that week, with their cover. */
  absences: AbsenceWithCover[];
  onMarkAbsent: (date: string, dayOfWeek: number) => void;
  onMarkPresent: (absence: AbsenceWithCover) => void;
}

function formatTime(t: string): string {
  // "09:30:00" → "09:30"
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export function TeacherWeekGrid({
  periods,
  weekStart,
  absences,
  onMarkAbsent,
  onMarkPresent,
}: Props) {
  const today = todayIso();
  const todayInWeek = DAYS.find((d) => dateForWeekday(weekStart, d.value) === today);
  const [mobileDay, setMobileDay] = useState<number>(todayInWeek?.value ?? 1);

  // Compute the union of period_numbers actually used by this teacher, sorted.
  // Empty-state handled by the caller.
  const periodNumbers = Array.from(
    new Set(periods.map((p) => p.period_number))
  ).sort((a, b) => a - b);

  // Array-valued, not one-per-slot. A cell can hold parallel groups
  // (migration 119), and when it is marked shared the same teacher legitimately
  // appears for several classes at once — a Map of single values silently drops
  // all but the last, on the very screen an admin opens to check whether a
  // teacher is free.
  const cellByDayPeriod = new Map<string, TeacherPeriod[]>();
  for (const p of periods) {
    const key = `${p.day_of_week}|${p.period_number}`;
    const bucket = cellByDayPeriod.get(key);
    if (bucket) bucket.push(p);
    else cellByDayPeriod.set(key, [p]);
  }

  // One absence per teacher per date (UNIQUE in the schema).
  const absenceByDate = new Map(absences.map((a) => [a.absence_date, a]));
  const coverByPeriod = (absence: AbsenceWithCover | undefined, periodId: string) => {
    const sub = absence?.substitutions?.find((s) => s.timetable_period_id === periodId);
    return sub ? pickOne(sub.substitute)?.full_name ?? "Assigned" : null;
  };

  // How many of the day's affected periods have someone covering them.
  const coverStats = (day: number, absence: AbsenceWithCover) => {
    const affected = periods.filter(
      (p) =>
        p.day_of_week === day &&
        !p.is_break &&
        isPeriodAffected(absence.half_day, p.period_number)
    );
    const covered = affected.filter((p) =>
      absence.substitutions?.some((s) => s.timetable_period_id === p.id)
    ).length;
    return { affected: affected.length, covered };
  };

  // The day's heading and its actions. Shared by the week table and the
  // phone's day view so the two cannot drift apart.
  const renderDayHeader = (day: (typeof DAYS)[number], compact: boolean) => {
    const date = dateForWeekday(weekStart, day.value);
    const absence = absenceByDate.get(date);
    const isToday = date === today;
    return (
      <div className={cn("flex flex-col gap-1", compact ? "items-start" : "items-center")}>
        {!compact && (
          <span className={cn(isToday && "text-navy-900 dark:text-white font-semibold")}>
            {day.label}
          </span>
        )}
        <span
          className={cn(
            "text-[11px]",
            isToday
              ? "rounded-full bg-navy-900 px-2 py-0.5 font-medium text-white dark:bg-gold-500 dark:text-navy-900"
              : "text-gray-400 dark:text-gray-500"
          )}
        >
          {isToday ? `Today · ${formatDayMonth(date)}` : formatDayMonth(date)}
        </span>
        {absence ? (
          (() => {
            const { affected, covered } = coverStats(day.value, absence);
            return (
              <>
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300"
                  title={absence.reason ?? undefined}
                >
                  <UserX className="h-3 w-3" />
                  Absent · {halfDayShort(absence.half_day)}
                </span>
                {affected > 0 && (
                  <span
                    className={cn(
                      "text-[11px] font-medium",
                      covered === affected
                        ? "text-green-700 dark:text-green-300"
                        : "text-amber-700 dark:text-amber-300"
                    )}
                  >
                    {covered}/{affected} covered
                  </span>
                )}
                <div className="flex flex-wrap items-center justify-center gap-1">
                  <Link
                    href={`/timetable/substitutions?date=${date}&absence=${absence.id}`}
                    className={cn(
                      buttonVariants({ variant: "ghost", size: "xs" }),
                      "text-[11px] text-gray-600 dark:text-gray-300"
                    )}
                  >
                    Assign cover
                  </Link>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="text-[11px] text-gray-600 dark:text-gray-300"
                    onClick={() => onMarkPresent(absence)}
                  >
                    Mark present
                  </Button>
                </div>
              </>
            );
          })()
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px] text-gray-500 dark:text-gray-400 hover:text-navy-900 dark:hover:text-white"
            onClick={() => onMarkAbsent(date, day.value)}
          >
            <CalendarPlus className="h-3 w-3 mr-1" />
            Mark absent
          </Button>
        )}
      </div>
    );
  };

  const renderCell = (day: number, pNum: number) => {
    const cells = cellByDayPeriod.get(`${day}|${pNum}`) ?? [];
    const absence = absenceByDate.get(dateForWeekday(weekStart, day));
    if (cells.length === 0) {
      return (
        <div className="w-full rounded-lg px-2 py-2 text-xs min-h-[56px] bg-gray-50 dark:bg-muted border border-dashed border-gray-200 dark:border-border text-gray-400 dark:text-gray-500 flex items-center justify-center">
          free
        </div>
      );
    }
    return (
      <div className="space-y-1">
        {cells.map((cell) => {
          const cls = pickOne(cell.classes);
          const subj = pickOne(cell.subjects);
          const className = cls
            ? `${cls.name}${cls.section ? "-" + cls.section : ""}`
            : "?";
          const out =
            !!absence && !cell.is_break && isPeriodAffected(absence.half_day, cell.period_number);
          const cover = out ? coverByPeriod(absence, cell.id) : null;
          return (
            <div
              key={cell.id}
              className={cn(
                "w-full rounded-lg px-2 py-2 text-xs min-h-[56px] border",
                cell.is_break
                  ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
                  : out
                    ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                    : "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
              )}
            >
              {cell.is_break ? (
                <div className="font-medium text-amber-900 dark:text-amber-200">
                  Break
                </div>
              ) : (
                <>
                  <div
                    className={cn(
                      "font-medium",
                      out
                        ? "text-red-800 dark:text-red-200 line-through decoration-red-400/70"
                        : "text-navy-900 dark:text-white"
                    )}
                  >
                    {className}
                  </div>
                  <div className="text-gray-600 dark:text-gray-300 truncate">
                    {subj?.name ?? "—"}
                    {cell.group_label ? ` · ${cell.group_label}` : ""}
                  </div>
                  <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                    {formatTime(cell.start_time)}–
                    {formatTime(cell.end_time)}
                    {cell.room ? ` · ${cell.room}` : ""}
                  </div>
                  {out &&
                    (cover ? (
                      <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-green-700 dark:text-green-300">
                        <UserCheck className="h-3 w-3 shrink-0" />
                        <span className="truncate">Cover: {cover}</span>
                      </div>
                    ) : (
                      <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                        <CircleAlert className="h-3 w-3 shrink-0" />
                        No cover yet
                      </div>
                    ))}
                </>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const mobile = DAYS.find((d) => d.value === mobileDay) ?? DAYS[0];

  return (
    <>
      {/* Phone: one day at a time, the same pattern as the class timetable —
          a six-column week in a sideways scroller loses its day headers, and
          with them the absence badge you came here to check. */}
      <div className="sm:hidden">
        <div className="mb-3 grid grid-cols-3 gap-1 rounded-xl bg-gray-100 p-1 dark:bg-muted"> {/* mobile-layout-ok: six three-letter day chips */}
          {DAYS.map((d) => {
            const absent = absenceByDate.has(dateForWeekday(weekStart, d.value));
            return (
              <button
                key={d.value}
                onClick={() => setMobileDay(d.value)}
                aria-current={mobileDay === d.value ? "true" : undefined}
                className={cn(
                  "relative rounded-lg px-2 py-2 text-sm font-medium transition-colors",
                  mobileDay === d.value
                    ? "bg-white dark:bg-card text-navy-900 dark:text-white shadow-sm"
                    : "text-gray-500 dark:text-gray-400"
                )}
              >
                {d.short}
                {absent && (
                  <span
                    className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-red-500"
                    aria-label="absent"
                  />
                )}
              </button>
            );
          })}
        </div>
        <div className="erp-table-container mb-3 p-3">
          <div className="text-sm font-semibold text-navy-900 dark:text-white mb-1">
            {mobile.label}
          </div>
          {renderDayHeader(mobile, true)}
        </div>
        <ul className="space-y-2">
          {periodNumbers.map((pNum) => (
            <li key={pNum} className="flex items-start gap-3">
              <div className="w-12 shrink-0 pt-2 text-sm font-medium text-gray-600 dark:text-gray-300">
                P{pNum}
              </div>
              <div className="min-w-0 flex-1">{renderCell(mobile.value, pNum)}</div>
            </li>
          ))}
        </ul>
      </div>

      <div className="erp-table-container hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-muted">
              <th className="px-3 py-3 text-left font-medium text-gray-500 dark:text-gray-400 border-b dark:border-border">
                Period
              </th>
              {DAYS.map((d) => {
                const absent = absenceByDate.has(dateForWeekday(weekStart, d.value));
                return (
                  <th
                    key={d.value}
                    className={cn(
                      "px-3 py-3 text-center align-top font-medium text-gray-500 dark:text-gray-400 border-b dark:border-border",
                      absent && "bg-red-50/60 dark:bg-red-950/20"
                    )}
                  >
                    {renderDayHeader(d, false)}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {periodNumbers.map((pNum) => (
              <tr
                key={pNum}
                className="border-b border-gray-100 dark:border-border"
              >
                <td className="px-3 py-2 text-gray-600 dark:text-gray-300 align-top">
                  <div className="font-medium">P{pNum}</div>
                </td>
                {DAYS.map((d) => (
                  <td key={d.value} className="px-1 py-1 align-top">
                    {renderCell(d.value, pNum)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
