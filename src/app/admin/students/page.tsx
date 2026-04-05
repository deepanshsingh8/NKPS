"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { adminFetch } from "@/lib/admin-api";
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
import {
  Plus,
  Upload,
  Trash2,
  Pencil,
  Loader2,
  Search,
  Users,
} from "lucide-react";
import { StudentBulkUpload } from "@/components/admin/StudentBulkUpload";
import type { Student, Gender, BloodGroup } from "@/types";

interface ClassOption {
  id: string;
  name: string;
  section: string;
}

interface StudentRow extends Student {
  roll_number: number | null;
  enrollment_id: string | null;
  class_name?: string;
  class_section?: string;
}

const GENDER_OPTIONS: Gender[] = ["male", "female", "other"];
const BLOOD_GROUP_OPTIONS: BloodGroup[] = [
  "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-",
];

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [search, setSearch] = useState("");

  // Dialogs
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [editingStudent, setEditingStudent] = useState<StudentRow | null>(null);
  const [formData, setFormData] = useState({
    class_id: "",
    admission_no: "",
    full_name: "",
    father_name: "",
    mother_name: "",
    date_of_birth: "",
    gender: "" as string,
    address: "",
    phone: "",
    email: "",
    blood_group: "" as string,
    category: "",
    aadhar_number: "",
    previous_school: "",
    roll_number: "",
  });

  const supabase = createClient();

  const fetchClasses = useCallback(async () => {
    // Fetch classes for the current academic year
    const { data: years } = await supabase
      .from("academic_years")
      .select("id")
      .eq("is_current", true)
      .single();

    let query = supabase
      .from("classes")
      .select("id, name, section")
      .order("sort_order", { ascending: true });

    if (years) {
      query = query.eq("academic_year_id", years.id);
    }

    const { data } = await query;
    setClasses((data as ClassOption[]) ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchStudents = useCallback(async () => {
    setLoading(true);

    try {
      const url = selectedClassId
        ? `/api/erp/students?class_id=${selectedClassId}`
        : `/api/erp/students`;
      const res = await adminFetch(url);
      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error || "Failed to fetch students");
        setStudents([]);
        setLoading(false);
        return;
      }

      setStudents((json.data as StudentRow[]) ?? []);
    } catch {
      toast.error("Failed to fetch students");
      setStudents([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClassId]);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  // Fetch all students on initial load, and re-fetch when class changes
  useEffect(() => {
    fetchStudents();
  }, [selectedClassId, fetchStudents]);

  const filteredStudents = students.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.full_name.toLowerCase().includes(q) ||
      s.admission_no.toLowerCase().includes(q) ||
      (s.father_name && s.father_name.toLowerCase().includes(q))
    );
  });

  const resetForm = () => {
    setFormData({
      class_id: selectedClassId,
      admission_no: "",
      full_name: "",
      father_name: "",
      mother_name: "",
      date_of_birth: "",
      gender: "",
      address: "",
      phone: "",
      email: "",
      blood_group: "",
      category: "",
      aadhar_number: "",
      previous_school: "",
      roll_number: "",
    });
    setEditingStudent(null);
  };

  const openEditDialog = (student: StudentRow) => {
    setEditingStudent(student);
    setFormData({
      class_id: selectedClassId,
      admission_no: student.admission_no,
      full_name: student.full_name,
      father_name: student.father_name ?? "",
      mother_name: student.mother_name ?? "",
      date_of_birth: student.date_of_birth ?? "",
      gender: student.gender ?? "",
      address: student.address ?? "",
      phone: student.phone ?? "",
      email: student.email ?? "",
      blood_group: student.blood_group ?? "",
      category: student.category ?? "",
      aadhar_number: student.aadhar_number ?? "",
      previous_school: student.previous_school ?? "",
      roll_number: student.roll_number?.toString() ?? "",
    });
    setEditDialogOpen(true);
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.admission_no || !formData.full_name) {
      toast.error("Admission number and name are required");
      return;
    }
    if (!formData.class_id) {
      toast.error("Please select a class");
      return;
    }

    setSubmitting(true);
    try {
      const res = await adminFetch("/api/erp/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          class_id: formData.class_id,
          roll_number: formData.roll_number || undefined,
          admission_no: formData.admission_no,
          full_name: formData.full_name,
          father_name: formData.father_name || undefined,
          mother_name: formData.mother_name || undefined,
          date_of_birth: formData.date_of_birth || undefined,
          gender: formData.gender || undefined,
          address: formData.address || undefined,
          phone: formData.phone || undefined,
          email: formData.email || undefined,
          blood_group: formData.blood_group || undefined,
          category: formData.category || undefined,
          aadhar_number: formData.aadhar_number || undefined,
          previous_school: formData.previous_school || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to add student");
        return;
      }

      if (data.warning) {
        toast.warning(data.warning);
      }

      toast.success("Student added successfully");
      // Switch to the class the student was added to
      if (formData.class_id !== selectedClassId) {
        setSelectedClassId(formData.class_id);
      }
      resetForm();
      setAddDialogOpen(false);
      await fetchStudents();
    } catch {
      toast.error("Failed to add student");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;

    setSubmitting(true);
    try {
      const res = await adminFetch("/api/erp/students", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingStudent.id,
          enrollment_id: editingStudent.enrollment_id,
          roll_number: formData.roll_number || undefined,
          admission_no: formData.admission_no.trim(),
          full_name: formData.full_name.trim(),
          father_name: formData.father_name.trim() || null,
          mother_name: formData.mother_name.trim() || null,
          date_of_birth: formData.date_of_birth || null,
          gender: formData.gender || null,
          address: formData.address.trim() || null,
          phone: formData.phone.trim() || null,
          email: formData.email.trim() || null,
          blood_group: formData.blood_group || null,
          category: formData.category.trim() || null,
          aadhar_number: formData.aadhar_number.trim() || null,
          previous_school: formData.previous_school.trim() || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to update student");
        return;
      }

      toast.success("Student updated successfully");
      resetForm();
      setEditDialogOpen(false);
      await fetchStudents();
    } catch {
      toast.error("Failed to update student");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (student: StudentRow) => {
    if (
      !confirm(
        `Are you sure you want to delete ${student.full_name}? This cannot be undone.`
      )
    )
      return;

    const res = await adminFetch("/api/erp/students", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: student.id }),
    });

    const data = await res.json();

    if (!res.ok) {
      toast.error(data.error || "Failed to delete student");
      return;
    }

    toast.success("Student deleted");
    await fetchStudents();
  };

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Student form used in both Add and Edit dialogs
  const renderStudentForm = (
    onSubmit: (e: React.FormEvent) => void,
    isEdit: boolean
  ) => (
    <form onSubmit={onSubmit} className="space-y-4">
      {!isEdit && (
        <div>
          <Label>Class *</Label>
          <Select
            value={formData.class_id}
            onValueChange={(val) => val && updateField("class_id", val)}
          >
            <SelectTrigger className="w-full mt-1">
              <SelectValue placeholder="Select class for enrollment..." />
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
      )}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="admission_no">Admission No *</Label>
          <Input
            id="admission_no"
            value={formData.admission_no}
            onChange={(e) => updateField("admission_no", e.target.value)}
            placeholder="e.g. 1001"
            required
          />
        </div>
        <div>
          <Label htmlFor="full_name">Full Name *</Label>
          <Input
            id="full_name"
            value={formData.full_name}
            onChange={(e) => updateField("full_name", e.target.value)}
            placeholder="Student's full name"
            required
          />
        </div>
        <div>
          <Label htmlFor="father_name">Father&apos;s Name</Label>
          <Input
            id="father_name"
            value={formData.father_name}
            onChange={(e) => updateField("father_name", e.target.value)}
            placeholder="Father's name"
          />
        </div>
        <div>
          <Label htmlFor="mother_name">Mother&apos;s Name</Label>
          <Input
            id="mother_name"
            value={formData.mother_name}
            onChange={(e) => updateField("mother_name", e.target.value)}
            placeholder="Mother's name"
          />
        </div>
        <div>
          <Label htmlFor="date_of_birth">Date of Birth</Label>
          <Input
            id="date_of_birth"
            type="date"
            value={formData.date_of_birth}
            onChange={(e) => updateField("date_of_birth", e.target.value)}
          />
        </div>
        <div>
          <Label>Gender</Label>
          <Select
            value={formData.gender}
            onValueChange={(val) => val && updateField("gender", val)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select gender" />
            </SelectTrigger>
            <SelectContent>
              {GENDER_OPTIONS.map((g) => (
                <SelectItem key={g} value={g}>
                  {g.charAt(0).toUpperCase() + g.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            value={formData.phone}
            onChange={(e) => updateField("phone", e.target.value)}
            placeholder="Phone number"
          />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => updateField("email", e.target.value)}
            placeholder="Email (optional)"
          />
        </div>
        <div>
          <Label>Blood Group</Label>
          <Select
            value={formData.blood_group}
            onValueChange={(val) => val && updateField("blood_group", val)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select blood group" />
            </SelectTrigger>
            <SelectContent>
              {BLOOD_GROUP_OPTIONS.map((bg) => (
                <SelectItem key={bg} value={bg}>
                  {bg}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="roll_number">Roll Number</Label>
          <Input
            id="roll_number"
            type="number"
            value={formData.roll_number}
            onChange={(e) => updateField("roll_number", e.target.value)}
            placeholder="Roll number"
          />
        </div>
        <div>
          <Label htmlFor="category">Category</Label>
          <Input
            id="category"
            value={formData.category}
            onChange={(e) => updateField("category", e.target.value)}
            placeholder="e.g. General, OBC, SC, ST"
          />
        </div>
        <div>
          <Label htmlFor="aadhar_number">Aadhar Number</Label>
          <Input
            id="aadhar_number"
            value={formData.aadhar_number}
            onChange={(e) => updateField("aadhar_number", e.target.value)}
            placeholder="12-digit Aadhar number"
          />
        </div>
      </div>
      <div>
        <Label htmlFor="address">Address</Label>
        <Input
          id="address"
          value={formData.address}
          onChange={(e) => updateField("address", e.target.value)}
          placeholder="Full address"
        />
      </div>
      <div>
        <Label htmlFor="previous_school">Previous School</Label>
        <Input
          id="previous_school"
          value={formData.previous_school}
          onChange={(e) => updateField("previous_school", e.target.value)}
          placeholder="Name of previous school"
        />
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            resetForm();
            isEdit ? setEditDialogOpen(false) : setAddDialogOpen(false);
          }}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={submitting}
          className="bg-navy-900 hover:bg-navy-800 text-white"
        >
          {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {isEdit ? "Update Student" : "Add Student"}
        </Button>
      </DialogFooter>
    </form>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-navy-900 flex items-center justify-center">
            <Users className="h-4.5 w-4.5 text-gold-400" />
          </div>
          <div>
            <h1 className="erp-page-title">Students</h1>
            <p className="erp-page-subtitle">Manage student records and enrollments</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setUploadDialogOpen(true)}
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            Upload Excel
          </Button>
          <Button
            onClick={() => {
              resetForm();
              setAddDialogOpen(true);
            }}
            className="bg-navy-900 hover:bg-navy-800 text-white shadow-sm"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Student
          </Button>
        </div>
      </div>

      <div className="erp-table-container p-6">
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="w-full sm:w-64">
            <Select value={selectedClassId || "all"} onValueChange={(val) => setSelectedClassId(!val || val === "all" ? "" : val)}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="All Classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} - {c.section}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
            <Input
              placeholder="Search by name or admission number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-10 border-gray-200 dark:border-border focus:border-navy-900 focus:ring-navy-900/20"
            />
          </div>
          <div className="flex items-center">
            <Badge variant="secondary" className="bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300">
              <Users className="h-3 w-3 mr-1" />
              {filteredStudents.length} student
              {filteredStudents.length === 1 ? "" : "s"}
            </Badge>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400 dark:text-gray-500" />
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="text-center py-12">
            <Users className="h-12 w-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400 mb-2">No students found.</p>
            <p className="text-sm text-gray-400 dark:text-gray-500">
              Upload an Excel file or add students individually.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Adm No</TableHead>
                  <TableHead>Name</TableHead>
                  {!selectedClassId && <TableHead>Class</TableHead>}
                  <TableHead>Father&apos;s Name</TableHead>
                  <TableHead>Roll No</TableHead>
                  <TableHead>Gender</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStudents.map((student) => (
                  <TableRow key={student.id}>
                    <TableCell className="font-medium">
                      {student.admission_no}
                    </TableCell>
                    <TableCell>{student.full_name}</TableCell>
                    {!selectedClassId && (
                      <TableCell className="text-gray-600 dark:text-gray-300">
                        {student.class_name
                          ? `${student.class_name}-${student.class_section ?? ""}`
                          : "—"}
                      </TableCell>
                    )}
                    <TableCell className="text-gray-600 dark:text-gray-300">
                      {student.father_name || "—"}
                    </TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-300">
                      {student.roll_number ?? "—"}
                    </TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-300 capitalize">
                      {student.gender || "—"}
                    </TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-300">
                      {student.phone || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={
                          student.is_active
                            ? "bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400"
                            : "bg-gray-100 dark:bg-muted text-gray-500 dark:text-gray-400"
                        }
                      >
                        {student.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openEditDialog(student)}
                          className="text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleDelete(student)}
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
          </div>
        )}
      </div>

      {/* Add Student Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Student</DialogTitle>
          </DialogHeader>
          {renderStudentForm(handleAddStudent, false)}
        </DialogContent>
      </Dialog>

      {/* Edit Student Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Student</DialogTitle>
          </DialogHeader>
          {renderStudentForm(handleEditStudent, true)}
        </DialogContent>
      </Dialog>

      {/* Bulk Upload Dialog */}
      <StudentBulkUpload
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        classes={classes}
        onSuccess={fetchStudents}
      />
    </div>
  );
}
