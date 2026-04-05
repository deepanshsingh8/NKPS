"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { toast } from "sonner";
import {
  ClipboardCheck,
  Loader2,
  CheckCircle2,
  Users,
} from "lucide-react";
import type { AttendanceStatus } from "@/types";

interface ClassOption {
  id: string;
  name: string;
  section: string;
}

interface StudentRow {
  student_id: string;
  roll_number: number | null;
  full_name: string;
  status: AttendanceStatus;
}

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; color: string }[] = [
  { value: "present", label: "Present", color: "bg-green-100 text-green-700 hover:bg-green-200" },
  { value: "absent", label: "Absent", color: "bg-red-100 text-red-700 hover:bg-red-200" },
  { value: "late", label: "Late", color: "bg-yellow-100 text-yellow-700 hover:bg-yellow-200" },
];

export default function TeacherAttendancePage() {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [alreadyMarked, setAlreadyMarked] = useState(false);

  const supabase = createClient();

  // Fetch teacher's assigned classes
  useEffect(() => {
    async function fetchClasses() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Get class IDs from class_subjects
      const { data: classSubjects } = await supabase
        .from("class_subjects")
        .select("class_id")
        .eq("teacher_id", user.id);

      // Also get classes where user is class teacher
      const { data: classTeacher } = await supabase
        .from("classes")
        .select("id")
        .eq("class_teacher_id", user.id);

      const classIds = [
        ...new Set([
          ...(classSubjects ?? []).map((cs) => cs.class_id),
          ...(classTeacher ?? []).map((c) => c.id),
        ]),
      ];

      if (classIds.length === 0) {
        setLoading(false);
        return;
      }

      const { data: classData } = await supabase
        .from("classes")
        .select("id, name, section")
        .in("id", classIds)
        .order("sort_order");

      setClasses((classData as ClassOption[]) ?? []);
      setLoading(false);
    }

    fetchClasses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch students when class or date changes
  const fetchStudents = useCallback(
    async (classId: string, selectedDate: string) => {
      if (!classId) return;
      setLoadingStudents(true);

      // Fetch enrolled students with their profiles
      const { data: enrollments } = await supabase
        .from("student_enrollments")
        .select("student_id, roll_number, students(full_name)")
        .eq("class_id", classId)
        .order("roll_number");

      if (!enrollments || enrollments.length === 0) {
        setStudents([]);
        setAlreadyMarked(false);
        setLoadingStudents(false);
        return;
      }

      const studentIds = enrollments.map((e) => e.student_id);

      // Check for existing attendance records
      const { data: existing } = await supabase
        .from("attendance")
        .select("student_id, status")
        .eq("class_id", classId)
        .eq("date", selectedDate)
        .in("student_id", studentIds);

      const existingMap = new Map(
        (existing ?? []).map((a) => [a.student_id, a.status as AttendanceStatus])
      );

      setAlreadyMarked(existingMap.size > 0);

      const rows: StudentRow[] = enrollments.map((e) => {
        const studentData = e.students as unknown as { full_name: string } | null;
        return {
          student_id: e.student_id,
          roll_number: e.roll_number,
          full_name: studentData?.full_name ?? "Unknown",
          status: existingMap.get(e.student_id) ?? "present",
        };
      });

      setStudents(rows);
      setLoadingStudents(false);
    },
    [supabase]
  );

  useEffect(() => {
    if (selectedClassId && date) {
      fetchStudents(selectedClassId, date);
    }
  }, [selectedClassId, date, fetchStudents]);

  const setStudentStatus = (studentId: string, status: AttendanceStatus) => {
    setStudents((prev) =>
      prev.map((s) => (s.student_id === studentId ? { ...s, status } : s))
    );
  };

  const markAllPresent = () => {
    setStudents((prev) => prev.map((s) => ({ ...s, status: "present" })));
  };

  const handleSubmit = async () => {
    if (!selectedClassId || students.length === 0) return;
    setSubmitting(true);

    try {
      const res = await fetch("/api/erp/attendance/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          class_id: selectedClassId,
          date,
          entries: students.map((s) => ({
            student_id: s.student_id,
            status: s.status,
          })),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to save attendance");
        return;
      }

      toast.success(
        `Attendance ${alreadyMarked ? "updated" : "marked"} for ${data.count} students`
      );
      setAlreadyMarked(true);
    } catch {
      toast.error("Failed to save attendance");
    } finally {
      setSubmitting(false);
    }
  };

  const presentCount = students.filter((s) => s.status === "present").length;
  const absentCount = students.filter((s) => s.status === "absent").length;
  const lateCount = students.filter((s) => s.status === "late").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-navy-900 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-navy-900">
          Mark Attendance
        </h1>
        <p className="text-gray-500 mt-1">
          Select a class and date to mark or update attendance.
        </p>
      </div>

      {/* Filters */}
      <Card className="bg-white rounded-2xl shadow-sm border border-gray-200">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Class
              </label>
              <Select
                value={selectedClassId}
                onValueChange={(val) => val && setSelectedClassId(val)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} - {c.section}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:w-48">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date
              </label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                max={new Date().toISOString().split("T")[0]}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Already marked indicator */}
      {alreadyMarked && selectedClassId && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-sm">
          <CheckCircle2 className="h-4 w-4" />
          Attendance already marked for this date. You can edit and resubmit.
        </div>
      )}

      {/* Student Roster */}
      {selectedClassId && !loadingStudents && students.length > 0 && (
        <Card className="bg-white rounded-2xl shadow-sm border border-gray-200">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-navy-900">
              <Users className="h-5 w-5 text-gold-500" />
              Student Roster ({students.length})
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={markAllPresent}
              className="text-green-700 border-green-300 hover:bg-green-50"
            >
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Mark All Present
            </Button>
          </CardHeader>
          <CardContent>
            {/* Summary badges */}
            <div className="flex gap-3 mb-4">
              <Badge className="bg-green-100 text-green-700">
                Present: {presentCount}
              </Badge>
              <Badge className="bg-red-100 text-red-700">
                Absent: {absentCount}
              </Badge>
              <Badge className="bg-yellow-100 text-yellow-700">
                Late: {lateCount}
              </Badge>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Roll No.</TableHead>
                  <TableHead>Student Name</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((student) => (
                  <TableRow key={student.student_id}>
                    <TableCell className="font-medium text-gray-600">
                      {student.roll_number ?? "-"}
                    </TableCell>
                    <TableCell className="font-medium">
                      {student.full_name}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        {STATUS_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() =>
                              setStudentStatus(student.student_id, opt.value)
                            }
                            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                              student.status === opt.value
                                ? opt.color + " ring-2 ring-offset-1 ring-current"
                                : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Submit */}
            <div className="flex justify-end mt-6">
              <Button
                onClick={handleSubmit}
                disabled={submitting}
                className="bg-navy-900 hover:bg-navy-800 text-white px-8"
              >
                {submitting && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                <ClipboardCheck className="h-4 w-4 mr-2" />
                {alreadyMarked ? "Update Attendance" : "Submit Attendance"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty states */}
      {selectedClassId && !loadingStudents && students.length === 0 && (
        <Card className="bg-white rounded-2xl shadow-sm border border-gray-200">
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center text-gray-400">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No students enrolled in this class</p>
            </div>
          </CardContent>
        </Card>
      )}

      {!selectedClassId && (
        <Card className="bg-white rounded-2xl shadow-sm border border-gray-200">
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center text-gray-400">
              <ClipboardCheck className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Select a class to begin marking attendance</p>
            </div>
          </CardContent>
        </Card>
      )}

      {loadingStudents && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      )}

      {classes.length === 0 && (
        <Card className="bg-white rounded-2xl shadow-sm border border-gray-200">
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center text-gray-400">
              <ClipboardCheck className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No classes assigned to you yet</p>
              <p className="text-xs text-gray-300 mt-1">
                Contact the administrator to assign classes
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
