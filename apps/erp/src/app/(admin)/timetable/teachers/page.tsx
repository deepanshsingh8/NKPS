"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { adminFetch } from "@nkps/shared/lib/admin-api";
import { useUrlState } from "@nkps/shared/lib/hooks/use-url-state";
import { Button } from "@nkps/shared/components/ui/button";
import { Input } from "@nkps/shared/components/ui/input";
import { NativeSelect } from "@nkps/shared/components/ui/native-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nkps/shared/components/ui/select";
import { cn } from "@nkps/shared/lib/utils";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Printer,
  Search,
  UserCog,
  UserX,
} from "lucide-react";
import { toast } from "sonner";
import { StaffAvatar } from "@/components/StaffAvatar";
import {
  TeacherWeekGrid,
  type TeacherPeriod,
} from "@/components/timetable/TeacherWeekGrid";
import { MarkAbsentDialog } from "@/components/timetable/MarkAbsentDialog";
import {
  MarkPresentDialog,
  type AbsenceToClear,
} from "@/components/timetable/MarkPresentDialog";
import {
  addDaysIso,
  formatWeekRange,
  halfDayShort,
  todayIso,
  weekStartOf,
  type AbsenceWithCover,
  type HalfDay,
} from "@/lib/timetable-week";

interface RosterTeacher {
  id: string;
  full_name: string;
  employee_id: string | null;
  photo_url: string | null;
  specialization: string | null;
  periods_per_week: number;
  class_count: number;
  day_count: number;
  subjects: string[];
}

type RosterFilter = "all" | "absent" | "unscheduled";
type RosterSort = "name" | "most" | "least";

export default function AdminTeacherTimetablePage() {
  const router = useRouter();

  // In the URL so the back button, a bookmark, and the "View timetable" link
  // from Substitutions all land on the same teacher and week.
  const [selectedTeacherId, setSelectedTeacherId] = useUrlState("teacher_id");
  const [weekParam, setWeekParam] = useUrlState("week");
  const today = todayIso();
  // A hand-edited ?week= that is not a date falls back to this week rather
  // than rendering "Invalid Date" across every header.
  const weekStart = weekStartOf(
    /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? weekParam : today
  );
  const thisWeek = weekStartOf(today);

  const [roster, setRoster] = useState<RosterTeacher[]>([]);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [absentToday, setAbsentToday] = useState<Map<string, HalfDay>>(new Map());

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RosterFilter>("all");
  const [sort, setSort] = useState<RosterSort>("name");

  const [teacherName, setTeacherName] = useState("");
  const [periods, setPeriods] = useState<TeacherPeriod[]>([]);
  const [periodsLoading, setPeriodsLoading] = useState(false);
  const [weekAbsences, setWeekAbsences] = useState<AbsenceWithCover[]>([]);

  const [absentDialog, setAbsentDialog] = useState<{
    open: boolean;
    date: string;
  }>({ open: false, date: "" });
  const [presentTarget, setPresentTarget] = useState<AbsenceToClear | null>(null);

  const fetchAbsentToday = useCallback(async () => {
    const res = await adminFetch(`/api/teacher-absences?date=${todayIso()}`);
    if (!res.ok) return;
    const body = await res.json();
    const rows = (body.data as { teacher_id: string; half_day: HalfDay }[]) ?? [];
    setAbsentToday(new Map(rows.map((r) => [r.teacher_id, r.half_day])));
  }, []);

  useEffect(() => {
    (async () => {
      const res = await adminFetch("/api/teacher-timetable");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Failed to load teachers");
      } else {
        const body = await res.json();
        setRoster((body.data?.teachers as RosterTeacher[]) ?? []);
      }
      setRosterLoading(false);
    })();
    fetchAbsentToday();
  }, [fetchAbsentToday]);

  const fetchTimetable = useCallback(async (teacherId: string) => {
    if (!teacherId) {
      setPeriods([]);
      return;
    }
    setPeriodsLoading(true);
    const res = await adminFetch(
      `/api/teacher-timetable?teacher_id=${teacherId}`
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "Failed to load timetable");
      setPeriods([]);
    } else {
      const body = await res.json();
      setPeriods((body.data?.periods as TeacherPeriod[]) ?? []);
      setTeacherName(body.data?.teacher?.full_name ?? "");
    }
    setPeriodsLoading(false);
  }, []);

  useEffect(() => {
    fetchTimetable(selectedTeacherId);
  }, [selectedTeacherId, fetchTimetable]);

  const fetchWeekAbsences = useCallback(async () => {
    if (!selectedTeacherId) {
      setWeekAbsences([]);
      return;
    }
    const res = await adminFetch(
      `/api/teacher-absences?teacher_id=${selectedTeacherId}&from=${weekStart}&to=${addDaysIso(weekStart, 5)}&include=substitutions`
    );
    if (!res.ok) {
      toast.error("Failed to load absences for this week");
      setWeekAbsences([]);
      return;
    }
    const body = await res.json();
    setWeekAbsences((body.data as AbsenceWithCover[]) ?? []);
  }, [selectedTeacherId, weekStart]);

  useEffect(() => {
    fetchWeekAbsences();
  }, [fetchWeekAbsences]);

  const selectedRoster = roster.find((t) => t.id === selectedTeacherId);
  const selectedName = selectedRoster?.full_name ?? teacherName;

  const maxLoad = useMemo(
    () => Math.max(1, ...roster.map((t) => t.periods_per_week)),
    [roster]
  );
  const visibleRoster = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = roster.filter((t) => {
      if (filter === "absent" && !absentToday.has(t.id)) return false;
      if (filter === "unscheduled" && t.periods_per_week > 0) return false;
      if (!q) return true;
      return (
        t.full_name.toLowerCase().includes(q) ||
        (t.employee_id ?? "").toLowerCase().includes(q) ||
        t.subjects.some((s) => s.toLowerCase().includes(q))
      );
    });
    if (sort === "most") rows.sort((a, b) => b.periods_per_week - a.periods_per_week);
    if (sort === "least") rows.sort((a, b) => a.periods_per_week - b.periods_per_week);
    return rows;
  }, [roster, query, filter, sort, absentToday]);
  const unscheduledCount = roster.filter((t) => t.periods_per_week === 0).length;

  // Distinct slots, not rows: a shared games period is one period of the
  // teacher's week however many sections are on the field.
  const weeklyLoad = new Set(
    periods.filter((p) => !p.is_break).map((p) => `${p.day_of_week}|${p.period_number}`)
  ).size;
  const classCount = new Set(periods.map((p) => p.class_id)).size;

  const handlePrint = async () => {
    if (!selectedTeacherId) return;
    const res = await adminFetch(
      `/api/timetable/sheet?teacher_id=${selectedTeacherId}`
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "Failed to generate the timetable");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const setWeek = (start: string) => setWeekParam(start === thisWeek ? "" : start);

  const openTeacher = (id: string) => {
    setSelectedTeacherId(id);
    window.scrollTo({ top: 0 });
  };

  // ── Roster (nobody picked yet) ────────────────────────────────────────────
  if (!selectedTeacherId) {
    const FILTERS: { value: RosterFilter; label: string; count: number }[] = [
      { value: "all", label: "All", count: roster.length },
      { value: "absent", label: "Absent today", count: absentToday.size },
      { value: "unscheduled", label: "No periods", count: unscheduledCount },
    ];
    return (
      <div>
        <div className="erp-page-bar mb-2">
          <h1 className="font-heading text-2xl font-bold text-navy-900 dark:text-white">
            Teacher Timetable
          </h1>
        </div>
        <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">
          Pick a teacher to see their week across every class, mark them
          absent, or check who is covering for them.
        </p>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, ID or subject"
              className="pl-8"
              aria-label="Search teachers"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                aria-pressed={filter === f.value}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  filter === f.value
                    ? "border-navy-900 bg-navy-900 text-white dark:border-gold-500 dark:bg-gold-500 dark:text-navy-900"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-border dark:text-gray-300 dark:hover:bg-muted"
                )}
              >
                {f.label}
                <span className="ml-1 opacity-70">{f.count}</span>
              </button>
            ))}
          </div>
          <NativeSelect
            value={sort}
            onChange={(e) => setSort(e.target.value as RosterSort)}
            className="w-full sm:ml-auto sm:w-44"
            aria-label="Sort teachers"
          >
            <option value="name">Sort: Name</option>
            <option value="most">Sort: Most periods</option>
            <option value="least">Sort: Fewest periods</option>
          </NativeSelect>
        </div>

        {rosterLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-navy-900 dark:text-white" />
          </div>
        ) : visibleRoster.length === 0 ? (
          <div className="erp-table-container p-10 text-center text-sm text-gray-500 dark:text-gray-400">
            <UserCog className="mx-auto mb-3 h-7 w-7 text-gray-300 dark:text-gray-600" />
            {roster.length === 0
              ? "No active teachers yet. Add them under People → Staff."
              : "No teachers match."}
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibleRoster.map((t) => {
              const absent = absentToday.get(t.id);
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => openTeacher(t.id)}
                    className="erp-table-container flex h-full w-full items-start gap-3 p-3 text-left transition-colors hover:border-navy-900/30 hover:bg-gray-50 dark:hover:border-white/20 dark:hover:bg-muted"
                  >
                    <StaffAvatar name={t.full_name} photoUrl={t.photo_url} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate font-medium text-navy-900 dark:text-white">
                            {t.full_name}
                          </div>
                          <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                            {t.employee_id ?? "—"}
                            {t.subjects.length > 0 && (
                              <>
                                {" · "}
                                {t.subjects.slice(0, 2).join(", ")}
                                {t.subjects.length > 2 && ` +${t.subjects.length - 2}`}
                              </>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-lg font-semibold leading-none text-navy-900 dark:text-white">
                            {t.periods_per_week}
                          </div>
                          <div className="text-[10px] uppercase tracking-wide text-gray-400">
                            per week
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-muted">
                        <div
                          className="h-full rounded-full bg-blue-500"
                          style={{ width: `${(t.periods_per_week / maxLoad) * 100}%` }}
                        />
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
                        {t.periods_per_week === 0 ? (
                          <span className="text-amber-700 dark:text-amber-300">
                            No periods assigned
                          </span>
                        ) : (
                          <span>
                            {t.class_count} {t.class_count === 1 ? "class" : "classes"} ·{" "}
                            {t.day_count} {t.day_count === 1 ? "day" : "days"}
                          </span>
                        )}
                        {absent && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300">
                            <UserX className="h-3 w-3" />
                            Absent today · {halfDayShort(absent)}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  // ── One teacher's week ────────────────────────────────────────────────────
  return (
    <div>
      <div className="erp-page-bar mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setSelectedTeacherId("")}
            aria-label="All teachers"
            title="All teachers"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="font-heading text-2xl font-bold text-navy-900 dark:text-white truncate">
            Teacher Timetable
          </h1>
        </div>
        <Button variant="outline" onClick={handlePrint}>
          <Printer className="h-4 w-4 mr-1" />
          Print
        </Button>
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="w-full sm:w-80">
          <Select
            value={selectedTeacherId}
            items={roster.map((t) => ({
              value: t.id,
              label: `${t.full_name}${t.employee_id ? ` (${t.employee_id})` : ""}`,
            }))}
            onValueChange={(val) => val && setSelectedTeacherId(val)}
          >
            <SelectTrigger>
              <SelectValue placeholder={selectedName || "Select a teacher..."} />
            </SelectTrigger>
            <SelectContent>
              {roster.map((t) => (
                <SelectItem
                  key={t.id}
                  value={t.id}
                  label={`${t.full_name}${t.employee_id ? ` (${t.employee_id})` : ""}`}
                >
                  {t.full_name}
                  {t.employee_id ? (
                    <span className="text-gray-400 dark:text-gray-500 ml-1">
                      ({t.employee_id})
                    </span>
                  ) : null}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setWeek(addDaysIso(weekStart, -7))}
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant={weekStart === thisWeek ? "secondary" : "outline"}
            size="sm"
            onClick={() => setWeek(thisWeek)}
          >
            This week
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setWeek(addDaysIso(weekStart, 7))}
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="ml-1 text-sm font-medium text-gray-700 dark:text-gray-200">
            {formatWeekRange(weekStart)}
          </span>
        </div>
      </div>

      {!periodsLoading && periods.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600 dark:text-gray-300">
          <span className="font-medium text-navy-900 dark:text-white">{selectedName}</span>
          <span>
            {weeklyLoad} periods a week · {classCount}{" "}
            {classCount === 1 ? "class" : "classes"}
          </span>
          {weekAbsences.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300">
              <UserX className="h-3 w-3" />
              Absent {weekAbsences.length} {weekAbsences.length === 1 ? "day" : "days"} this week
            </span>
          )}
        </div>
      )}

      {periodsLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : periods.length === 0 ? (
        <div className="erp-table-container p-4 sm:p-6 text-center text-sm text-gray-500 dark:text-gray-400">
          {selectedName || "This teacher"} has no periods assigned in the
          current timetable.
        </div>
      ) : (
        <TeacherWeekGrid
          periods={periods}
          weekStart={weekStart}
          absences={weekAbsences}
          onMarkAbsent={(date) => setAbsentDialog({ open: true, date })}
          onMarkPresent={(a) =>
            setPresentTarget({
              id: a.id,
              teacherName: selectedName,
              date: a.absence_date,
              halfDay: a.half_day,
              coverCount: a.substitutions?.length ?? 0,
            })
          }
        />
      )}

      <MarkAbsentDialog
        open={absentDialog.open}
        onOpenChange={(open) => setAbsentDialog((s) => ({ ...s, open }))}
        teacherId={selectedTeacherId}
        teacherName={selectedName}
        initialDate={absentDialog.date}
        onSaved={({ absenceId, affectedPeriods, date }) => {
          setAbsentDialog((s) => ({ ...s, open: false }));
          // The form lets the date change; follow it so the badge is on screen.
          setWeek(weekStartOf(date));
          fetchWeekAbsences();
          fetchAbsentToday();
          const n = affectedPeriods.length;
          toast.success(
            n > 0
              ? `Marked absent — ${n} ${n === 1 ? "period needs" : "periods need"} cover`
              : "Marked absent",
            n > 0
              ? {
                  action: {
                    label: "Assign cover",
                    onClick: () =>
                      router.push(
                        `/timetable/substitutions?date=${date}&absence=${absenceId}`
                      ),
                  },
                }
              : undefined
          );
        }}
      />

      <MarkPresentDialog
        absence={presentTarget}
        onOpenChange={(open) => !open && setPresentTarget(null)}
        onCleared={() => {
          setPresentTarget(null);
          fetchWeekAbsences();
          fetchAbsentToday();
        }}
      />
    </div>
  );
}
