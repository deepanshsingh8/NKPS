"use client";

import { useEffect, useState } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Loader2, Layers } from "lucide-react";
import { adminApi } from "@/lib/admin-api";
import type { Class, AcademicYear, Teacher, Stream } from "@/types";

const CLASS_NAMES = [
  "Nursery",
  "LKG",
  "UKG",
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
  "XI",
  "XII",
];

const SECTIONS = ["A", "B", "C"];

const SENIOR_CLASSES = ["XI", "XII"];

interface ClassWithRelations extends Class {
  teacher_name?: string;
  academic_year_name?: string;
  stream_name?: string;
  student_count?: number;
}

export default function AdminClassesPage() {
  const [classes, setClasses] = useState<ClassWithRelations[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassWithRelations | null>(null);

  // Form state
  const [className, setClassName] = useState(CLASS_NAMES[0]);
  const [section, setSection] = useState(SECTIONS[0]);
  const [academicYearId, setAcademicYearId] = useState("");
  const [classTeacherId, setClassTeacherId] = useState("");
  const [streamId, setStreamId] = useState("");

  const supabase = createClient();

  const fetchData = async () => {
    const [classesRes, yearsRes, teachersRes, streamsRes] = await Promise.all([
      supabase
        .from("classes")
        .select("*, teachers:class_teacher_id(full_name, employee_id), academic_years:academic_year_id(name), streams:stream_id(name)")
        .order("sort_order", { ascending: true }),
      supabase
        .from("academic_years")
        .select("*")
        .order("start_date", { ascending: false }),
      supabase
        .from("teachers")
        .select("*")
        .eq("is_active", true)
        .order("full_name"),
      supabase
        .from("streams")
        .select("*")
        .eq("is_active", true)
        .order("sort_order"),
    ]);

    if (classesRes.error) {
      toast.error("Failed to fetch classes");
    } else {
      const enriched: ClassWithRelations[] = (classesRes.data ?? []).map(
        (c: Record<string, unknown>) => ({
          ...(c as unknown as Class),
          teacher_name:
            (c.teachers as { full_name: string; employee_id: string } | null)?.full_name ?? "—",
          academic_year_name:
            (c.academic_years as { name: string } | null)?.name ?? "—",
          stream_name:
            (c.streams as { name: string } | null)?.name ?? undefined,
        })
      );
      setClasses(enriched);
    }

    setAcademicYears((yearsRes.data as AcademicYear[]) ?? []);
    setTeachers((teachersRes.data as Teacher[]) ?? []);
    setStreams((streamsRes.data as Stream[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setClassName(CLASS_NAMES[0]);
    setSection(SECTIONS[0]);
    setAcademicYearId("");
    setClassTeacherId("");
    setStreamId("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!academicYearId) {
      toast.error("Please select an academic year");
      return;
    }
    setSubmitting(true);

    const result = await adminApi({
      action: "insert",
      table: "classes",
      data: {
        name: className,
        section,
        academic_year_id: academicYearId,
        class_teacher_id: classTeacherId || null,
        stream_id: SENIOR_CLASSES.includes(className) && streamId ? streamId : null,
        sort_order: CLASS_NAMES.indexOf(className) * 10 + SECTIONS.indexOf(section),
      },
    });

    if (!result.success) {
      toast.error(result.error || "Failed to create class");
    } else {
      toast.success("Class created successfully");
      setDialogOpen(false);
      resetForm();
      await fetchData();
    }

    setSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this class? This will also remove associated enrollments."))
      return;

    const result = await adminApi({
      action: "delete",
      table: "classes",
      match: { column: "id", value: id },
    });

    if (!result.success) {
      toast.error("Failed to delete class");
      return;
    }

    toast.success("Class deleted");
    await fetchData();
  };

  const openEdit = (cls: ClassWithRelations) => {
    setEditingClass(cls);
    setClassName(cls.name);
    setSection(cls.section);
    setAcademicYearId(cls.academic_year_id);
    setClassTeacherId(cls.class_teacher_id ?? "");
    setStreamId(cls.stream_id ?? "");
    setEditDialogOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClass) return;

    setSubmitting(true);
    const result = await adminApi({
      action: "update",
      table: "classes",
      data: {
        name: className,
        section,
        academic_year_id: academicYearId,
        class_teacher_id: classTeacherId || null,
        stream_id: SENIOR_CLASSES.includes(className) && streamId ? streamId : null,
        sort_order: CLASS_NAMES.indexOf(className) * 10 + SECTIONS.indexOf(section),
      },
      match: { column: "id", value: editingClass.id },
    });

    if (!result.success) {
      toast.error(result.error || "Failed to update class");
    } else {
      toast.success("Class updated successfully");
      setEditDialogOpen(false);
      setEditingClass(null);
      await fetchData();
    }
    setSubmitting(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl font-bold text-navy-900 dark:text-white">
          Classes
        </h1>
        <Button
          onClick={() => {
            resetForm();
            setDialogOpen(true);
          }}
          className="bg-navy-900 hover:bg-navy-800 text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Class
        </Button>
      </div>

      <div className="erp-table-container p-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400 dark:text-gray-500" />
          </div>
        ) : classes.length === 0 ? (
          <p className="text-center py-12 text-gray-500 dark:text-gray-400">
            No classes found. Add one to get started.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Class</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Stream</TableHead>
                <TableHead>Academic Year</TableHead>
                <TableHead>Class Teacher</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {classes.map((cls) => (
                <TableRow key={cls.id}>
                  <TableCell className="font-medium">{cls.name}</TableCell>
                  <TableCell>{cls.section}</TableCell>
                  <TableCell className="text-gray-600 dark:text-gray-300">
                    {cls.stream_name || "—"}
                  </TableCell>
                  <TableCell className="text-gray-600 dark:text-gray-300">
                    {cls.academic_year_name}
                  </TableCell>
                  <TableCell className="text-gray-600 dark:text-gray-300">
                    {cls.teacher_name}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => openEdit(cls)}
                        className="text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDelete(cls.id)}
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

      {/* Edit Class Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
                <Pencil className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <DialogTitle>Edit Class</DialogTitle>
                <p className="text-xs text-gray-500 mt-0.5">Update class details</p>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={handleEditSubmit} className="space-y-3">
            <div className={`grid ${SENIOR_CLASSES.includes(className) ? "grid-cols-3" : "grid-cols-2"} gap-3`}>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Class Name</Label>
                <Select value={className} onValueChange={(val) => { if (val) { setClassName(val); if (!SENIOR_CLASSES.includes(val)) setStreamId(""); } }}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CLASS_NAMES.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Section</Label>
                <Select value={section} onValueChange={(val) => val && setSection(val)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SECTIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {SENIOR_CLASSES.includes(className) && (
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Stream</Label>
                  <Select
                    value={streamId}
                    onValueChange={(val) => setStreamId(!val || val === "none" ? "" : val)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select stream" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {streams.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Academic Year</Label>
                <Select
                  value={academicYearId}
                  items={academicYears.map((ay) => ({ value: ay.id, label: ay.name }))}
                  onValueChange={(val) => val && setAcademicYearId(val)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select academic year" />
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
              <div className="space-y-1">
                <Label className="text-xs font-medium">Class Teacher (optional)</Label>
                <Select
                  value={classTeacherId}
                  items={[
                    { value: "none", label: "None" },
                    ...teachers.map((t) => ({ value: t.id, label: `${t.full_name} (${t.employee_id})` })),
                  ]}
                  onValueChange={(val) => setClassTeacherId(!val || val === "none" ? "" : val)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select teacher" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {teachers.map((t) => (
                      <SelectItem key={t.id} value={t.id} label={`${t.full_name} (${t.employee_id})`}>
                        {t.full_name} ({t.employee_id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="bg-navy-900 hover:bg-navy-800 text-white">
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Update Class
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Class Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/10">
                <Layers className="h-5 w-5 text-teal-600" />
              </div>
              <div>
                <DialogTitle>Add New Class</DialogTitle>
                <p className="text-xs text-gray-500 mt-0.5">Create a new class section</p>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className={`grid ${SENIOR_CLASSES.includes(className) ? "grid-cols-3" : "grid-cols-2"} gap-3`}>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Class Name</Label>
                <Select value={className} onValueChange={(val) => { if (val) { setClassName(val); if (!SENIOR_CLASSES.includes(val)) setStreamId(""); } }}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CLASS_NAMES.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Section</Label>
                <Select value={section} onValueChange={(val) => val && setSection(val)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SECTIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {SENIOR_CLASSES.includes(className) && (
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Stream</Label>
                  <Select
                    value={streamId}
                    onValueChange={(val) => setStreamId(!val || val === "none" ? "" : val)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select stream" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {streams.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Academic Year</Label>
                <Select
                  value={academicYearId}
                  items={academicYears.map((ay) => ({ value: ay.id, label: ay.name }))}
                  onValueChange={(val) => val && setAcademicYearId(val)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select academic year" />
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
              <div className="space-y-1">
                <Label className="text-xs font-medium">Class Teacher (optional)</Label>
                <Select
                  value={classTeacherId}
                  items={[
                    { value: "none", label: "None" },
                    ...teachers.map((t) => ({ value: t.id, label: `${t.full_name} (${t.employee_id})` })),
                  ]}
                  onValueChange={(val) => setClassTeacherId(!val || val === "none" ? "" : val)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select teacher" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {teachers.map((t) => (
                      <SelectItem key={t.id} value={t.id} label={`${t.full_name} (${t.employee_id})`}>
                        {t.full_name} ({t.employee_id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
                Create Class
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
