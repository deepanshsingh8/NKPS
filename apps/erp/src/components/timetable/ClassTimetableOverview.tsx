"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@nkps/shared/lib/supabase/client";
import { fetchAllRows } from "@nkps/shared/lib/fetch-all-rows";
import { Input } from "@nkps/shared/components/ui/input";
import { Button } from "@nkps/shared/components/ui/button";
import { cn, formatClassName } from "@nkps/shared/lib/utils";
import type { Class, Teacher } from "@nkps/shared/types";
import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Clock,
  Loader2,
  FileDown,
  Search,
  UserX,
} from "lucide-react";
import { toast } from "sonner";

interface OverviewRow {
  class_id: string;
  day_of_week: number;
  period_number: number;
  teacher_id: string | null;
  subject_id: string | null;
  is_break: boolean;
}

type Status = "complete" | "gaps" | "empty";

interface ClassStats {
  status: Status;
  /** Slots that should hold something: working days × periods 1..last. */
  expected: number;
  filled: number;
  periodsPerDay: number;
  days: number;
  /** Teaching rows with nobody named to teach them. */
  withoutTeacher: number;
  teachers: number;
  subjects: number;
}

type Filter = "all" | Status | "unassigned";

interface Props {
  classes: Class[];
  teachers: Teacher[];
  onOpen: (classId: string) => void;
  onPrint: (classId: string) => void;
}

// What /timetable shows before a class is picked. It used to be a single line
// — "Pick a class to edit its weekly schedule" — over an empty panel, which
// read as though the page had failed to load. Now it is the list of classes
// and how far along each one's timetable is, so the landing answers the first
// question anyone opening it has: which classes are done, and which are not.
//
// "Complete" is judged against the class itself, since period templates are
// not linked to classes: every working day must have something in every
// period from 1 up to the class's own last period. So nursery on five periods
// and XII on ten are both complete when full, and a hole in the middle of IX's
// Wednesday is caught.
export function ClassTimetableOverview({ classes, teachers, onOpen, onPrint }: Props) {
  const [rows, setRows] = useState<OverviewRow[]>([]);
  // Which set of classes `rows` belongs to. Loading is derived from it rather
  // than toggled, so switching academic year shows the spinner, not last
  // year's progress under this year's class names.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const classIdsKey = classes.map((c) => c.id).join(",");
  const loading = loadedKey !== classIdsKey;

  useEffect(() => {
    const ids = classIdsKey ? classIdsKey.split(",") : [];
    if (ids.length === 0) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      // A full year is ~1,500 rows — past PostgREST's 1000-row cap, so page.
      const { data, error } = await fetchAllRows<OverviewRow>((from, to) =>
        supabase
          .from("timetable_periods")
          .select("class_id, day_of_week, period_number, teacher_id, subject_id, is_break")
          .in("class_id", ids)
          .order("id")
          .range(from, to)
      );
      if (cancelled) return;
      if (error) toast.error("Failed to load timetable progress");
      setRows(data);
      setLoadedKey(classIdsKey);
    })();
    return () => {
      cancelled = true;
    };
  }, [classIdsKey]);

  const stats = useMemo(() => {
    // The school's working days are whichever days any class is timetabled
    // on — Mon–Sat here — so a class missing its whole Saturday shows gaps.
    const schoolDays = new Set(rows.map((r) => r.day_of_week));
    if (schoolDays.size === 0) [1, 2, 3, 4, 5, 6].forEach((d) => schoolDays.add(d));

    const byClass = new Map<string, OverviewRow[]>();
    for (const r of rows) {
      const list = byClass.get(r.class_id);
      if (list) list.push(r);
      else byClass.set(r.class_id, [r]);
    }

    const out = new Map<string, ClassStats>();
    for (const c of classes) {
      const list = byClass.get(c.id) ?? [];
      const periodsPerDay = Math.max(0, ...list.map((r) => r.period_number));
      const cells = new Set(
        list
          .filter((r) => r.period_number >= 1 && schoolDays.has(r.day_of_week))
          .map((r) => `${r.day_of_week}|${r.period_number}`)
      );
      const expected = periodsPerDay * schoolDays.size;
      const filled = cells.size;
      out.set(c.id, {
        status: list.length === 0 ? "empty" : filled >= expected ? "complete" : "gaps",
        expected,
        filled,
        periodsPerDay,
        days: new Set(list.map((r) => r.day_of_week)).size,
        withoutTeacher: list.filter((r) => !r.is_break && !r.teacher_id).length,
        teachers: new Set(list.map((r) => r.teacher_id).filter(Boolean)).size,
        subjects: new Set(list.map((r) => r.subject_id).filter(Boolean)).size,
      });
    }
    return out;
  }, [rows, classes]);

  const teacherName = useMemo(
    () => new Map(teachers.map((t) => [t.id, t.full_name])),
    [teachers]
  );

  const counts = useMemo(() => {
    const c = { all: classes.length, complete: 0, gaps: 0, empty: 0, unassigned: 0 };
    for (const s of stats.values()) {
      c[s.status]++;
      if (s.withoutTeacher > 0) c.unassigned++;
    }
    return c;
  }, [stats, classes.length]);

  const visible = classes.filter((c) => {
    const s = stats.get(c.id);
    if (!s) return false;
    if (filter === "unassigned" && s.withoutTeacher === 0) return false;
    if (filter !== "all" && filter !== "unassigned" && s.status !== filter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const ct = c.class_teacher_id ? teacherName.get(c.class_teacher_id) ?? "" : "";
    return (
      formatClassName(c).toLowerCase().includes(q) || ct.toLowerCase().includes(q)
    );
  });

  const FILTERS: { value: Filter; label: string; count: number }[] = [
    { value: "all", label: "All", count: counts.all },
    { value: "complete", label: "Complete", count: counts.complete },
    { value: "gaps", label: "Has gaps", count: counts.gaps },
    { value: "empty", label: "Not started", count: counts.empty },
    { value: "unassigned", label: "Missing teachers", count: counts.unassigned },
  ];

  if (classes.length === 0) {
    return (
      <div className="erp-table-container p-10 text-center text-sm text-gray-500 dark:text-gray-400">
        <Clock className="mx-auto mb-3 h-7 w-7 text-gray-300 dark:text-gray-600" />
        No classes in this academic year yet. Add them under Academics →
        Classes, then build their timetables here.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search class or class teacher"
            className="pl-8"
            aria-label="Search classes"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              aria-pressed={filter === f.value}
              disabled={loading}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60",
                filter === f.value
                  ? "border-navy-900 bg-navy-900 text-white dark:border-gold-500 dark:bg-gold-500 dark:text-navy-900"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-border dark:text-gray-300 dark:hover:bg-muted"
              )}
            >
              {f.label}
              {!loading && <span className="ml-1 opacity-70">{f.count}</span>}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : visible.length === 0 ? (
        <div className="erp-table-container p-10 text-center text-sm text-gray-500 dark:text-gray-400">
          No classes match.
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((c) => {
            const s = stats.get(c.id)!;
            const pct = s.expected > 0 ? Math.round((s.filled / s.expected) * 100) : 0;
            const empty = Math.max(0, s.expected - s.filled);
            const ct = c.class_teacher_id ? teacherName.get(c.class_teacher_id) : null;
            return (
              <li
                key={c.id}
                className="erp-table-container flex items-stretch transition-colors hover:border-navy-900/30 dark:hover:border-white/20"
              >
                <button
                  type="button"
                  onClick={() => onOpen(c.id)}
                  className="min-w-0 flex-1 p-3 text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-heading text-lg font-semibold leading-tight text-navy-900 dark:text-white truncate">
                        {formatClassName(c)}
                      </div>
                      <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {ct ? `Class teacher: ${ct}` : "No class teacher set"}
                      </div>
                    </div>
                    {s.status === "complete" ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-300">
                        <CircleCheck className="h-3 w-3" />
                        Complete
                      </span>
                    ) : s.status === "gaps" ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                        <CircleAlert className="h-3 w-3" />
                        {empty} empty {empty === 1 ? "slot" : "slots"}
                      </span>
                    ) : (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-muted dark:text-gray-300">
                        <CircleDashed className="h-3 w-3" />
                        Not started
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          s.status === "complete" ? "bg-green-500" : "bg-amber-500"
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-9 text-right text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
                      {pct}%
                    </span>
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
                    {s.status === "empty" ? (
                      <span>No periods yet — open to start</span>
                    ) : (
                      <>
                        <span>
                          {s.days} {s.days === 1 ? "day" : "days"} × {s.periodsPerDay} periods
                        </span>
                        <span>·</span>
                        <span>
                          {s.subjects} {s.subjects === 1 ? "subject" : "subjects"}
                        </span>
                        <span>·</span>
                        <span>
                          {s.teachers} {s.teachers === 1 ? "teacher" : "teachers"}
                        </span>
                      </>
                    )}
                    {s.withoutTeacher > 0 && (
                      <span
                        className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-300"
                        title="Periods with a subject but no teacher named"
                      >
                        <UserX className="h-3 w-3" />
                        {s.withoutTeacher} without teacher
                      </span>
                    )}
                  </div>
                </button>
                {s.status !== "empty" && (
                  <div className="flex items-start border-l border-gray-100 p-1.5 dark:border-border">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onPrint(c.id)}
                      aria-label={`Download ${formatClassName(c)} timetable PDF`}
                      title="Download PDF"
                    >
                      <FileDown className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
