"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Pencil,
  Loader2,
  ClipboardList,
  AlertTriangle,
  CheckCircle2,
  Scale,
} from "lucide-react";
import { adminApi } from "@/lib/admin-api";
import { cn } from "@/lib/utils";
import type {
  ExamType,
  ExamKind,
  ExamClassLevel,
  AcademicYear,
} from "@/types";

const KIND_OPTIONS: { value: ExamKind; label: string; hint: string }[] = [
  { value: "term_exam", label: "Term Exam", hint: "Major exams (Half-Yearly, Annual)" },
  { value: "class_test", label: "Class Test", hint: "Periodic tests, weighted into the final result" },
  { value: "practical", label: "Practical", hint: "Lab / practical assessments" },
];

const KIND_LABELS: Record<ExamKind, string> = Object.fromEntries(
  KIND_OPTIONS.map((k) => [k.value, k.label])
) as Record<ExamKind, string>;

type LevelDef = {
  value: ExamClassLevel;
  label: string;
  short: string;
  hint: string;
};

const LEVEL_DEFS: LevelDef[] = [
  { value: "all", label: "All Levels", short: "All", hint: "Counts toward every level's weightage" },
  { value: "nursery_ukg", label: "Pre-Primary (Nursery–UKG)", short: "Pre-Primary", hint: "Nursery, LKG, UKG" },
  { value: "i_v", label: "Primary (I–V)", short: "Primary", hint: "Classes I to V" },
  { value: "vi_viii", label: "Middle (VI–VIII)", short: "Middle", hint: "Classes VI to VIII" },
  { value: "ix_x", label: "Secondary (IX–X)", short: "Secondary", hint: "Classes IX to X" },
  { value: "xi_xii", label: "Sr. Sec. (XI–XII)", short: "Sr. Sec.", hint: "Classes XI to XII" },
];

const LEVEL_LABELS: Record<ExamClassLevel, string> = Object.fromEntries(
  LEVEL_DEFS.map((l) => [l.value, l.short])
) as Record<ExamClassLevel, string>;

// Levels that carry a weightage total (exclude the umbrella "all" tab).
const SCOPED_LEVELS: ExamClassLevel[] = LEVEL_DEFS.filter(
  (l) => l.value !== "all"
).map((l) => l.value);

type TabValue = ExamClassLevel;

function examAppliesToLevel(examLevel: ExamClassLevel, tab: TabValue): boolean {
  if (tab === "all") return true; // "All Levels" tab shows everything
  return examLevel === tab || examLevel === "all";
}

function sumWeightageForLevel(exams: ExamType[], level: ExamClassLevel): number {
  return exams
    .filter((e) => examAppliesToLevel(e.class_level, level))
    .reduce((acc, e) => acc + (e.weightage ?? 0), 0);
}

function roundToTwo(n: number): number {
  return Math.round(n * 100) / 100;
}

interface CoverageStatus {
  sum: number;
  state: "balanced" | "under" | "over" | "empty";
  diff: number; // positive = over, negative = under (absolute value of missing/excess)
}

function getCoverage(exams: ExamType[], level: ExamClassLevel): CoverageStatus {
  const visible = exams.filter((e) => examAppliesToLevel(e.class_level, level));
  if (visible.length === 0) return { sum: 0, state: "empty", diff: 0 };
  const sum = roundToTwo(sumWeightageForLevel(exams, level));
  if (sum === 100) return { sum, state: "balanced", diff: 0 };
  if (sum < 100) return { sum, state: "under", diff: roundToTwo(100 - sum) };
  return { sum, state: "over", diff: roundToTwo(sum - 100) };
}

export default function AdminExamTypesPage() {
  const supabase = createClient();

  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [selectedYearId, setSelectedYearId] = useState<string>("");
  const [selectedLevel, setSelectedLevel] = useState<TabValue>("all");

  const [formData, setFormData] = useState({
    name: "",
    academic_year_id: "",
    max_marks: "100",
    weightage: "",
    sort_order: "0",
    kind: "term_exam" as ExamKind,
    upper_header: "",
    class_level: "all" as ExamClassLevel,
  });

  const fetchData = useCallback(async () => {
    const [etRes, ayRes] = await Promise.all([
      supabase.from("exam_types").select("*").order("sort_order", { ascending: true }),
      supabase.from("academic_years").select("*").order("start_date", { ascending: false }),
    ]);

    const exams = (etRes.data as ExamType[]) ?? [];
    const years = (ayRes.data as AcademicYear[]) ?? [];
    setExamTypes(exams);
    setAcademicYears(years);

    setSelectedYearId((prev) => {
      if (prev && years.some((y) => y.id === prev)) return prev;
      return years.find((y) => y.is_current)?.id ?? years[0]?.id ?? "";
    });

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const yearExams = useMemo(
    () => examTypes.filter((e) => e.academic_year_id === selectedYearId),
    [examTypes, selectedYearId]
  );

  const tabExams = useMemo(
    () => yearExams.filter((e) => examAppliesToLevel(e.class_level, selectedLevel)),
    [yearExams, selectedLevel]
  );

  const tabCoverage = useMemo(
    () => getCoverage(yearExams, selectedLevel),
    [yearExams, selectedLevel]
  );

  // Per-scoped-level coverage for banner summary and tab status dots.
  const levelCoverage = useMemo(() => {
    const map: Partial<Record<ExamClassLevel, CoverageStatus>> = {};
    for (const level of SCOPED_LEVELS) {
      map[level] = getCoverage(yearExams, level);
    }
    return map;
  }, [yearExams]);

  const unbalancedLevels = useMemo(
    () =>
      SCOPED_LEVELS.filter((lvl) => {
        const c = levelCoverage[lvl];
        return c && c.state !== "balanced" && c.state !== "empty";
      }),
    [levelCoverage]
  );

  const resetForm = () => {
    const currentYear = academicYears.find((ay) => ay.is_current);
    setFormData({
      name: "",
      academic_year_id: selectedYearId || currentYear?.id || "",
      max_marks: "100",
      weightage: "",
      sort_order: "0",
      kind: "term_exam",
      upper_header: "",
      class_level: selectedLevel === "all" ? "i_v" : selectedLevel,
    });
    setEditingId(null);
  };

  const openAdd = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (et: ExamType) => {
    setEditingId(et.id);
    setFormData({
      name: et.name,
      academic_year_id: et.academic_year_id,
      max_marks: String(et.max_marks),
      weightage: et.weightage !== null ? String(et.weightage) : "",
      sort_order: String(et.sort_order),
      kind: et.kind ?? "term_exam",
      upper_header: et.upper_header ?? "",
      class_level: et.class_level ?? "all",
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!formData.academic_year_id) {
      toast.error("Please select an academic year");
      return;
    }

    setSubmitting(true);

    const data = {
      name: formData.name.trim(),
      academic_year_id: formData.academic_year_id,
      max_marks: parseInt(formData.max_marks) || 100,
      weightage: formData.weightage ? parseFloat(formData.weightage) : null,
      sort_order: parseInt(formData.sort_order) || 0,
      kind: formData.kind,
      upper_header: formData.upper_header.trim() || null,
      class_level: formData.class_level,
    };

    const result = editingId
      ? await adminApi({
          action: "update",
          table: "exam_types",
          data,
          match: { column: "id", value: editingId },
        })
      : await adminApi({ action: "insert", table: "exam_types", data });

    if (!result.success) {
      toast.error(result.error || "Failed to save exam type");
    } else {
      toast.success(editingId ? "Exam type updated" : "Exam type created");
      setDialogOpen(false);
      resetForm();
      await fetchData();
    }
    setSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this exam type? This cannot be undone.")) return;

    const result = await adminApi({
      action: "delete",
      table: "exam_types",
      match: { column: "id", value: id },
    });

    if (!result.success) {
      toast.error("Failed to delete exam type");
      return;
    }

    toast.success("Exam type deleted");
    await fetchData();
  };

  const handleAutoBalance = async () => {
    if (selectedLevel === "all") return;
    const scoped = yearExams.filter((e) => e.class_level === selectedLevel);
    if (scoped.length === 0) {
      toast.info("No level-specific exams to balance");
      return;
    }
    // Weightage already "locked" by exams with class_level='all' (shared across levels).
    const allLevelSum = yearExams
      .filter((e) => e.class_level === "all")
      .reduce((acc, e) => acc + (e.weightage ?? 0), 0);
    const remaining = 100 - allLevelSum;
    if (remaining <= 0) {
      toast.error(
        `"All Levels" exams already use ${allLevelSum}% — reduce those first before auto-balancing`
      );
      return;
    }

    const even = roundToTwo(remaining / scoped.length);
    // Give first exam the rounding remainder so the sum is exactly `remaining`.
    const drift = roundToTwo(remaining - even * scoped.length);

    if (
      !confirm(
        `Distribute ${remaining}% evenly across ${scoped.length} ${LEVEL_LABELS[selectedLevel]} exam${scoped.length > 1 ? "s" : ""} (~${even}% each)?`
      )
    )
      return;

    setSubmitting(true);
    const updates = scoped.map((exam, i) =>
      adminApi({
        action: "update",
        table: "exam_types",
        data: { weightage: i === 0 ? roundToTwo(even + drift) : even },
        match: { column: "id", value: exam.id },
      })
    );

    const results = await Promise.all(updates);
    const failed = results.filter((r) => !r.success).length;
    if (failed > 0) {
      toast.error(`${failed} exam${failed > 1 ? "s" : ""} failed to update`);
    } else {
      toast.success("Weightages balanced to 100%");
    }
    await fetchData();
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-navy-900 dark:text-white" />
      </div>
    );
  }

  const selectedYear = academicYears.find((y) => y.id === selectedYearId);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-navy-900 dark:text-white">
            Exam Types
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Define exams per class level. Weightages per level must sum to 100%.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={selectedYearId}
            items={academicYears.map((ay) => ({ value: ay.id, label: ay.name }))}
            onValueChange={(val) => val && setSelectedYearId(val)}
          >
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue placeholder="Academic Year" />
            </SelectTrigger>
            <SelectContent>
              {academicYears.map((ay) => (
                <SelectItem key={ay.id} value={ay.id} label={ay.name}>
                  {ay.name}
                  {ay.is_current ? " (current)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={openAdd}
            className="bg-navy-900 hover:bg-navy-800 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Exam Type
          </Button>
        </div>
      </div>

      {unbalancedLevels.length > 0 && selectedYear && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20 p-3 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500 mt-0.5 shrink-0" />
          <div className="flex-1 text-xs">
            <p className="font-medium text-amber-900 dark:text-amber-200">
              {unbalancedLevels.length} level{unbalancedLevels.length > 1 ? "s" : ""} unbalanced for {selectedYear.name}
            </p>
            <p className="text-amber-800/80 dark:text-amber-300/80 mt-0.5">
              {unbalancedLevels
                .map((lvl) => {
                  const c = levelCoverage[lvl]!;
                  return `${LEVEL_LABELS[lvl]} ${c.sum}%`;
                })
                .join(" • ")}
            </p>
          </div>
        </div>
      )}

      <Tabs
        value={selectedLevel}
        onValueChange={(v) => v && setSelectedLevel(v as TabValue)}
        className="mb-4"
      >
        <TabsList className="flex-wrap h-auto">
          {LEVEL_DEFS.map((lvl) => {
            const cov = lvl.value === "all" ? null : levelCoverage[lvl.value];
            const dot =
              cov?.state === "balanced"
                ? "bg-emerald-500"
                : cov?.state === "under"
                  ? "bg-amber-500"
                  : cov?.state === "over"
                    ? "bg-red-500"
                    : null;
            return (
              <TabsTrigger key={lvl.value} value={lvl.value}>
                <span className="flex items-center gap-1.5">
                  {lvl.short}
                  {dot && (
                    <span
                      className={cn("h-1.5 w-1.5 rounded-full", dot)}
                      aria-hidden
                    />
                  )}
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      <div className="erp-table-container p-6">
        <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
          <div>
            <h2 className="text-sm font-semibold text-navy-900 dark:text-white">
              {LEVEL_DEFS.find((l) => l.value === selectedLevel)?.label}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {LEVEL_DEFS.find((l) => l.value === selectedLevel)?.hint}
              {selectedLevel !== "all" &&
                " — counts 'All Levels' exams toward this total."}
            </p>
          </div>
          {selectedLevel !== "all" && (
            <div className="flex items-center gap-2">
              <CoverageChip status={tabCoverage} />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAutoBalance}
                disabled={
                  submitting ||
                  yearExams.filter((e) => e.class_level === selectedLevel)
                    .length === 0
                }
                className="h-8 text-xs"
              >
                <Scale className="h-3.5 w-3.5 mr-1.5" />
                Auto-balance
              </Button>
            </div>
          )}
        </div>

        {tabExams.length === 0 ? (
          <div className="text-center py-12 text-gray-400 dark:text-gray-500">
            <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No exams for this level yet</p>
            <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">
              Add an exam type and pick &quot;
              {LEVEL_LABELS[selectedLevel] ?? "a level"}&quot; to start building this
              scheme
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Applies To</TableHead>
                <TableHead>Max Marks</TableHead>
                <TableHead>Weightage</TableHead>
                <TableHead>Upper Header</TableHead>
                <TableHead>Sort</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tabExams.map((et) => (
                <TableRow key={et.id}>
                  <TableCell className="font-medium">{et.name}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                      {KIND_LABELS[et.kind ?? "term_exam"]}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium",
                        et.class_level === "all"
                          ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                          : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                      )}
                    >
                      {LEVEL_LABELS[et.class_level ?? "all"]}
                    </span>
                  </TableCell>
                  <TableCell>{et.max_marks}</TableCell>
                  <TableCell>
                    {et.weightage !== null ? (
                      <span className="font-medium">{et.weightage}%</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-gray-500 max-w-[200px] truncate">
                    {et.upper_header ?? "—"}
                  </TableCell>
                  <TableCell>{et.sort_order}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => openEdit(et)}
                        className="text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDelete(et.id)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10">
                <ClipboardList className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <DialogTitle>{editingId ? "Edit Exam Type" : "Add Exam Type"}</DialogTitle>
                <p className="text-xs text-gray-500 mt-0.5">{editingId ? "Update exam type details" : "Define a new exam type"}</p>
              </div>
            </div>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Name</Label>
                <Input
                  className="h-9"
                  placeholder="e.g. Mid-Term, Final, Unit Test 1"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Academic Year</Label>
                <Select
                  value={formData.academic_year_id}
                  items={academicYears.map((ay) => ({ value: ay.id, label: ay.name }))}
                  onValueChange={(val) =>
                    val &&
                    setFormData({ ...formData, academic_year_id: val })
                  }
                >
                  <SelectTrigger className="w-full h-9">
                    <SelectValue placeholder="Select year" />
                  </SelectTrigger>
                  <SelectContent>
                    {academicYears.map((ay) => (
                      <SelectItem key={ay.id} value={ay.id} label={ay.name}>
                        {ay.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Applies to level</Label>
              <Select
                value={formData.class_level}
                items={LEVEL_DEFS.map((l) => ({ value: l.value, label: l.label }))}
                onValueChange={(val) =>
                  val &&
                  setFormData({
                    ...formData,
                    class_level: val as ExamClassLevel,
                  })
                }
              >
                <SelectTrigger className="w-full h-9">
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  {LEVEL_DEFS.map((l) => (
                    <SelectItem key={l.value} value={l.value} label={l.label}>
                      <div className="flex flex-col">
                        <span>{l.label}</span>
                        <span className="text-[10px] text-gray-500">{l.hint}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-gray-500 mt-1">
                Junior classes typically use fewer exams than senior ones. Pick &quot;All Levels&quot; for school-wide exams.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Kind</Label>
                <Select
                  value={formData.kind}
                  items={KIND_OPTIONS.map((k) => ({ value: k.value, label: k.label }))}
                  onValueChange={(val) =>
                    val && setFormData({ ...formData, kind: val as ExamKind })
                  }
                >
                  <SelectTrigger className="w-full h-9">
                    <SelectValue placeholder="Select kind" />
                  </SelectTrigger>
                  <SelectContent>
                    {KIND_OPTIONS.map((k) => (
                      <SelectItem key={k.value} value={k.value} label={k.label}>
                        <div className="flex flex-col">
                          <span>{k.label}</span>
                          <span className="text-[10px] text-gray-500">{k.hint}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Sort Order</Label>
                <Input
                  className="h-9"
                  type="number"
                  value={formData.sort_order}
                  onChange={(e) =>
                    setFormData({ ...formData, sort_order: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Max Marks</Label>
                <Input
                  className="h-9"
                  type="number"
                  value={formData.max_marks}
                  onChange={(e) =>
                    setFormData({ ...formData, max_marks: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Weightage %</Label>
                <Input
                  className="h-9"
                  type="number"
                  step="0.01"
                  placeholder="e.g. 50"
                  value={formData.weightage}
                  onChange={(e) =>
                    setFormData({ ...formData, weightage: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Upper Header</Label>
              <Input
                className="h-9"
                placeholder='e.g. "ANNUAL EXAMINATION 2025-26" — prints above the school name on admit cards and report cards'
                value={formData.upper_header}
                onChange={(e) =>
                  setFormData({ ...formData, upper_header: e.target.value })
                }
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-navy-900 hover:bg-navy-800 text-white"
              >
                {submitting && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {editingId ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CoverageChip({ status }: { status: CoverageStatus }) {
  if (status.state === "empty") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
        No exams
      </span>
    );
  }
  if (status.state === "balanced") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Balanced · 100%
      </span>
    );
  }
  if (status.state === "under") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
        <AlertTriangle className="h-3.5 w-3.5" />
        {status.sum}% · {status.diff}% unallocated
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300">
      <AlertTriangle className="h-3.5 w-3.5" />
      {status.sum}% · over by {status.diff}%
    </span>
  );
}
