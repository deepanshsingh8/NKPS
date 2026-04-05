"use client";

import { useEffect, useState, useCallback } from "react";
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
import { Plus, Trash2, Pencil, Loader2, ClipboardList } from "lucide-react";
import { adminApi } from "@/lib/admin-api";
import type { ExamType, AcademicYear } from "@/types";

interface ExamTypeWithYear extends ExamType {
  academic_year_name?: string;
}

export default function AdminExamTypesPage() {
  const supabase = createClient();

  const [examTypes, setExamTypes] = useState<ExamTypeWithYear[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    academic_year_id: "",
    max_marks: "100",
    weightage: "",
    sort_order: "0",
  });

  const fetchData = useCallback(async () => {
    const [etRes, ayRes] = await Promise.all([
      supabase
        .from("exam_types")
        .select("*, academic_years(name)")
        .order("sort_order", { ascending: true }),
      supabase
        .from("academic_years")
        .select("*")
        .order("start_date", { ascending: false }),
    ]);

    const enriched: ExamTypeWithYear[] = (etRes.data ?? []).map(
      (et: Record<string, unknown>) => ({
        ...(et as unknown as ExamType),
        academic_year_name:
          (et.academic_years as { name: string } | null)?.name ?? "—",
      })
    );

    setExamTypes(enriched);
    setAcademicYears((ayRes.data as AcademicYear[]) ?? []);

    // Default academic year to current
    const currentYear = (ayRes.data as AcademicYear[])?.find(
      (ay) => ay.is_current
    );
    if (currentYear && !formData.academic_year_id) {
      setFormData((prev) => ({
        ...prev,
        academic_year_id: currentYear.id,
      }));
    }

    setLoading(false);
  }, [supabase, formData.academic_year_id]);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    const currentYear = academicYears.find((ay) => ay.is_current);
    setFormData({
      name: "",
      academic_year_id: currentYear?.id ?? "",
      max_marks: "100",
      weightage: "",
      sort_order: "0",
    });
    setEditingId(null);
  };

  const openEdit = (et: ExamTypeWithYear) => {
    setEditingId(et.id);
    setFormData({
      name: et.name,
      academic_year_id: et.academic_year_id,
      max_marks: String(et.max_marks),
      weightage: et.weightage !== null ? String(et.weightage) : "",
      sort_order: String(et.sort_order),
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-navy-900 dark:text-white" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl font-bold text-navy-900 dark:text-white">
          Exam Types
        </h1>
        <Button
          onClick={() => {
            resetForm();
            setDialogOpen(true);
          }}
          className="bg-navy-900 hover:bg-navy-800 text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Exam Type
        </Button>
      </div>

      <div className="erp-table-container p-6">
        {examTypes.length === 0 ? (
          <div className="text-center py-12 text-gray-400 dark:text-gray-500">
            <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No exam types created yet</p>
            <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">
              Add exam types so teachers can enter results
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Academic Year</TableHead>
                <TableHead>Max Marks</TableHead>
                <TableHead>Weightage</TableHead>
                <TableHead>Sort Order</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {examTypes.map((et) => (
                <TableRow key={et.id}>
                  <TableCell className="font-medium">{et.name}</TableCell>
                  <TableCell className="text-gray-600 dark:text-gray-300">
                    {et.academic_year_name}
                  </TableCell>
                  <TableCell>{et.max_marks}</TableCell>
                  <TableCell>
                    {et.weightage !== null ? `${et.weightage}%` : "—"}
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

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Exam Type" : "Add Exam Type"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input
                placeholder="e.g. Mid-Term, Final, Unit Test 1"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                required
              />
            </div>
            <div>
              <Label>Academic Year</Label>
              <Select
                value={formData.academic_year_id}
                onValueChange={(val) =>
                  val &&
                  setFormData({ ...formData, academic_year_id: val })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select year" />
                </SelectTrigger>
                <SelectContent>
                  {academicYears.map((ay) => (
                    <SelectItem key={ay.id} value={ay.id}>
                      {ay.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Max Marks</Label>
                <Input
                  type="number"
                  value={formData.max_marks}
                  onChange={(e) =>
                    setFormData({ ...formData, max_marks: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Weightage %</Label>
                <Input
                  type="number"
                  placeholder="Optional"
                  value={formData.weightage}
                  onChange={(e) =>
                    setFormData({ ...formData, weightage: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Sort Order</Label>
                <Input
                  type="number"
                  value={formData.sort_order}
                  onChange={(e) =>
                    setFormData({ ...formData, sort_order: e.target.value })
                  }
                />
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
                {editingId ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
