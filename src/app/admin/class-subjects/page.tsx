"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, BookOpen } from "lucide-react";
import { adminApi } from "@/lib/admin-api";
import type { Class, Subject, Profile, AcademicYear } from "@/types";

interface ClassSubjectRow {
  id: string;
  subject_id: string;
  teacher_id: string | null;
  subject_name: string;
  subject_code: string | null;
  teacher_name: string | null;
}

export default function AdminClassSubjectsPage() {
  const supabase = createClient();

  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubjectRow[]>([]);

  const [selectedClassId, setSelectedClassId] = useState("");
  const [loading, setLoading] = useState(true);
  const [csLoading, setCsLoading] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newSubjectId, setNewSubjectId] = useState("");
  const [newTeacherId, setNewTeacherId] = useState("");

  // Fetch initial data
  useEffect(() => {
    async function fetchData() {
      const { data: currentYear } = await supabase
        .from("academic_years")
        .select("id")
        .eq("is_current", true)
        .single();

      const [classesRes, subjectsRes, teachersRes] = await Promise.all([
        supabase
          .from("classes")
          .select("*")
          .eq(
            "academic_year_id",
            currentYear?.id ?? "00000000-0000-0000-0000-000000000000"
          )
          .order("sort_order"),
        supabase
          .from("subjects")
          .select("*")
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("profiles")
          .select("*")
          .eq("role", "teacher")
          .eq("is_active", true)
          .order("full_name"),
      ]);

      setClasses((classesRes.data as Class[]) ?? []);
      setSubjects((subjectsRes.data as Subject[]) ?? []);
      setTeachers((teachersRes.data as Profile[]) ?? []);
      setLoading(false);
    }

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch class subjects when class changes
  const fetchClassSubjects = useCallback(async () => {
    if (!selectedClassId) {
      setClassSubjects([]);
      return;
    }

    setCsLoading(true);
    const { data, error } = await supabase
      .from("class_subjects")
      .select(
        "id, subject_id, teacher_id, subjects(name, code), profiles:teacher_id(full_name)"
      )
      .eq("class_id", selectedClassId);

    if (error) {
      toast.error("Failed to fetch class subjects");
      setCsLoading(false);
      return;
    }

    const rows: ClassSubjectRow[] = (data ?? []).map(
      (cs: Record<string, unknown>) => ({
        id: cs.id as string,
        subject_id: cs.subject_id as string,
        teacher_id: cs.teacher_id as string | null,
        subject_name:
          (cs.subjects as { name: string } | null)?.name ?? "Unknown",
        subject_code:
          (cs.subjects as { code: string | null } | null)?.code ?? null,
        teacher_name:
          (cs.profiles as { full_name: string } | null)?.full_name ?? null,
      })
    );

    setClassSubjects(rows);
    setCsLoading(false);
  }, [supabase, selectedClassId]);

  useEffect(() => {
    fetchClassSubjects();
  }, [fetchClassSubjects]);

  const handleAssign = async () => {
    if (!selectedClassId || !newSubjectId) {
      toast.error("Please select a subject");
      return;
    }

    setSubmitting(true);
    const result = await adminApi({
      action: "insert",
      table: "class_subjects",
      data: {
        class_id: selectedClassId,
        subject_id: newSubjectId,
        teacher_id: newTeacherId || null,
      },
    });

    if (!result.success) {
      toast.error(result.error || "Failed to assign subject");
    } else {
      toast.success("Subject assigned to class");
      setDialogOpen(false);
      setNewSubjectId("");
      setNewTeacherId("");
      fetchClassSubjects();
    }
    setSubmitting(false);
  };

  const handleRemove = async (id: string) => {
    if (!confirm("Remove this subject assignment?")) return;

    const result = await adminApi({
      action: "delete",
      table: "class_subjects",
      match: { column: "id", value: id },
    });

    if (!result.success) {
      toast.error("Failed to remove");
      return;
    }

    toast.success("Subject removed from class");
    fetchClassSubjects();
  };

  // Filter out already-assigned subjects
  const availableSubjects = subjects.filter(
    (s) => !classSubjects.some((cs) => cs.subject_id === s.id)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-navy-900" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl font-bold text-navy-900">
          Class Subjects
        </h1>
        {selectedClassId && (
          <Button
            onClick={() => {
              setNewSubjectId("");
              setNewTeacherId("");
              setDialogOpen(true);
            }}
            className="bg-navy-900 hover:bg-navy-800 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Assign Subject
          </Button>
        )}
      </div>

      {/* Class selector */}
      <div className="mb-6 w-full sm:w-72">
        <Select
          value={selectedClassId}
          onValueChange={(val) => val && setSelectedClassId(val)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a class..." />
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

      <div className="erp-table-container p-6">
        {!selectedClassId ? (
          <div className="text-center py-12 text-gray-400">
            <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Select a class to manage its subjects</p>
          </div>
        ) : csLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : classSubjects.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No subjects assigned to this class yet</p>
            <p className="text-xs text-gray-300 mt-1">
              Click &quot;Assign Subject&quot; to add subjects and assign
              teachers
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Teacher</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {classSubjects.map((cs) => (
                <TableRow key={cs.id}>
                  <TableCell className="font-medium">
                    {cs.subject_name}
                  </TableCell>
                  <TableCell className="text-gray-500">
                    {cs.subject_code ?? "—"}
                  </TableCell>
                  <TableCell className="text-gray-600">
                    {cs.teacher_name ?? "Not assigned"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleRemove(cs.id)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Assign Subject Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Subject to Class</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>Subject</Label>
              <Select
                value={newSubjectId}
                onValueChange={(val) => val && setNewSubjectId(val)}
              >
                <SelectTrigger className="w-full mt-1">
                  <SelectValue placeholder="Select a subject..." />
                </SelectTrigger>
                <SelectContent>
                  {availableSubjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                      {s.code ? ` (${s.code})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Teacher (optional)</Label>
              <Select
                value={newTeacherId}
                onValueChange={(val) =>
                  setNewTeacherId(!val || val === "none" ? "" : val)
                }
              >
                <SelectTrigger className="w-full mt-1">
                  <SelectValue placeholder="Select a teacher..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {teachers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAssign}
              disabled={submitting}
              className="bg-navy-900 hover:bg-navy-800 text-white"
            >
              {submitting && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
