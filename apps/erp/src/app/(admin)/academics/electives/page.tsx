"use client";

/**
 * §5 Class XI/XII Elective Slot Manager.
 * Two sections:
 *  1. Slot options — admin-editable list of subjects shown in each elective slot.
 *     XI and XII have SEPARATE lists, chosen with the class tabs; a subject
 *     offered to both is one row naming both, not a duplicate per class.
 *  2. Per-student picks — for each XI/XII student, two dropdowns (Elective 5,
 *     Elective 6), each showing only the options offered to that student's class.
 *
 * Backed by /api/electives, /api/electives/options, /api/electives/students.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@nkps/shared/components/ui/button";
import { Label } from "@nkps/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nkps/shared/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@nkps/shared/components/ui/table";
import {
  SortFilterHead,
  TableFilterSummary,
  useTableControls,
  type TableColumns,
} from "@nkps/shared/components/ui/data-table";
import { Badge } from "@nkps/shared/components/ui/badge";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { adminFetch } from "@nkps/shared/lib/admin-api";
import {
  ELECTIVE_CLASSES,
  normaliseElectiveClasses,
  optionAppliesTo,
  type ElectiveClass,
} from "@nkps/shared/lib/electives";
import { createClient } from "@nkps/shared/lib/supabase/client";
import { cn } from "@nkps/shared/lib/utils";
import { toast } from "sonner";

interface SlotOption {
  id: string;
  slot: number;
  subject_id: string;
  label: string | null;
  sort_order: number;
  // NULL/absent on rows written before the lists were split — treated as
  // "both" by normaliseElectiveClasses so nothing silently disappears.
  applies_to_classes: string[] | null;
  subjects: {
    id: string;
    name: string;
    code: string | null;
    nickname: string | null;
  } | null;
}

// Supabase returns embedded resources as either an object or a single-element
// array depending on the relationship; the StudentRow uses a union to match.
type Embedded<T> = T | T[] | null;

interface StudentRow {
  id: string;
  student_id: string;
  class_id: string;
  stream_id: string | null;
  classes: Embedded<{ id: string; name: string; section: string }>;
  streams: Embedded<{ id: string; name: string }>;
  students: Embedded<{ id: string; admission_no: string; full_name: string }>;
}

function pickOne<T>(x: Embedded<T>): T | null {
  if (!x) return null;
  return Array.isArray(x) ? x[0] ?? null : x;
}

interface Pick {
  student_id: string;
  elective_slot: number;
  subject_id: string;
  subject_name: string;
}

interface SubjectLite {
  id: string;
  name: string;
  code: string | null;
}

const SLOTS = [5, 6] as const;

export default function ElectivesPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [options, setOptions] = useState<SlotOption[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [allSubjects, setAllSubjects] = useState<SubjectLite[]>([]);

  const [classTab, setClassTab] = useState<ElectiveClass>("XI");
  const [newSubjectIdBySlot, setNewSubjectIdBySlot] = useState<Record<number, string>>({});
  const [savingStudent, setSavingStudent] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [eRes, sRes] = await Promise.all([
      adminFetch("/api/electives"),
      supabase.from("subjects").select("id, name, code").eq("is_active", true).order("name"),
    ]);
    if (!eRes.ok) {
      toast.error("Failed to load electives");
      setLoading(false);
      return;
    }
    const data = await eRes.json();
    setOptions(data.options ?? []);
    setStudents(data.students ?? []);
    setPicks(data.picks ?? []);
    setAllSubjects((sRes.data as SubjectLite[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Options bucketed by class, then by slot. Built once per fetch rather than
  // per rendered cell — the student table reads it for every row. Both the
  // admin list (active tab) and each student's dropdown (their own class) read
  // from this, so the curated list and the assignable list cannot drift.
  const optionsByClassSlot = useMemo(() => {
    const byClass = new Map<string, Map<number, SlotOption[]>>();
    for (const cls of ELECTIVE_CLASSES) byClass.set(cls, new Map());
    for (const o of options) {
      for (const cls of ELECTIVE_CLASSES) {
        if (!optionAppliesTo(o.applies_to_classes, cls)) continue;
        const bySlot = byClass.get(cls)!;
        const arr = bySlot.get(o.slot) ?? [];
        arr.push(o);
        bySlot.set(o.slot, arr);
      }
    }
    return byClass;
  }, [options]);

  const optionsFor = useCallback(
    (cls: string, slot: number) =>
      optionsByClassSlot.get(cls)?.get(slot) ?? [],
    [optionsByClassSlot]
  );

  // How many options each class has, for the tab counters.
  const countByClass = useMemo(() => {
    const counts = {} as Record<ElectiveClass, number>;
    for (const cls of ELECTIVE_CLASSES) {
      let total = 0;
      for (const arr of optionsByClassSlot.get(cls)?.values() ?? []) {
        total += arr.length;
      }
      counts[cls] = total;
    }
    return counts;
  }, [optionsByClassSlot]);

  const pickFor = useCallback(
    (studentId: string, slot: number) =>
      picks.find((p) => p.student_id === studentId && p.elective_slot === slot),
    [picks]
  );

  // Header sort/filter accessors — mirror what the matching cell renders.
  // The elective slot columns hold live <Select> pickers, so they stay plain.
  const columns = useMemo<TableColumns<StudentRow>>(
    () => ({
      admission_no: {
        label: "Admission #",
        value: (s) => pickOne(s.students)?.admission_no ?? null,
        filter: "text",
      },
      full_name: {
        label: "Name",
        value: (s) => pickOne(s.students)?.full_name ?? null,
        filter: "text",
      },
      class: {
        label: "Class",
        value: (s) => {
          const cls = pickOne(s.classes);
          return cls ? `${cls.name}-${cls.section}` : null;
        },
      },
      stream: {
        label: "Stream",
        value: (s) => pickOne(s.streams)?.name ?? null,
      },
    }),
    []
  );

  const table = useTableControls({ rows: students, columns });

  // Adds to the class currently selected in the tabs. If the subject is
  // already offered in this slot to the OTHER class, the server widens that
  // single row rather than creating a duplicate.
  const handleAddOption = async (slot: number) => {
    const subjectId = newSubjectIdBySlot[slot];
    if (!subjectId) {
      toast.error("Pick a subject first");
      return;
    }
    const res = await adminFetch("/api/electives/options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slot,
        subject_id: subjectId,
        applies_to_classes: [classTab],
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || "Failed to add option");
      return;
    }
    setNewSubjectIdBySlot((s) => ({ ...s, [slot]: "" }));
    await refresh();
  };

  // Removing from the XI list must not empty the XII list. If the option is
  // shared, narrow it to the other class; only when this tab holds its last
  // class does the row go.
  const handleRemoveOption = async (option: SlotOption) => {
    const current = normaliseElectiveClasses(option.applies_to_classes);
    const remaining = current.filter((c) => c !== classTab);
    const name = option.subjects?.name ?? "this subject";

    const message =
      remaining.length > 0
        ? `Remove ${name} from the class ${classTab} list? It stays available to ${remaining.join(" & ")}.`
        : `Remove ${name} from Elective ${option.slot} entirely? Students who already picked it keep their selection until you change it.`;
    if (!confirm(message)) return;

    const res = await adminFetch("/api/electives/options", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: option.id, applies_to_classes: remaining }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || "Failed to remove option");
      return;
    }
    await refresh();
  };

  const handleSetPick = async (studentId: string, slot: number, subjectId: string) => {
    setSavingStudent(`${studentId}:${slot}`);
    if (!subjectId) {
      const res = await adminFetch(
        `/api/electives/students?student_id=${studentId}&slot=${slot}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to clear pick");
      }
    } else {
      const res = await adminFetch("/api/electives/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_id: studentId, slot, subject_id: subjectId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to save pick");
      } else {
        toast.success("Saved");
      }
    }
    await refresh();
    setSavingStudent(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold text-navy-900 dark:text-white">
          Class XI–XII Electives
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Configure the subjects available in each elective slot, then assign each
          senior-class student to one option per slot.
        </p>
      </header>

      {/* ─────────────── Slot options manager ─────────────── */}
      <section className="erp-table-container p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-heading text-lg font-semibold">Slot options</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              XI and XII have separate lists. A subject added to both shows in
              both tabs and is stored once — removing it here only takes it off
              the class {classTab} list.
            </p>
          </div>
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-muted rounded-xl p-1">
            {ELECTIVE_CLASSES.map((cls) => (
              <button
                key={cls}
                onClick={() => setClassTab(cls)}
                className={cn(
                  "flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200",
                  classTab === cls
                    ? "bg-white dark:bg-card text-navy-900 dark:text-white shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-navy-900 dark:hover:text-white"
                )}
              >
                Class {cls}
                <span className="text-xs text-gray-400">{countByClass[cls]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {SLOTS.map((slot) => {
            const slotOptions = optionsFor(classTab, slot);
            return (
              <div key={slot} className="rounded-xl border border-gray-200 p-4 dark:border-border">
                <h3 className="text-sm font-semibold mb-3">
                  Elective {slot}
                  <span className="ml-1.5 text-xs font-normal text-gray-400">
                    class {classTab}
                  </span>
                </h3>
                <ul className="space-y-1.5 mb-3">
                  {slotOptions.length === 0 && (
                    <li className="text-xs text-gray-400 italic">
                      No options for class {classTab} yet.
                    </li>
                  )}
                  {slotOptions.map((o) => {
                    const shared =
                      normaliseElectiveClasses(o.applies_to_classes).length > 1;
                    return (
                    <li
                      key={o.id}
                      className="flex items-center justify-between gap-2 rounded-md bg-gray-50 dark:bg-muted px-2.5 py-1.5"
                    >
                      <span className="text-sm">
                        {o.subjects?.name ?? "Unknown"}
                        {o.subjects?.code && (
                          <span className="text-xs text-gray-400 ml-1">({o.subjects.code})</span>
                        )}
                        {shared && (
                          <Badge
                            variant="secondary"
                            className="ml-1.5 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 text-[10px]"
                          >
                            XI &amp; XII
                          </Badge>
                        )}
                      </span>
                      <button
                        onClick={() => handleRemoveOption(o)}
                        title={
                          shared
                            ? `Remove from the class ${classTab} list`
                            : "Remove option"
                        }
                        className="text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                    );
                  })}
                </ul>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label className="text-[11px] text-gray-500">
                      Add subject to class {classTab}
                    </Label>
                    <Select
                      value={newSubjectIdBySlot[slot] ?? ""}
                      onValueChange={(v) => setNewSubjectIdBySlot((s) => ({ ...s, [slot]: v ?? "" }))}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Pick a subject" />
                      </SelectTrigger>
                      <SelectContent>
                        {allSubjects
                          .filter((s) => !slotOptions.find((o) => o.subject_id === s.id))
                          .map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}{s.code ? ` (${s.code})` : ""}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleAddOption(slot)}
                    className="bg-navy-900 hover:bg-navy-800 text-white"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─────────────── Per-student picker ─────────────── */}
      <section className="erp-table-container p-6">
        <h2 className="font-heading text-lg font-semibold mb-4">
          Class XI–XII students
        </h2>
        {students.length === 0 ? (
          <p className="text-sm text-gray-400 italic">
            No XI/XII students enrolled in the current academic year.
          </p>
        ) : (
          <>
          <TableFilterSummary
            ctl={table}
            total={students.length}
            shown={table.rows.length}
          />
          <Table>
            <TableHeader>
              <TableRow>
                <SortFilterHead ctl={table} col="admission_no" />
                <SortFilterHead ctl={table} col="full_name" />
                <SortFilterHead ctl={table} col="class" />
                <SortFilterHead ctl={table} col="stream" />
                {SLOTS.map((slot) => (
                  <TableHead key={slot}>Elective {slot}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4 + SLOTS.length} className="py-10 text-center text-gray-500 dark:text-gray-400">
                    No students match the column filters.
                  </TableCell>
                </TableRow>
              )}
              {table.rows.map((s) => {
                const cls = pickOne(s.classes);
                const stu = pickOne(s.students);
                const str = pickOne(s.streams);
                return (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">
                    {stu?.admission_no ?? "—"}
                  </TableCell>
                  <TableCell className="font-medium">
                    {stu?.full_name ?? "—"}
                  </TableCell>
                  <TableCell>
                    {cls?.name}-{cls?.section}
                  </TableCell>
                  <TableCell>
                    {str?.name ? (
                      <Badge variant="secondary" className="bg-gray-100">
                        {str.name}
                      </Badge>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </TableCell>
                  {SLOTS.map((slot) => {
                    // Scoped to this student's class, not the tab above — the
                    // table lists XI and XII together.
                    const slotOptions = optionsFor(cls?.name ?? "", slot);
                    const current = pickFor(s.student_id, slot);
                    const saving = savingStudent === `${s.student_id}:${slot}`;
                    return (
                      <TableCell key={slot}>
                        <div className="flex items-center gap-1.5">
                          <Select
                            value={current?.subject_id ?? ""}
                            onValueChange={(v) => handleSetPick(s.student_id, slot, v ?? "")}
                            disabled={saving}
                          >
                            <SelectTrigger className="h-8 text-xs min-w-[180px]">
                              <SelectValue
                                placeholder={
                                  saving
                                    ? "Saving…"
                                    : slotOptions.length === 0
                                      ? `No class ${cls?.name ?? "—"} options`
                                      : "Not picked"
                                }
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {slotOptions.map((o) => (
                                <SelectItem key={o.id} value={o.subject_id}>
                                  {o.subjects?.name ?? "Unknown"}
                                </SelectItem>
                              ))}
                              {/* A pick made before the lists were split can
                                  fall outside this class's options. Keep it
                                  listed so the cell shows a name instead of a
                                  raw id, and flag it for the admin. */}
                              {current &&
                                !slotOptions.some(
                                  (o) => o.subject_id === current.subject_id
                                ) && (
                                  <SelectItem
                                    value={current.subject_id}
                                    label={`${current.subject_name} (not offered to ${cls?.name ?? "this class"})`}
                                  >
                                    {current.subject_name}
                                    <span className="ml-1 text-[10px] text-amber-600">
                                      not offered to {cls?.name ?? "this class"}
                                    </span>
                                  </SelectItem>
                                )}
                            </SelectContent>
                          </Select>
                          {current && !saving && (
                            <button
                              onClick={() => handleSetPick(s.student_id, slot, "")}
                              title="Clear pick"
                              className="text-gray-400 hover:text-red-500"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
                        </div>
                      </TableCell>
                    );
                  })}
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </>
        )}
      </section>
    </div>
  );
}

