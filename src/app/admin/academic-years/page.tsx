"use client";

import { useEffect, useState } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Loader2, Star } from "lucide-react";
import { adminApi } from "@/lib/admin-api";
import type { AcademicYear } from "@/types";

export default function AdminAcademicYearsPage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingYear, setEditingYear] = useState<AcademicYear | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const supabase = createClient();

  const fetchYears = async () => {
    const { data, error } = await supabase
      .from("academic_years")
      .select("*")
      .order("start_date", { ascending: false });

    if (error) {
      toast.error("Failed to fetch academic years");
      return;
    }

    setYears((data as AcademicYear[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchYears();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setName("");
    setStartDate("");
    setEndDate("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !startDate || !endDate) {
      toast.error("All fields are required");
      return;
    }
    setSubmitting(true);

    const result = await adminApi({
      action: "insert",
      table: "academic_years",
      data: {
        name: name.trim(),
        start_date: startDate,
        end_date: endDate,
        is_current: false,
      },
    });

    if (!result.success) {
      toast.error(result.error || "Failed to create academic year");
    } else {
      toast.success("Academic year created successfully");
      setDialogOpen(false);
      resetForm();
      await fetchYears();
    }

    setSubmitting(false);
  };

  const handleSetCurrent = async (id: string) => {
    // First, unset all as not current
    // We need to update each year individually via the proxy
    for (const year of years) {
      if (year.is_current) {
        await adminApi({
          action: "update",
          table: "academic_years",
          data: { is_current: false },
          match: { column: "id", value: year.id },
        });
      }
    }

    // Set selected as current
    const result = await adminApi({
      action: "update",
      table: "academic_years",
      data: { is_current: true },
      match: { column: "id", value: id },
    });

    if (!result.success) {
      toast.error("Failed to set as current");
      return;
    }

    toast.success("Academic year set as current");
    await fetchYears();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this academic year? This may affect associated classes."))
      return;

    const result = await adminApi({
      action: "delete",
      table: "academic_years",
      match: { column: "id", value: id },
    });

    if (!result.success) {
      toast.error("Failed to delete academic year");
      return;
    }

    toast.success("Academic year deleted");
    await fetchYears();
  };

  const openEdit = (year: AcademicYear) => {
    setEditingYear(year);
    setName(year.name);
    setStartDate(year.start_date);
    setEndDate(year.end_date);
    setEditDialogOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingYear || !name.trim() || !startDate || !endDate) {
      toast.error("All fields are required");
      return;
    }
    setSubmitting(true);

    const result = await adminApi({
      action: "update",
      table: "academic_years",
      data: {
        name: name.trim(),
        start_date: startDate,
        end_date: endDate,
      },
      match: { column: "id", value: editingYear.id },
    });

    if (!result.success) {
      toast.error(result.error || "Failed to update");
    } else {
      toast.success("Academic year updated");
      setEditDialogOpen(false);
      setEditingYear(null);
      await fetchYears();
    }
    setSubmitting(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl font-bold text-navy-900">
          Academic Years
        </h1>
        <Button
          onClick={() => {
            resetForm();
            setDialogOpen(true);
          }}
          className="bg-navy-900 hover:bg-navy-800 text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Academic Year
        </Button>
      </div>

      <div className="erp-table-container p-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : years.length === 0 ? (
          <p className="text-center py-12 text-gray-500">
            No academic years found. Add one to get started.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {years.map((year) => (
                <TableRow key={year.id}>
                  <TableCell className="font-medium">{year.name}</TableCell>
                  <TableCell className="text-gray-600">
                    {new Date(year.start_date).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-gray-600">
                    {new Date(year.end_date).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {year.is_current ? (
                      <Badge
                        variant="secondary"
                        className="bg-gold-300/30 text-gold-600"
                      >
                        Current
                      </Badge>
                    ) : (
                      <span className="text-gray-400 text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {!year.is_current && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSetCurrent(year.id)}
                          className="gap-1"
                        >
                          <Star className="h-3 w-3" />
                          Set Current
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => openEdit(year)}
                        className="text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDelete(year.id)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
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

      {/* Add Academic Year Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Academic Year</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="yearName">Name</Label>
              <Input
                id="yearName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. 2025-26"
                required
              />
            </div>
            <div>
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
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
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {/* Edit Academic Year Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Academic Year</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div>
              <Label htmlFor="editYearName">Name</Label>
              <Input
                id="editYearName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. 2025-26"
                required
              />
            </div>
            <div>
              <Label htmlFor="editStartDate">Start Date</Label>
              <Input
                id="editStartDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="editEndDate">End Date</Label>
              <Input
                id="editEndDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
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
                Update
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
