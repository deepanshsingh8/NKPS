"use client";

import { useEffect, useState, useCallback } from "react";
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
  "A+": "bg-green-100 text-green-700 border-green-200",
  A: "bg-green-50 text-green-600 border-green-200",
  "B+": "bg-blue-100 text-blue-700 border-blue-200",
  B: "bg-blue-50 text-blue-600 border-blue-200",
  C: "bg-yellow-100 text-yellow-700 border-yellow-200",
  D: "bg-orange-100 text-orange-700 border-orange-200",
  F: "bg-red-100 text-red-700 border-red-200",
};

export default function TeacherResultsPage() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [students, setStudents] = useState<EnrolledStudent[]>([]);
  const [marksEntries, setMarksEntries] = useState<MarksEntry[]>([]);

  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [selectedExamTypeId, setSelectedExamTypeId] = useState("");

  const [loading, setLoading] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [saving, setSaving] = useState(false);

  const [maxMarks, setMaxMarks] = useState(100);

  // Fetch teacher's assigned classes
  useEffect(() => {
    async function fetchClasses() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Get classes where this teacher has subject assignments
      const { data: classSubjects } = await supabase
        .from("class_subjects")
        .select("class_id, classes(id, name, section, academic_year_id, sort_order)")
        .eq("teacher_id", user.id);

      if (classSubjects) {
        const uniqueClasses = new Map<string, Class>();
        for (const cs of classSubjects) {
          const cls = cs.classes as unknown as Class;
          if (cls && !uniqueClasses.has(cls.id)) {
            uniqueClasses.set(cls.id, cls);
          }
        }
        setClasses(
          Array.from(uniqueClasses.values()).sort(
            (a, b) => a.sort_order - b.sort_order
          )
        );
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

      const { data: classSubjects } = await supabase
        .from("class_subjects")
        .select("subject_id, subjects(id, name, code, is_active)")
        .eq("class_id", selectedClassId)
        .eq("teacher_id", user.id);

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

  function handleMarksChange(studentId: string, value: string) {
    const numVal = value === "" ? "" : Number(value);
    setMarksEntries((prev) =>
      prev.map((e) =>
        e.student_id === studentId ? { ...e, marks_obtained: numVal } : e
      )
    );
  }

  async function handleSave() {
    // Validate all entries
    const entries = marksEntries
      .filter((e) => e.marks_obtained !== "")
      .map((e) => ({
        student_id: e.student_id,
        marks_obtained: Number(e.marks_obtained),
      }));

    if (entries.length === 0) {
      toast.error("Please enter marks for at least one student");
      return;
    }

    // Check max marks
    const invalid = entries.find((e) => e.marks_obtained > maxMarks || e.marks_obtained < 0);
    if (invalid) {
      toast.error(`Marks must be between 0 and ${maxMarks}`);
      return;
    }

    setSaving(true);

    try {
      const res = await fetch("/api/erp/results/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          class_id: selectedClassId,
          subject_id: selectedSubjectId,
          exam_type_id: selectedExamTypeId,
          entries,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to save results");
      } else {
        toast.success(`Results saved for ${data.count} students`);
      }
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
        <h1 className="font-heading text-2xl font-bold text-navy-900">
          Enter Results
        </h1>
        <p className="text-gray-500 mt-1">
          Select class, subject, and exam type to enter student marks.
        </p>
      </div>

      {/* Selectors */}
      <Card className="bg-white rounded-2xl">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-navy-900">Class</label>
              <Select
                value={selectedClassId}
                onValueChange={(val) => val && setSelectedClassId(val)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>
                      {cls.name} - {cls.section}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-navy-900">
                Subject
              </label>
              <Select
                value={selectedSubjectId}
                onValueChange={(val) => val && setSelectedSubjectId(val)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select subject" />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((sub) => (
                    <SelectItem key={sub.id} value={sub.id}>
                      {sub.name}
                      {sub.code ? ` (${sub.code})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-navy-900">
                Exam Type
              </label>
              <Select
                value={selectedExamTypeId}
                onValueChange={(val) => val && setSelectedExamTypeId(val)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select exam" />
                </SelectTrigger>
                <SelectContent>
                  {examTypes.map((et) => (
                    <SelectItem key={et.id} value={et.id}>
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
        <Card className="bg-white rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-navy-900">
              Marks Entry
              <span className="text-sm font-normal text-gray-500 ml-2">
                (Max: {maxMarks})
              </span>
            </CardTitle>
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
            {loadingStudents ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-navy-900 border-t-transparent" />
              </div>
            ) : students.length === 0 ? (
              <p className="text-center text-gray-400 py-12">
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
                              <span className="text-gray-300">--</span>
                            )}
                          </TableCell>
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
