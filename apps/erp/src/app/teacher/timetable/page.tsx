"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@nkps/shared/lib/supabase/client";
import { todayISO } from "@nkps/shared/lib/date";
import { dayOfWeekFromDate } from "@nkps/shared/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@nkps/shared/components/ui/card";
import { Loader2, Clock } from "lucide-react";
import { categoricalChip } from "@nkps/shared/lib/palette";
import {
  currentYearId,
  fetchCoverPeriods,
  fetchOwnAbsence,
  fetchTeacherPeriods,
  periodNumbers,
  type CoverPeriod,
  type TeacherPeriod,
} from "@/lib/teacher-timetable";
import { halfDayShort, type HalfDay } from "@/lib/timetable-week";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NUMBERS = [1, 2, 3, 4, 5, 6]; // Monday=1 through Saturday=6

// Color palette for visual distinction by subject

export default function TeacherTimetablePage() {
  const [entries, setEntries] = useState<TeacherPeriod[]>([]);
  const [linked, setLinked] = useState(true);
  const [covers, setCovers] = useState<CoverPeriod[]>([]);
  const [absentToday, setAbsentToday] = useState<HalfDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [subjectColorMap, setSubjectColorMap] = useState<
    Record<string, string>
  >({});

  const todayDow = useMemo(() => dayOfWeekFromDate(), []);

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Resolve teacher_id from profiles
      const { data: profileData } = await supabase
        .from("profiles")
        .select("teacher_id")
        .eq("id", user.id)
        .single();

      const teacherId = profileData?.teacher_id;
      if (!teacherId) {
        setLinked(false);
        setLoading(false);
        return;
      }

      const today = todayISO();
      const yearId = await currentYearId(supabase);
      const [timetableData, todaysCovers, ownAbsence] = await Promise.all([
        fetchTeacherPeriods(supabase, teacherId, yearId),
        fetchCoverPeriods(supabase, teacherId, today),
        fetchOwnAbsence(supabase, teacherId, today),
      ]);
      setEntries(timetableData);
      setCovers(todaysCovers);
      setAbsentToday(ownAbsence?.half_day ?? null);

      // Build subject color map
      const subjects = [
        ...new Set(timetableData.map((e) => e.subject?.name).filter(Boolean)),
      ];
      const colorMap: Record<string, string> = {};
      subjects.forEach((subj) => {
        if (subj) colorMap[subj] = categoricalChip(subj);
      });
      setSubjectColorMap(colorMap);

      setLoading(false);
    }

    fetchData();
  }, []);

  // A teacher can teach two staggered classes that both label a slot the same
  // period number but at different wall-clock times. Return ALL matches (sorted
  // by start time) so neither is dropped from the grid.
  const getEntries = (day: number, period: number) =>
    entries
      .filter((e) => e.day_of_week === day && e.period_number === period)
      .sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));

  // A cover slot may sit outside the teacher's own week (a zero period they
  // never teach), so the row list has to account for both.
  const periodList = useMemo(
    () =>
      periodNumbers([
        ...entries,
        ...covers.flatMap((c) => (c.period ? [c.period] : [])),
      ]),
    [entries, covers]
  );

  const getCovers = (day: number, period: number) =>
    day === todayDow
      ? covers.filter((c) => c.period?.period_number === period)
      : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-navy-900 dark:text-white" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-navy-900 dark:text-white">
          My Timetable
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Your weekly teaching schedule.</p>
      </div>

      <Card className="bg-white dark:bg-card rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-navy-900 dark:text-white">
            <Clock className="h-5 w-5 text-gold-500" />
            Weekly Schedule
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!linked ? (
            <p className="text-center py-12 text-gray-500 dark:text-gray-400 text-sm">
              Your login is not linked to a teacher record yet. Ask the school
              office to link it under Users &amp; Access.
            </p>
          ) : entries.length === 0 && covers.length === 0 ? (
            <p className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
              No timetable configured yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="border border-gray-200 dark:border-border bg-navy-900 text-white px-3 py-2 text-sm font-medium">
                      Period
                    </th>
                    {DAYS.map((day, i) => (
                      <th
                        key={day}
                        className="border border-gray-200 dark:border-border bg-navy-900 text-white px-3 py-2 text-sm font-medium min-w-[140px]"
                      >
                        {day}
                        {absentToday && DAY_NUMBERS[i] === todayDow && (
                          <span className="ml-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                            Absent today
                            {absentToday !== "full"
                              ? ` · ${halfDayShort(absentToday)}`
                              : ""}
                          </span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {periodList.map((period) => (
                    <tr key={period}>
                      <td className="border border-gray-200 dark:border-border bg-gray-50 dark:bg-muted px-3 py-2 text-center text-sm font-medium text-navy-900 dark:text-white">
                        {period}
                      </td>
                      {DAY_NUMBERS.map((day) => {
                        const cellEntries = getEntries(day, period);
                        const cellCovers = getCovers(day, period);
                        if (cellEntries.length === 0 && cellCovers.length === 0) {
                          return (
                            <td
                              key={day}
                              className="border border-gray-200 dark:border-border px-3 py-2 text-center text-sm text-gray-300 dark:text-gray-500"
                            >
                              Free
                            </td>
                          );
                        }
                        return (
                          <td
                            key={day}
                            className="border border-gray-200 dark:border-border p-1"
                          >
                            <div className="space-y-1">
                              {cellEntries.map((entry) => {
                                const colorClass =
                                  subjectColorMap[entry.subject?.name ?? ""] ??
                                  "bg-gray-50 dark:bg-muted border-gray-200 dark:border-border text-gray-800 dark:text-gray-200";
                                return (
                                  <div
                                    key={entry.id}
                                    className={`rounded-lg border p-2 text-xs ${colorClass}`}
                                  >
                                    <p className="font-semibold">
                                      {entry.subject?.name ?? "--"}
                                    </p>
                                    <p className="opacity-75">
                                      {entry.class?.name ?? ""}
                                      {entry.class?.section
                                        ? `-${entry.class.section}`
                                        : ""}
                                    </p>
                                    {entry.start_time && entry.end_time && (
                                      <p className="opacity-60">
                                        {entry.start_time.slice(0, 5)}–
                                        {entry.end_time.slice(0, 5)}
                                      </p>
                                    )}
                                    {entry.room && (
                                      <p className="opacity-60">
                                        Room: {entry.room}
                                      </p>
                                    )}
                                  </div>
                                );
                              })}
                              {cellCovers.map((cover) => (
                                <div
                                  key={cover.id}
                                  className="rounded-lg border border-blue-200 bg-blue-50 p-2 text-xs text-blue-800 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-200"
                                >
                                  <p className="font-semibold">
                                    Cover: {cover.period?.class?.name ?? ""}
                                    {cover.period?.class?.section
                                      ? `-${cover.period.class.section}`
                                      : ""}
                                    {" — "}
                                    {cover.period?.subject?.name ?? "--"}
                                  </p>
                                  {cover.absent_teacher_name && (
                                    <p className="opacity-75">
                                      for {cover.absent_teacher_name}
                                    </p>
                                  )}
                                  {cover.period?.start_time &&
                                    cover.period.end_time && (
                                      <p className="opacity-60">
                                        {cover.period.start_time.slice(0, 5)}–
                                        {cover.period.end_time.slice(0, 5)}
                                      </p>
                                    )}
                                  {cover.period?.room && (
                                    <p className="opacity-60">
                                      Room: {cover.period.room}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
