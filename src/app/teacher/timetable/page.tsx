"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Clock } from "lucide-react";

interface TimetableEntry {
  id: string;
  day_of_week: number;
  period_number: number;
  start_time: string;
  end_time: string;
  room: string | null;
  subject: { name: string } | null;
  class: { name: string; section: string } | null;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NUMBERS = [1, 2, 3, 4, 5, 6]; // Monday=1 through Saturday=6
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

// Color palette for visual distinction by subject
const SUBJECT_COLORS = [
  "bg-blue-50 border-blue-200 text-blue-800",
  "bg-green-50 border-green-200 text-green-800",
  "bg-purple-50 border-purple-200 text-purple-800",
  "bg-amber-50 border-amber-200 text-amber-800",
  "bg-pink-50 border-pink-200 text-pink-800",
  "bg-teal-50 border-teal-200 text-teal-800",
  "bg-indigo-50 border-indigo-200 text-indigo-800",
  "bg-orange-50 border-orange-200 text-orange-800",
  "bg-cyan-50 border-cyan-200 text-cyan-800",
  "bg-rose-50 border-rose-200 text-rose-800",
];

export default function TeacherTimetablePage() {
  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [subjectColorMap, setSubjectColorMap] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("timetable_periods")
        .select(
          "id, day_of_week, period_number, start_time, end_time, room, subject:subjects(name), class:classes(name, section)"
        )
        .eq("teacher_id", user.id)
        .order("period_number", { ascending: true });

      const timetableData = (data ?? []) as unknown as TimetableEntry[];
      setEntries(timetableData);

      // Build subject color map
      const subjects = [
        ...new Set(timetableData.map((e) => e.subject?.name).filter(Boolean)),
      ];
      const colorMap: Record<string, string> = {};
      subjects.forEach((subj, i) => {
        if (subj) colorMap[subj] = SUBJECT_COLORS[i % SUBJECT_COLORS.length];
      });
      setSubjectColorMap(colorMap);

      setLoading(false);
    }

    fetchData();
  }, []);

  const getEntry = (day: number, period: number) =>
    entries.find(
      (e) => e.day_of_week === day && e.period_number === period
    );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-navy-900" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-navy-900">
          My Timetable
        </h1>
        <p className="text-gray-500 mt-1">Your weekly teaching schedule.</p>
      </div>

      <Card className="bg-white rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-navy-900">
            <Clock className="h-5 w-5 text-gold-500" />
            Weekly Schedule
          </CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-center py-12 text-gray-400 text-sm">
              No timetable configured yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="border border-gray-200 bg-navy-900 text-white px-3 py-2 text-sm font-medium">
                      Period
                    </th>
                    {DAYS.map((day) => (
                      <th
                        key={day}
                        className="border border-gray-200 bg-navy-900 text-white px-3 py-2 text-sm font-medium min-w-[140px]"
                      >
                        {day}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERIODS.map((period) => (
                    <tr key={period}>
                      <td className="border border-gray-200 bg-gray-50 px-3 py-2 text-center text-sm font-medium text-navy-900">
                        {period}
                      </td>
                      {DAY_NUMBERS.map((day) => {
                        const entry = getEntry(day, period);
                        if (!entry) {
                          return (
                            <td
                              key={day}
                              className="border border-gray-200 px-3 py-2 text-center text-sm text-gray-300"
                            >
                              Free
                            </td>
                          );
                        }
                        const colorClass =
                          subjectColorMap[entry.subject?.name ?? ""] ??
                          "bg-gray-50 border-gray-200 text-gray-800";
                        return (
                          <td
                            key={day}
                            className="border border-gray-200 p-1"
                          >
                            <div
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
                              {entry.room && (
                                <p className="opacity-60">
                                  Room: {entry.room}
                                </p>
                              )}
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
