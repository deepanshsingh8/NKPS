"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { Plus, Trash2, Pencil, Loader2, BookOpen, Library } from "lucide-react";
import { adminApi } from "@/lib/admin-api";
import { cn } from "@/lib/utils";
import type { Class, Subject, Profile } from "@/types";

type Tab = "subjects" | "assignments";

interface ClassSubjectRow {
  id: string;
  subject_id: string;
  teacher_id: string | null;
  subject_name: string;
  subject_code: string | null;
  teacher_name: string | null;
}

export default function AdminSubjectsPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("subjects");

  // ── Subjects state ──
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(true);
  const [subjectDialogOpen, setSubjectDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");

  // ── Assignments state ──
  const [classes, setClasses] = useState<Class[]>([]);
  const [activeSubjects, setActiveSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubjectRow[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [assignmentsLoading, setAssignmentsLoading] = useState(true);
  const [csLoading, setCsLoading] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [newSubjectId, setNewSubjectId] = useState("");
  const [newTeacherId, setNewTeacherId] = useState("");

  // ── Fetch subjects ──
  const fetchSubjects = async () => {
    const { data, error } = await supabase
      .from("subjects")
      .select("*")
      .order("name");

    if (error) {
      toast.error("Failed to fetch subjects");
      return;
    }

    setSubjects((data as Subject[]) ?? []);
    setSubjectsLoading(false);
  };

  // ── Fetch assignments data (classes, active subjects, teachers) ──
  const fetchAssignmentsData = async () => {
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
    setActiveSubjects((subjectsRes.data as Subject[]) ?? []);
    setTeachers((teachersRes.data as Profile[]) ?? []);
    setAssignmentsLoading(false);
  };

  useEffect(() => {
    fetchSubjects();
    fetchAssignmentsData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fetch class subjects when class changes ──
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

  // ── Subject CRUD handlers ──
  const resetSubjectForm = () => {
    setName("");
    setCode("");
  };

  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Subject name is required");
      return;
    }
    setSubmitting(true);

    const result = await adminApi({
      action: "insert",
      table: "subjects",
      data: { name: name.trim(), code: code.trim() || null, is_active: true },
    });

    if (!result.success) {
      toast.error(result.error || "Failed to create subject");
    } else {
      toast.success("Subject created successfully");
      setSubjectDialogOpen(false);
      resetSubjectForm();
      await fetchSubjects();
    }

    setSubmitting(false);
  };

  const openEditDialog = (subject: Subject) => {
    setEditingSubject(subject);
    setEditName(subject.name);
    setEditCode(subject.code || "");
    setEditDialogOpen(true);
  };

  const handleEditSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubject) return;
    if (!editName.trim()) {
      toast.error("Subject name is required");
      return;
    }
    setSubmitting(true);

    const result = await adminApi({
      action: "update",
      table: "subjects",
      data: { name: editName.trim(), code: editCode.trim() || null },
      match: { column: "id", value: editingSubject.id },
    });

    if (!result.success) {
      toast.error(result.error || "Failed to update subject");
    } else {
      toast.success("Subject updated successfully");
      setEditDialogOpen(false);
      setEditingSubject(null);
      await fetchSubjects();
    }

    setSubmitting(false);
  };

  const toggleActive = async (subject: Subject) => {
    const result = await adminApi({
      action: "update",
      table: "subjects",
      data: { is_active: !subject.is_active },
      match: { column: "id", value: subject.id },
    });

    if (!result.success) {
      toast.error("Failed to update subject");
      return;
    }

    toast.success(
      subject.is_active ? "Subject deactivated" : "Subject activated"
    );
    await fetchSubjects();
  };

  const handleDeleteSubject = async (id: string) => {
    if (!confirm("Delete this subject?")) return;

    const result = await adminApi({
      action: "delete",
      table: "subjects",
      match: { column: "id", value: id },
    });

    if (!result.success) {
      toast.error("Failed to delete subject");
      return;
    }

    toast.success("Subject deleted");
    await fetchSubjects();
  };

  // ── Assignment handlers ──
  const handleAssign = async () => {
    if (!selectedClassId || !newSubjectId) {
      toast.error("Please select a subject");
      return;
    }

    setAssignSubmitting(true);
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
      setAssignDialogOpen(false);
      setNewSubjectId("");
      setNewTeacherId("");
      fetchClassSubjects();
    }
    setAssignSubmitting(false);
  };

  const handleRemoveAssignment = async (id: string) => {
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
  const availableSubjects = activeSubjects.filter(
    (s) => !classSubjects.some((cs) => cs.subject_id === s.id)
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl font-bold text-navy-900 dark:text-white">
          Subjects & Assignments
        </h1>
        {tab === "subjects" && (
          <Button
            onClick={() => {
              resetSubjectForm();
              setSubjectDialogOpen(true);
            }}
            className="bg-navy-900 hover:bg-navy-800 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Subject
          </Button>
        )}
        {tab === "assignments" && selectedClassId && (
          <Button
            onClick={() => {
              setNewSubjectId("");
              setNewTeacherId("");
              setAssignDialogOpen(true);
            }}
            className="bg-navy-900 hover:bg-navy-800 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Assign Subject
          </Button>
        )}
      </div>

      {/* Tab toggle */}
      <div className="flex items-center gap-1 mb-6 bg-gray-100 dark:bg-muted rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab("subjects")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
            tab === "subjects"
              ? "bg-white dark:bg-card text-navy-900 dark:text-white shadow-sm"
              : "text-gray-500 dark:text-gray-400 hover:text-navy-900 dark:hover:text-white"
          )}
        >
          <BookOpen className="h-4 w-4" />
          Subjects
        </button>
        <button
          onClick={() => setTab("assignments")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
            tab === "assignments"
              ? "bg-white dark:bg-card text-navy-900 dark:text-white shadow-sm"
              : "text-gray-500 dark:text-gray-400 hover:text-navy-900 dark:hover:text-white"
          )}
        >
          <Library className="h-4 w-4" />
          Class Assignments
        </button>
      </div>

      {/* ════════════════════════════════════════════════ */}
      {/* Subjects Tab                                    */}
      {/* ════════════════════════════════════════════════ */}
      {tab === "subjects" && (
        <div className="erp-table-container p-6">
          {subjectsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400 dark:text-gray-500" />
            </div>
          ) : subjects.length === 0 ? (
            <p className="text-center py-12 text-gray-500 dark:text-gray-400">
              No subjects found. Add one to get started.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subjects.map((subject) => (
                  <TableRow key={subject.id}>
                    <TableCell className="font-medium">{subject.name}</TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-300">
                      {subject.code || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={
                          subject.is_active
                            ? "bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400"
                            : "bg-gray-100 dark:bg-muted text-gray-500 dark:text-gray-400"
                        }
                      >
                        {subject.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-gray-500 dark:text-gray-400">
                      {new Date(subject.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openEditDialog(subject)}
                          className="text-gray-500 hover:text-navy-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-muted"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleActive(subject)}
                        >
                          {subject.is_active ? "Deactivate" : "Activate"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleDeleteSubject(subject.id)}
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
      )}

      {/* ════════════════════════════════════════════════ */}
      {/* Assignments Tab                                 */}
      {/* ════════════════════════════════════════════════ */}
      {tab === "assignments" && (
        <>
          {assignmentsLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-navy-900 dark:text-white" />
            </div>
          ) : (
            <>
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
                  <div className="text-center py-12 text-gray-400 dark:text-gray-500">
                    <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">Select a class to manage its subjects</p>
                  </div>
                ) : csLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400 dark:text-gray-500" />
                  </div>
                ) : classSubjects.length === 0 ? (
                  <div className="text-center py-12 text-gray-400 dark:text-gray-500">
                    <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">No subjects assigned to this class yet</p>
                    <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">
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
                          <TableCell className="text-gray-500 dark:text-gray-400">
                            {cs.subject_code ?? "—"}
                          </TableCell>
                          <TableCell className="text-gray-600 dark:text-gray-300">
                            {cs.teacher_name ?? "Not assigned"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handleRemoveAssignment(cs.id)}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
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
            </>
          )}
        </>
      )}

      {/* ── Add Subject Dialog ── */}
      <Dialog open={subjectDialogOpen} onOpenChange={setSubjectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10">
                <BookOpen className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <DialogTitle>Add New Subject</DialogTitle>
                <p className="text-xs text-gray-500 mt-0.5">Create a new subject for the curriculum</p>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={handleCreateSubject} className="space-y-4">
            <div>
              <Label htmlFor="subjectName">Subject Name</Label>
              <Input
                id="subjectName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Mathematics"
                required
              />
            </div>
            <div>
              <Label htmlFor="subjectCode">Code (optional)</Label>
              <Input
                id="subjectCode"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. MATH"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSubjectDialogOpen(false)}
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
                Create Subject
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit Subject Dialog ── */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
                <Pencil className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <DialogTitle>Edit Subject</DialogTitle>
                <p className="text-xs text-gray-500 mt-0.5">Update subject details</p>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={handleEditSubject} className="space-y-4">
            <div>
              <Label htmlFor="editSubjectName">Subject Name</Label>
              <Input
                id="editSubjectName"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="e.g. Mathematics"
                required
              />
            </div>
            <div>
              <Label htmlFor="editSubjectCode">Code (optional)</Label>
              <Input
                id="editSubjectCode"
                value={editCode}
                onChange={(e) => setEditCode(e.target.value)}
                placeholder="e.g. MATH"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditDialogOpen(false)}
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
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Assign Subject Dialog ── */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10">
                <Library className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <DialogTitle>Assign Subject to Class</DialogTitle>
                <p className="text-xs text-gray-500 mt-0.5">Link a subject and teacher to this class</p>
              </div>
            </div>
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
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAssign}
              disabled={assignSubmitting}
              className="bg-navy-900 hover:bg-navy-800 text-white"
            >
              {assignSubmitting && (
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
