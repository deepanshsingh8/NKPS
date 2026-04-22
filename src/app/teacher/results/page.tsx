"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Save, Loader2 } from "lucide-react";
import { formatClassName } from "@/lib/utils";
import type { Class, Subject, ExamType } from "@/types";

interface EnrolledStudent {
  student_id: string;
  roll_number: number | null;
  full_name: string;
}

interface MarksEntry {
  student_id: string;
  marks_obtained: number | "";
}

function calculateGrade(marks: number, maxMarks: number): string {
  const pct = (marks / maxMarks) * 100;
  if (pct >= 90) return "A+";
  if (pct >= 80) return "A";
  if (pct >= 70) return "B+";
  if (pct >= 60) return "B";
  if (pct >= 50) return "C";
  if (pct >= 40) return "D";
  return "F";
}

const GRADE_COLORS: Record<string, string> = {
  "A+": "bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800",
  A: "bg-green-50 dark:bg-green-950/20 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800",
  "B+": "bg-blue-100 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  B: "bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  C: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800",
  D: "bg-orange-100 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800",
  F: "bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800",
};

export default function TeacherResultsPage() {
  const searchParams = useSearchParams();
  const preselectClassId = searchParams.get("class_id") ?? "";
  const preselectSubjectId = searchParams.get("subject_id") ?? "";
  const preselectExamTypeId = searchParams.get("exam_type_id") ?? "";

  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [students, setStudents] = useState<EnrolledStudent[]>([]);
  const [marksEntries, setMarksEntries] = useState<MarksEntry[]>([]);

  const [selectedClassId, setSelectedClassId] = useState(preselectClassId);
  const [selectedSubjectId, setSelectedSubjectId] = useState(preselectSubjectId);
  const [selectedExamTypeId, setSelectedExamTypeId] = useState(preselectExamTypeId);

  const [loading, setLoading] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [saving, setSaving] = useState(false);

  const [maxMarks, setMaxMarks] = useState(100);

  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [classTeacherMap, setClassTeacherMap] = useState<
    Record<string, string | null>
  >({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [remarksLoading, setRemarksLoading] = useState(false);

  const isClassTeacher = Boolean(
    selectedClassId &&
      teacherId &&
      classTeacherMap[selectedClassId] === teacherId
  );

  // Fetch teacher's assigned classes
  useEffect(() => {
    async function fetchClasses() {
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

      const tid = profileData?.teacher_id;
      if (!tid) {
        setLoading(false);
        return;
      }
      setTeacherId(tid);

      // Get classes where this teacher has subject assignments
      const { data: classSubjects } = await supabase
        .from("class_subjects")
        .select("class_id, classes(id, name, section, academic_year_id, sort_order, class_teacher_id, streams:stream_id(name))")
        .eq("teacher_id", tid);

      if (classSubjects) {
        const uniqueClasses = new Map<string, Class>();
        const teacherByClass: Record<string, string | null> = {};
        for (const cs of classSubjects) {
          const cls = cs.classes as unknown as Class & {
            class_teacher_id: string | null;
          };
          if (cls && !uniqueClasses.has(cls.id)) {
            uniqueClasses.set(cls.id, cls);
            teacherByClass[cls.id] = cls.class_teacher_id ?? null;
          }
        }
        setClasses(
          Array.from(uniqueClasses.values()).sort(
            (a, b) => a.sort_order - b.sort_order
          )
        );
        setClassTeacherMap(teacherByClass);
      }

      // Fetch exam types for current academic year
      const { data: currentYear } = await supabase
        .from("academic_years")
        .select("id")
        .eq("is_current", true)
        .single();

      if (currentYear) {
        const { data: examTypesData } = await supabase
          .from("exam_types")
          .select("*")
          .eq("academic_year_id", currentYear.id)
          .order("sort_order", { ascending: true });

        if (examTypesData) setExamTypes(examTypesData);
      }

      setLoading(false);
    }

    fetchClasses();
  }, []);

  // Fetch subjects for selected class (only those assigned to this teacher)
  useEffect(() => {
    if (!selectedClassId) {
      setSubjects([]);
      setSelectedSubjectId("");
      return;
    }

    async function fetchSubjects() {
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

      const tid = profileData?.teacher_id;
      if (!tid) return;

      const { data: classSubjects } = await supabase
        .from("class_subjects")
        .select("subject_id, subjects(id, name, code, is_active)")
        .eq("class_id", selectedClassId)
        .eq("teacher_id", tid);

      if (classSubjects) {
        const subs = classSubjects
          .map((cs) => cs.subjects as unknown as Subject)
          .filter(Boolean);
        setSubjects(subs);
      }

      setSelectedSubjectId("");
    }

    fetchSubjects();
  }, [selectedClassId]);

  // Fetch students and existing marks when all 3 selectors are set
  const fetchStudentsAndMarks = useCallback(async () => {
    if (!selectedClassId || !selectedSubjectId || !selectedExamTypeId) {
      setStudents([]);
      setMarksEntries([]);
      return;
    }

    setLoadingStudents(true);
    const supabase = createClient();

    // Fetch enrolled students
    const { data: enrollments } = await supabase
      .from("student_enrollments")
      .select("student_id, roll_number, students(full_name)")
      .eq("class_id", selectedClassId)
      .order("roll_number", { ascending: true });

    const enrolledStudents: EnrolledStudent[] = (enrollments ?? []).map(
      (e) => ({
        student_id: e.student_id,
        roll_number: e.roll_number,
        full_name:
          (e.students as unknown as { full_name: string })?.full_name ??
          "Unknown",
      })
    );

    setStudents(enrolledStudents);

    // Fetch existing results
    const studentIds = enrolledStudents.map((s) => s.student_id);
    const { data: existingResults } = await supabase
      .from("results")
      .select("student_id, marks_obtained")
      .eq("subject_id", selectedSubjectId)
      .eq("exam_type_id", selectedExamTypeId)
      .in("student_id", studentIds.length > 0 ? studentIds : ["__none__"]);

    const existingMap = new Map<string, number>();
    for (const r of existingResults ?? []) {
      existingMap.set(r.student_id, r.marks_obtained);
    }

    // Pre-fill marks
    setMarksEntries(
      enrolledStudents.map((s) => ({
        student_id: s.student_id,
        marks_obtained: existingMap.get(s.student_id) ?? "",
      }))
    );

    // Get max_marks from exam type
    const examType = examTypes.find((et) => et.id === selectedExamTypeId);
    if (examType) setMaxMarks(examType.max_marks);

    setLoadingStudents(false);
  }, [selectedClassId, selectedSubjectId, selectedExamTypeId, examTypes]);

  useEffect(() => {
    fetchStudentsAndMarks();
  }, [fetchStudentsAndMarks]);

  // Fetch existing class-teacher remarks for the (class, exam) pair whenever
  // the teacher is the class teacher of the selected class and an exam is
  // picked. Independent of subject selection.
  useEffect(() => {
    if (!isClassTeacher || !selectedClassId || !selectedExamTypeId) {
      setRemarks({});
      return;
    }

    let cancelled = false;
    async function fetchRemarks() {
      setRemarksLoading(true);
      try {
        const res = await fetch(
          `/api/erp/results/remarks?class_id=${selectedClassId}&exam_type_id=${selectedExamTypeId}`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const r of data.remarks ?? []) {
          map[r.student_id] = r.remark;
        }
        setRemarks(map);
      } finally {
        if (!cancelled) setRemarksLoading(false);
      }
    }
    fetchRemarks();
    return () => {
      cancelled = true;
    };
  }, [isClassTeacher, selectedClassId, selectedExamTypeId]);

  function handleRemarkChange(studentId: string, value: string) {
    setRemarks((prev) => ({ ...prev, [studentId]: value }));
  }

  function handleMarksChange(studentId: string, value: string) {
    const numVal = value === "" ? "" : Number(value);
    setMarksEntries((prev) =>
      prev.map((e) =>
        e.student_id === studentId ? { ...e, marks_obtained: numVal } : e
      )
    );
  }

  async function handleSave() {
    // Validate marks entries
    const entries = marksEntries
      .filter((e) => e.marks_obtained !== "")
      .map((e) => ({
        student_id: e.student_id,
        marks_obtained: Number(e.marks_obtained),
      }));

    if (entries.length === 0 && !isClassTeacher) {
      toast.error("Please enter marks for at least one student");
      return;
    }

    // Check max marks
    const invalid = entries.find(
      (e) => e.marks_obtained > maxMarks || e.marks_obtained < 0
    );
    if (invalid) {
      toast.error(`Marks must be between 0 and ${maxMarks}`);
      return;
    }

    setSaving(true);

    // Build both API requests so they can run in parallel.
    const requests: Promise<{ ok: boolean; kind: "marks" | "remarks"; data: Record<string, unknown> }>[] = [];

    if (entries.length > 0) {
      requests.push(
        fetch("/api/erp/results/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            class_id: selectedClassId,
            subject_id: selectedSubjectId,
            exam_type_id: selectedExamTypeId,
            entries,
          }),
        }).then(async (res) => ({
          ok: res.ok,
          kind: "marks" as const,
          data: await res.json(),
        }))
      );
    }

    if (isClassTeacher) {
      const remarkEntries = students.map((s) => ({
        student_id: s.student_id,
        remark: remarks[s.student_id] ?? "",
      }));
      requests.push(
        fetch("/api/erp/results/remarks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            class_id: selectedClassId,
            exam_type_id: selectedExamTypeId,
            entries: remarkEntries,
          }),
        }).then(async (res) => ({
          ok: res.ok,
          kind: "remarks" as const,
          data: await res.json(),
        }))
      );
    }

    try {
      const results = await Promise.all(requests);
      for (const r of results) {
        if (!r.ok) {
          toast.error(
            (r.data as { error?: string }).error ||
              `Failed to save ${r.kind}`
          );
        }
      }

      const marksResult = results.find((r) => r.kind === "marks");
      const remarksResult = results.find((r) => r.kind === "remarks");
      const parts: string[] = [];
      if (marksResult?.ok) {
        parts.push(
          `Marks saved for ${(marksResult.data as { count?: number }).count ?? entries.length} students`
        );
      }
      if (remarksResult?.ok) {
        const saved = (remarksResult.data as { saved?: number }).saved ?? 0;
        const cleared = (remarksResult.data as { cleared?: number }).cleared ?? 0;
        if (saved + cleared > 0) {
          parts.push(`Remarks updated for ${saved + cleared} students`);
        }
      }
      if (parts.length > 0) toast.success(parts.join(" · "));
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-navy-900 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-navy-900 dark:text-white">
          Enter Results
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Select class, subject, and exam type to enter student marks.
        </p>
      </div>

      {/* Selectors */}
      <Card className="bg-white dark:bg-card rounded-2xl">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-navy-900 dark:text-white">Class</label>
              <Select
                value={selectedClassId}
                items={classes.map((cls) => ({ value: cls.id, label: formatClassName(cls) }))}
                onValueChange={(val) => val && setSelectedClassId(val)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id} label={formatClassName(cls)}>
                      {formatClassName(cls)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-navy-900 dark:text-white">
                Subject
              </label>
              <Select
                value={selectedSubjectId}
                items={subjects.map((sub) => ({ value: sub.id, label: sub.name + (sub.code ? ` (${sub.code})` : "") }))}
                onValueChange={(val) => val && setSelectedSubjectId(val)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select subject" />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((sub) => (
                    <SelectItem key={sub.id} value={sub.id} label={sub.name + (sub.code ? ` (${sub.code})` : "")}>
                      {sub.name}
                      {sub.code ? ` (${sub.code})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-navy-900 dark:text-white">
                Exam Type
              </label>
              <Select
                value={selectedExamTypeId}
                items={examTypes.map((et) => ({ value: et.id, label: `${et.name} (Max: ${et.max_marks})` }))}
                onValueChange={(val) => val && setSelectedExamTypeId(val)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select exam" />
                </SelectTrigger>
                <SelectContent>
                  {examTypes.map((et) => (
                    <SelectItem key={et.id} value={et.id} label={`${et.name} (Max: ${et.max_marks})`}>
                      {et.name} (Max: {et.max_marks})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Marks Entry Table */}
      {selectedClassId && selectedSubjectId && selectedExamTypeId && (
        <Card className="bg-white dark:bg-card rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle className="text-navy-900 dark:text-white">
                Marks Entry
                <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-2">
                  (Max: {maxMarks})
                </span>
              </CardTitle>
              {isClassTeacher && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  As class teacher, add report-card remarks alongside each
                  student. Remarks are shared across all subjects for this exam.
                </p>
              )}
            </div>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-navy-900 text-white hover:bg-navy-900/90"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save All
            </Button>
          </CardHeader>
          <CardContent>
            {loadingStudents || (isClassTeacher && remarksLoading) ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-navy-900 border-t-transparent" />
              </div>
            ) : students.length === 0 ? (
              <p className="text-center text-gray-400 dark:text-gray-500 py-12">
                No students enrolled in this class.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Roll No.</TableHead>
                      <TableHead>Student Name</TableHead>
                      <TableHead className="w-32">Marks</TableHead>
                      <TableHead className="w-24">Grade</TableHead>
                      {isClassTeacher && (
                        <TableHead className="min-w-[260px]">
                          Class Teacher Remarks
                        </TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {students.map((student, idx) => {
                      const entry = marksEntries[idx];
                      const marks =
                        entry?.marks_obtained === ""
                          ? null
                          : Number(entry?.marks_obtained);
                      const grade =
                        marks !== null && marks >= 0
                          ? calculateGrade(marks, maxMarks)
                          : null;

                      return (
                        <TableRow key={student.student_id}>
                          <TableCell className="font-medium">
                            {student.roll_number ?? "-"}
                          </TableCell>
                          <TableCell>{student.full_name}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              max={maxMarks}
                              value={entry?.marks_obtained ?? ""}
                              onChange={(e) =>
                                handleMarksChange(
                                  student.student_id,
                                  e.target.value
                                )
                              }
                              className="w-24 h-8"
                              placeholder="0"
                            />
                          </TableCell>
                          <TableCell>
                            {grade ? (
                              <Badge
                                className={`text-xs ${GRADE_COLORS[grade] ?? ""}`}
                              >
                                {grade}
                              </Badge>
                            ) : (
                              <span className="text-gray-300 dark:text-gray-500">--</span>
                            )}
                          </TableCell>
                          {isClassTeacher && (
                            <TableCell>
                              <textarea
                                value={remarks[student.student_id] ?? ""}
                                onChange={(e) =>
                                  handleRemarkChange(
                                    student.student_id,
                                    e.target.value
                                  )
                                }
                                placeholder="Optional report-card remark…"
                                rows={2}
                                className="w-full min-h-[44px] rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-muted px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 resize-y"
                              />
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
