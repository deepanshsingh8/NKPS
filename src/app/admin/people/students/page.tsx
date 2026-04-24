"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { adminFetch } from "@/lib/admin-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  GraduationCap,
  ArrowUpCircle,
  Download,
  ChevronDown,
  UserPlus,
  FileSignature,
  Receipt,
  User,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StudentBulkUpload } from "@/components/admin/StudentBulkUpload";
import { CreatePortalUsersDialog } from "@/components/admin/CreatePortalUsersDialog";
import { formatClassName } from "@/lib/utils";
import { downloadCSV, STUDENT_CSV_COLUMNS } from "@/lib/csv-export";
import type { Student, Gender, BloodGroup, Stream, EnrollmentStatus } from "@/types";

interface ClassOption {
  id: string;
  name: string;
  section: string;
  stream_id: string | null;
  stream_name: string | null;
}

interface AcademicYear {
  id: string;
  name: string;
  is_current: boolean;
}

const HIGHER_CLASSES = ["XI", "XII"];

interface StudentRow extends Student {
  roll_number: number | null;
  roll_number_manual?: boolean;
  enrollment_id: string | null;
  class_id?: string | null;
  stream_id?: string | null;
  enrollment_status?: EnrollmentStatus | null;
  class_name?: string;
  class_section?: string;
}

const GENDER_OPTIONS: Gender[] = ["male", "female", "other"];
const BLOOD_GROUP_OPTIONS: BloodGroup[] = [
  "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-",
];

const ENROLLMENT_STATUSES: EnrollmentStatus[] = [
  "active", "passed", "failed", "terminated", "exited",
];

const STATUS_BADGE_STYLES: Record<EnrollmentStatus, string> = {
  active: "bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400",
  passed: "bg-blue-100 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400",
  failed: "bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400",
  terminated: "bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400",
  exited: "bg-gray-100 dark:bg-muted text-gray-500 dark:text-gray-400",
};

function classLabel(c: ClassOption): string {
  return formatClassName(c);
}

function DetailField({
  label,
  value,
  children,
}: {
  label: string;
  value?: string | number | null;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
        {label}
      </p>
      {children ?? (
        <p className="text-sm text-gray-800 dark:text-gray-100 break-words">
          {value ?? "—"}
        </p>
      )}
    </div>
  );
}

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [search, setSearch] = useState("");

  // Dialogs
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [promoteDialogOpen, setPromoteDialogOpen] = useState(false);
  const [portalDialogOpen, setPortalDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Selection & bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatusValue, setBulkStatusValue] = useState<string>("");
  const [applyingBulk, setApplyingBulk] = useState(false);

  // Promote dialog state
  const [targetAcademicYearId, setTargetAcademicYearId] = useState("");
  const [promoting, setPromoting] = useState(false);
  const [promoteResult, setPromoteResult] = useState<{
    promoted: number;
    retained: number;
    graduated: number;
    skipped: number;
    errors: string[];
    warnings: string[];
  } | null>(null);

  // Detail view dialog (read-only quick peek, separate from edit)
  const [detailStudent, setDetailStudent] = useState<StudentRow | null>(null);

  // Generate TC dialog
  const [generateTcOpen, setGenerateTcOpen] = useState(false);
  const [tcTargetStudent, setTcTargetStudent] = useState<StudentRow | null>(null);
  const [tcSubmitting, setTcSubmitting] = useState(false);
  const [tcForm, setTcForm] = useState({
    reason_for_leaving: "",
    last_attended_date: new Date().toISOString().split("T")[0],
    conduct: "Good",
    remarks: "",
    issue_date: new Date().toISOString().split("T")[0],
  });

  // Form state
  const [editingStudent, setEditingStudent] = useState<StudentRow | null>(null);
  const [formData, setFormData] = useState({
    class_id: "",
    stream_id: "",
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
    roll_number_manual: false,
  });

  const supabase = createClient();
  const router = useRouter();

  const fetchClasses = useCallback(async () => {
    // Fetch classes for the current academic year
    const { data: years } = await supabase
      .from("academic_years")
      .select("id")
      .eq("is_current", true)
      .single();

    let query = supabase
      .from("classes")
      .select("id, name, section, stream_id, streams(name)")
      .order("sort_order", { ascending: true });

    if (years) {
      query = query.eq("academic_year_id", years.id);
    }

    const { data } = await query;
    const classOptions: ClassOption[] = (data ?? []).map((c: Record<string, unknown>) => ({
      id: c.id as string,
      name: c.name as string,
      section: c.section as string,
      stream_id: c.stream_id as string | null,
      stream_name: (c.streams as { name: string } | null)?.name ?? null,
    }));
    setClasses(classOptions);

    // Fetch active streams for higher-class enrollment
    const { data: streamsData } = await supabase
      .from("streams")
      .select("*")
      .eq("is_active", true)
      .order("sort_order");
    setStreams((streamsData as Stream[]) ?? []);

    // Fetch all academic years for promotion
    const { data: allYears } = await supabase
      .from("academic_years")
      .select("id, name, is_current")
      .order("name", { ascending: false });
    setAcademicYears((allYears as AcademicYear[]) ?? []);
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
    setSelectedIds(new Set()); // Clear selection on class change
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
      stream_id: "",
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
      roll_number_manual: false,
    });
    setEditingStudent(null);
  };

  // Determine if the selected class in the form is a higher class
  const selectedFormClass = classes.find((c) => c.id === formData.class_id);
  const isHigherClass = selectedFormClass
    ? HIGHER_CLASSES.includes(selectedFormClass.name)
    : false;

  const openEditDialog = (student: StudentRow) => {
    setEditingStudent(student);
    setFormData({
      class_id: student.class_id || selectedClassId || "",
      stream_id: student.stream_id || "",
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
      roll_number_manual: student.roll_number_manual ?? false,
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
          roll_number_manual: formData.roll_number_manual,
          stream_id: formData.stream_id || undefined,
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
          class_id: formData.class_id || undefined,
          stream_id: formData.stream_id,
          roll_number: formData.roll_number || undefined,
          roll_number_manual: formData.roll_number_manual,
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

  // Open Generate TC dialog for a student
  const openGenerateTcDialog = (student: StudentRow) => {
    setTcTargetStudent(student);
    const today = new Date().toISOString().split("T")[0];
    setTcForm({
      reason_for_leaving: "",
      last_attended_date: today,
      conduct: "Good",
      remarks: "",
      issue_date: today,
    });
    setGenerateTcOpen(true);
  };

  const handleGenerateTc = async () => {
    if (!tcTargetStudent) return;
    const reason = tcForm.reason_for_leaving.trim();
    if (!reason) {
      toast.error("Reason for leaving is required");
      return;
    }
    if (!tcForm.last_attended_date) {
      toast.error("Last attended date is required");
      return;
    }

    setTcSubmitting(true);
    try {
      const res = await adminFetch(
        "/api/erp/transfer-certificates/generate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            student_id: tcTargetStudent.id,
            reason_for_leaving: reason,
            last_attended_date: tcForm.last_attended_date,
            conduct: tcForm.conduct || "Good",
            remarks: tcForm.remarks.trim() || undefined,
            issue_date: tcForm.issue_date || undefined,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to generate TC");
        return;
      }
      toast.success(`TC generated (${data.tc?.tc_number ?? "saved"})`);
      if (data.file_url) {
        window.open(data.file_url, "_blank", "noopener");
      }
      setGenerateTcOpen(false);
      setTcTargetStudent(null);
      await fetchStudents();
    } catch {
      toast.error("Failed to generate TC");
    } finally {
      setTcSubmitting(false);
    }
  };

  // Status update for a single student
  const handleStatusChange = async (enrollmentId: string, status: EnrollmentStatus) => {
    try {
      const res = await adminFetch("/api/erp/students/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates: [{ enrollment_id: enrollmentId, status }],
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to update status");
        return;
      }

      // Update locally for instant feedback
      setStudents((prev) =>
        prev.map((s) =>
          s.enrollment_id === enrollmentId
            ? { ...s, enrollment_status: status }
            : s
        )
      );
      toast.success("Status updated");
    } catch {
      toast.error("Failed to update status");
    }
  };

  // Bulk status update
  const handleBulkStatusUpdate = async () => {
    if (!bulkStatusValue || selectedIds.size === 0) return;

    setApplyingBulk(true);
    try {
      const updates = Array.from(selectedIds)
        .map((studentId) => {
          const student = students.find((s) => s.id === studentId);
          return student?.enrollment_id
            ? { enrollment_id: student.enrollment_id, status: bulkStatusValue as EnrollmentStatus }
            : null;
        })
        .filter(Boolean);

      if (updates.length === 0) {
        toast.error("No valid enrollments selected");
        return;
      }

      const res = await adminFetch("/api/erp/students/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to update statuses");
        return;
      }

      toast.success(`Updated ${data.updated} student(s)`);
      setSelectedIds(new Set());
      setBulkStatusValue("");
      await fetchStudents();
    } catch {
      toast.error("Failed to update statuses");
    } finally {
      setApplyingBulk(false);
    }
  };

  // Bulk delete
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (
      !confirm(
        `Delete ${selectedIds.size} student${selectedIds.size === 1 ? "" : "s"}? This will also remove their enrollments and linked portal accounts. This cannot be undone.`
      )
    )
      return;

    setApplyingBulk(true);
    try {
      const res = await adminFetch("/api/erp/students", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to delete students");
        return;
      }

      toast.success(`Deleted ${selectedIds.size} student${selectedIds.size === 1 ? "" : "s"}`);
      setSelectedIds(new Set());
      await fetchStudents();
    } catch {
      toast.error("Failed to delete students");
    } finally {
      setApplyingBulk(false);
    }
  };

  // Toggle selection
  const toggleSelection = (studentId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredStudents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredStudents.map((s) => s.id)));
    }
  };

  // Promote handler
  const handlePromote = async () => {
    if (!selectedClassId || !targetAcademicYearId) return;

    setPromoting(true);
    setPromoteResult(null);

    try {
      const res = await adminFetch("/api/erp/students/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          class_id: selectedClassId,
          target_academic_year_id: targetAcademicYearId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Promotion failed");
        return;
      }

      setPromoteResult(data.summary);
      toast.success("Promotion completed");
      await fetchStudents();
    } catch {
      toast.error("Promotion failed");
    } finally {
      setPromoting(false);
    }
  };

  // Status counts for the currently loaded students
  const statusCounts = students.reduce(
    (acc, s) => {
      const st = s.enrollment_status || "active";
      acc[st] = (acc[st] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // Get current class info for promote dialog
  const currentClass = classes.find((c) => c.id === selectedClassId);

  // Student form used in both Add and Edit dialogs
  const renderStudentForm = (
    onSubmit: (e: React.FormEvent) => void,
    isEdit: boolean
  ) => (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <Label className="text-xs font-medium">Class *</Label>
        <Select
          value={formData.class_id}
          items={classes.map((c) => ({ value: c.id, label: classLabel(c) }))}
          onValueChange={(val) => {
            if (val) {
              updateField("class_id", val);
              // Reset stream when class changes
              const cls = classes.find((c) => c.id === val);
              if (!cls || !HIGHER_CLASSES.includes(cls.name)) {
                updateField("stream_id", "");
              }
            }
          }}
        >
          <SelectTrigger className="w-full mt-1">
            <SelectValue placeholder="Select class for enrollment..." />
          </SelectTrigger>
          <SelectContent>
            {classes.map((c) => (
              <SelectItem key={c.id} value={c.id} label={classLabel(c)}>
                {classLabel(c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {isHigherClass && streams.length > 0 && (
        <div>
          <Label className="text-xs font-medium">Stream</Label>
          <Select
            value={formData.stream_id || "none"}
            items={[
              { value: "none", label: "No stream" },
              ...streams.map((s) => ({ value: s.id, label: s.name + (s.code ? ` (${s.code})` : "") })),
            ]}
            onValueChange={(val) =>
              updateField("stream_id", !val || val === "none" ? "" : val)
            }
          >
            <SelectTrigger className="w-full mt-1">
              <SelectValue placeholder="Select stream..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none" label="No stream">
                No stream
              </SelectItem>
              {streams.map((s) => (
                <SelectItem key={s.id} value={s.id} label={s.name}>
                  {s.name}
                  {s.code ? ` (${s.code})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Stream determines which subjects the student takes
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="admission_no" className="text-xs font-medium">Admission No *</Label>
          <Input
            id="admission_no"
            className="h-9"
            value={formData.admission_no}
            onChange={(e) => updateField("admission_no", e.target.value)}
            placeholder="e.g. 1001"
            required
          />
        </div>
        <div>
          <Label htmlFor="full_name" className="text-xs font-medium">Full Name *</Label>
          <Input
            id="full_name"
            className="h-9"
            value={formData.full_name}
            onChange={(e) => updateField("full_name", e.target.value)}
            placeholder="Student's full name"
            required
          />
        </div>
        <div>
          <Label htmlFor="father_name" className="text-xs font-medium">Father&apos;s Name</Label>
          <Input
            id="father_name"
            className="h-9"
            value={formData.father_name}
            onChange={(e) => updateField("father_name", e.target.value)}
            placeholder="Father's name"
          />
        </div>
        <div>
          <Label htmlFor="mother_name" className="text-xs font-medium">Mother&apos;s Name</Label>
          <Input
            id="mother_name"
            className="h-9"
            value={formData.mother_name}
            onChange={(e) => updateField("mother_name", e.target.value)}
            placeholder="Mother's name"
          />
        </div>
        <div>
          <Label htmlFor="date_of_birth" className="text-xs font-medium">Date of Birth</Label>
          <Input
            id="date_of_birth"
            className="h-9"
            type="date"
            value={formData.date_of_birth}
            onChange={(e) => updateField("date_of_birth", e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs font-medium">Gender</Label>
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
          <Label htmlFor="phone" className="text-xs font-medium">Phone</Label>
          <Input
            id="phone"
            className="h-9"
            value={formData.phone}
            onChange={(e) => updateField("phone", e.target.value)}
            placeholder="Phone number"
          />
        </div>
        <div>
          <Label htmlFor="email" className="text-xs font-medium">Email</Label>
          <Input
            id="email"
            className="h-9"
            type="email"
            value={formData.email}
            onChange={(e) => updateField("email", e.target.value)}
            placeholder="Email (optional)"
          />
        </div>
        <div>
          <Label className="text-xs font-medium">Blood Group</Label>
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
          <Label htmlFor="roll_number" className="text-xs font-medium">Roll Number</Label>
          <Input
            id="roll_number"
            className="h-9"
            type="number"
            value={formData.roll_number}
            onChange={(e) => updateField("roll_number", e.target.value)}
            placeholder="Roll number"
            disabled={!formData.roll_number_manual}
          />
          <div className="mt-2 flex items-start gap-2">
            <Checkbox
              id="roll_number_manual"
              checked={formData.roll_number_manual}
              onCheckedChange={(val) =>
                setFormData((prev) => ({ ...prev, roll_number_manual: val === true }))
              }
              className="mt-0.5"
            />
            <div className="flex-1">
              <Label
                htmlFor="roll_number_manual"
                className="text-xs font-medium cursor-pointer"
              >
                Manual override
              </Label>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">
                {formData.roll_number_manual
                  ? "Manual — will not be changed by auto-recompute"
                  : "Auto-assigned alphabetically (default)"}
              </p>
            </div>
          </div>
        </div>
        <div>
          <Label htmlFor="category" className="text-xs font-medium">Category</Label>
          <Input
            id="category"
            className="h-9"
            value={formData.category}
            onChange={(e) => updateField("category", e.target.value)}
            placeholder="e.g. General, OBC, SC, ST"
          />
        </div>
        <div>
          <Label htmlFor="aadhar_number" className="text-xs font-medium">Aadhar Number</Label>
          <Input
            id="aadhar_number"
            className="h-9"
            value={formData.aadhar_number}
            onChange={(e) => updateField("aadhar_number", e.target.value)}
            placeholder="12-digit Aadhar number"
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="address" className="text-xs font-medium">Address</Label>
        <Input
          id="address"
          className="h-9"
          value={formData.address}
          onChange={(e) => updateField("address", e.target.value)}
          placeholder="Full address"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="previous_school" className="text-xs font-medium">Previous School</Label>
        <Input
          id="previous_school"
          className="h-9"
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
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" className="gap-2" />}
            >
              Actions
              <ChevronDown className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {selectedClassId && (
                <DropdownMenuItem
                  onClick={() => {
                    setPromoteResult(null);
                    setTargetAcademicYearId("");
                    setPromoteDialogOpen(true);
                  }}
                >
                  <ArrowUpCircle className="h-4 w-4 mr-2" />
                  Promote Class
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                disabled={filteredStudents.length === 0}
                onClick={() => {
                  const rows = filteredStudents.map((s) => ({
                    ...s,
                    class_name: s.class_name ?? "",
                    class_section: s.class_section ?? "",
                    enrollment_status: s.enrollment_status ?? "active",
                  }));
                  downloadCSV(rows, STUDENT_CSV_COLUMNS, `students-${new Date().toISOString().split("T")[0]}`);
                  toast.success(`Downloaded ${rows.length} students`);
                }}
              >
                <Download className="h-4 w-4 mr-2" />
                Download CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setUploadDialogOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Upload Excel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
            <Select
              value={selectedClassId || "all"}
              items={[{ value: "all", label: "All Classes" }, ...classes.map((c) => ({ value: c.id, label: classLabel(c) }))]}
              onValueChange={(val) => setSelectedClassId(!val || val === "all" ? "" : val)}
            >
              <SelectTrigger className="h-10">
                <SelectValue placeholder="All Classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id} label={classLabel(c)}>
                    {classLabel(c)}
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

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 mb-4 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
              {selectedIds.size} selected
            </span>
            <div className="w-40">
              <Select
                value={bulkStatusValue || "choose"}
                onValueChange={(val) => setBulkStatusValue(!val || val === "choose" ? "" : val)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Set status..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="choose">Set status...</SelectItem>
                  {ENROLLMENT_STATUSES.map((st) => (
                    <SelectItem key={st} value={st}>
                      {st.charAt(0).toUpperCase() + st.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              disabled={!bulkStatusValue || applyingBulk}
              onClick={handleBulkStatusUpdate}
              className="bg-navy-900 hover:bg-navy-800 text-white"
            >
              {applyingBulk && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Apply
            </Button>
            <div className="w-px h-6 bg-blue-200 dark:bg-blue-700" />
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPortalDialogOpen(true)}
              className="gap-1"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Create Users
            </Button>
            <div className="w-px h-6 bg-blue-200 dark:bg-blue-700" />
            <Button
              size="sm"
              variant="destructive"
              disabled={applyingBulk}
              onClick={handleBulkDelete}
            >
              {applyingBulk && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Delete Selected
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSelectedIds(new Set());
                setBulkStatusValue("");
              }}
            >
              Clear
            </Button>
          </div>
        )}

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
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selectedIds.size === filteredStudents.length && filteredStudents.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Adm No</TableHead>
                  <TableHead>Name</TableHead>
                  {!selectedClassId && <TableHead>Class</TableHead>}
                  {selectedClassId && <TableHead>Roll No</TableHead>}
                  <TableHead>Father&apos;s Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStudents.map((student) => (
                  <TableRow
                    key={student.id}
                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-muted/30"
                    onClick={() => setDetailStudent(student)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(student.id)}
                        onCheckedChange={() => toggleSelection(student.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {student.admission_no}
                    </TableCell>
                    <TableCell>{student.full_name}</TableCell>
                    {!selectedClassId && (
                      <TableCell className="text-gray-600 dark:text-gray-300">
                        {student.class_name ? (
                          <span>
                            {student.class_name}
                            {student.class_section ? `-${student.class_section}` : ""}
                          </span>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-950/50"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditDialog(student);
                            }}
                            title="Click to assign a class"
                          >
                            Unassigned
                          </Badge>
                        )}
                      </TableCell>
                    )}
                    {selectedClassId && (
                      <TableCell className="text-gray-600 dark:text-gray-300">
                        {student.roll_number ?? "\u2014"}
                      </TableCell>
                    )}
                    <TableCell className="text-gray-600 dark:text-gray-300">
                      {student.father_name || "\u2014"}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {student.enrollment_id && selectedClassId ? (
                        <Select
                          value={student.enrollment_status || "active"}
                          onValueChange={(val) => {
                            if (val && student.enrollment_id) {
                              handleStatusChange(student.enrollment_id, val as EnrollmentStatus);
                            }
                          }}
                        >
                          <SelectTrigger className="h-7 w-[110px] text-xs border-0 bg-transparent p-0 pr-6">
                            <Badge
                              variant="secondary"
                              className={STATUS_BADGE_STYLES[student.enrollment_status || "active"]}
                            >
                              {(student.enrollment_status || "active").charAt(0).toUpperCase() +
                                (student.enrollment_status || "active").slice(1)}
                            </Badge>
                          </SelectTrigger>
                          <SelectContent>
                            {ENROLLMENT_STATUSES.map((st) => (
                              <SelectItem key={st} value={st}>
                                {st.charAt(0).toUpperCase() + st.slice(1)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge
                          variant="secondary"
                          className={
                            student.enrollment_status
                              ? STATUS_BADGE_STYLES[student.enrollment_status]
                              : student.is_active
                                ? STATUS_BADGE_STYLES.active
                                : STATUS_BADGE_STYLES.exited
                          }
                        >
                          {student.enrollment_status
                            ? student.enrollment_status.charAt(0).toUpperCase() + student.enrollment_status.slice(1)
                            : student.is_active ? "Active" : "Inactive"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openEditDialog(student)}
                          className="text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                          title="Edit student"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() =>
                            router.push(`/admin/fees?student_id=${student.id}`)
                          }
                          className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                          title="View fees / record payment"
                        >
                          <Receipt className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openGenerateTcDialog(student)}
                          disabled={!student.is_active}
                          className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30 disabled:opacity-40"
                          title={
                            student.is_active
                              ? "Generate Transfer Certificate"
                              : "TC already issued / student inactive"
                          }
                        >
                          <FileSignature className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleDelete(student)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                          title="Delete student"
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
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
                <GraduationCap className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <DialogTitle>Add New Student</DialogTitle>
                <p className="text-xs text-gray-500 mt-0.5">Enroll a new student into the system</p>
              </div>
            </div>
          </DialogHeader>
          {renderStudentForm(handleAddStudent, false)}
        </DialogContent>
      </Dialog>

      {/* Edit Student Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
                <Pencil className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <DialogTitle>Edit Student</DialogTitle>
                <p className="text-xs text-gray-500 mt-0.5">Update student information</p>
              </div>
            </div>
          </DialogHeader>
          {renderStudentForm(handleEditStudent, true)}
        </DialogContent>
      </Dialog>

      {/* Student Detail Dialog (read-only quick peek) */}
      <Dialog
        open={!!detailStudent}
        onOpenChange={(open) => {
          if (!open) setDetailStudent(null);
        }}
      >
        <DialogContent className="sm:max-w-xl">
          {detailStudent && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-900/10 dark:bg-navy-900/30">
                    <User className="h-5 w-5 text-navy-900 dark:text-gold-400" />
                  </div>
                  <div>
                    <DialogTitle>{detailStudent.full_name}</DialogTitle>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Admission No: {detailStudent.admission_no}
                      {detailStudent.class_name
                        ? ` • Class ${detailStudent.class_name}${detailStudent.class_section ? `-${detailStudent.class_section}` : ""}`
                        : " • Unassigned"}
                    </p>
                  </div>
                </div>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                <DetailField label="Roll Number" value={detailStudent.roll_number ?? "—"} />
                <DetailField label="Status">
                  <Badge
                    variant="secondary"
                    className={
                      detailStudent.enrollment_status
                        ? STATUS_BADGE_STYLES[detailStudent.enrollment_status]
                        : detailStudent.is_active
                          ? STATUS_BADGE_STYLES.active
                          : STATUS_BADGE_STYLES.exited
                    }
                  >
                    {detailStudent.enrollment_status
                      ? detailStudent.enrollment_status.charAt(0).toUpperCase() +
                        detailStudent.enrollment_status.slice(1)
                      : detailStudent.is_active
                        ? "Active"
                        : "Inactive"}
                  </Badge>
                </DetailField>
                <DetailField label="Father's Name" value={detailStudent.father_name || "—"} />
                <DetailField label="Mother's Name" value={detailStudent.mother_name || "—"} />
                <DetailField
                  label="Gender"
                  value={
                    detailStudent.gender
                      ? detailStudent.gender.charAt(0).toUpperCase() + detailStudent.gender.slice(1)
                      : "—"
                  }
                />
                <DetailField label="Date of Birth" value={detailStudent.date_of_birth || "—"} />
                <DetailField label="Phone" value={detailStudent.phone || "—"} />
                <DetailField label="Email" value={detailStudent.email || "—"} />
                <DetailField label="Blood Group" value={detailStudent.blood_group || "—"} />
                <DetailField label="Category" value={detailStudent.category || "—"} />
                <DetailField label="Aadhar" value={detailStudent.aadhar_number || "—"} />
                <DetailField label="Previous School" value={detailStudent.previous_school || "—"} />
                <div className="col-span-2">
                  <DetailField label="Address" value={detailStudent.address || "—"} />
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    const s = detailStudent;
                    setDetailStudent(null);
                    openEditDialog(s);
                  }}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                <Button
                  onClick={() => setDetailStudent(null)}
                  className="bg-navy-900 hover:bg-navy-800 text-white"
                >
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Promote Dialog */}
      <Dialog open={promoteDialogOpen} onOpenChange={setPromoteDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10">
                <ArrowUpCircle className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <DialogTitle>Promote Class</DialogTitle>
                <p className="text-xs text-gray-500 mt-0.5">
                  {currentClass
                    ? `${currentClass.name} - ${currentClass.section}`
                    : "Select a class first"}
                </p>
              </div>
            </div>
          </DialogHeader>

          {promoteResult ? (
            <div className="space-y-4">
              <h3 className="font-medium text-sm">Promotion Complete</h3>
              <div className="grid grid-cols-2 gap-3">
                {promoteResult.promoted > 0 && (
                  <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20">
                    <p className="text-2xl font-bold text-green-700 dark:text-green-400">{promoteResult.promoted}</p>
                    <p className="text-xs text-green-600 dark:text-green-500">Promoted</p>
                  </div>
                )}
                {promoteResult.retained > 0 && (
                  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20">
                    <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{promoteResult.retained}</p>
                    <p className="text-xs text-amber-600 dark:text-amber-500">Retained (Failed)</p>
                  </div>
                )}
                {promoteResult.graduated > 0 && (
                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20">
                    <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{promoteResult.graduated}</p>
                    <p className="text-xs text-blue-600 dark:text-blue-500">Graduated (Alumni)</p>
                  </div>
                )}
                {promoteResult.skipped > 0 && (
                  <div className="p-3 rounded-lg bg-gray-50 dark:bg-muted">
                    <p className="text-2xl font-bold text-gray-700 dark:text-gray-400">{promoteResult.skipped}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-500">Skipped</p>
                  </div>
                )}
              </div>
              {promoteResult.warnings.length > 0 && (
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 text-sm text-amber-700 dark:text-amber-400">
                  <p className="font-medium mb-1">Warnings:</p>
                  <ul className="list-disc pl-4 space-y-1 text-xs">
                    {promoteResult.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
              {promoteResult.errors.length > 0 && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/20 text-sm text-red-700 dark:text-red-400">
                  <p className="font-medium mb-1">Errors:</p>
                  <ul className="list-disc pl-4 space-y-1 text-xs">
                    {promoteResult.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setPromoteDialogOpen(false)}>
                  Close
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Status summary */}
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="p-2 rounded bg-blue-50 dark:bg-blue-950/20">
                  <p className="text-lg font-bold text-blue-700 dark:text-blue-400">{statusCounts.passed || 0}</p>
                  <p className="text-[10px] text-blue-600 dark:text-blue-500">Passed</p>
                </div>
                <div className="p-2 rounded bg-amber-50 dark:bg-amber-950/20">
                  <p className="text-lg font-bold text-amber-700 dark:text-amber-400">{statusCounts.failed || 0}</p>
                  <p className="text-[10px] text-amber-600 dark:text-amber-500">Failed</p>
                </div>
                <div className="p-2 rounded bg-red-50 dark:bg-red-950/20">
                  <p className="text-lg font-bold text-red-700 dark:text-red-400">{(statusCounts.terminated || 0) + (statusCounts.exited || 0)}</p>
                  <p className="text-[10px] text-red-600 dark:text-red-500">Term/Exit</p>
                </div>
                <div className="p-2 rounded bg-green-50 dark:bg-green-950/20">
                  <p className="text-lg font-bold text-green-700 dark:text-green-400">{statusCounts.active || 0}</p>
                  <p className="text-[10px] text-green-600 dark:text-green-500">Active</p>
                </div>
              </div>

              {(statusCounts.active || 0) > 0 && (
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 text-sm text-amber-700 dark:text-amber-400">
                  <strong>{statusCounts.active}</strong> student(s) still have &quot;active&quot; status.
                  Please mark all students as passed/failed/terminated/exited before promoting.
                </div>
              )}

              <div>
                <Label className="text-xs font-medium">Promote to Academic Year *</Label>
                <Select
                  value={targetAcademicYearId || "choose"}
                  items={[
                    { value: "choose", label: "Select academic year..." },
                    ...academicYears.map((y) => ({ value: y.id, label: y.name + (y.is_current ? " (Current)" : "") })),
                  ]}
                  onValueChange={(val) => setTargetAcademicYearId(!val || val === "choose" ? "" : val)}
                >
                  <SelectTrigger className="w-full mt-1">
                    <SelectValue placeholder="Select target academic year..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="choose">Select academic year...</SelectItem>
                    {academicYears.map((y) => (
                      <SelectItem key={y.id} value={y.id}>
                        {y.name}{y.is_current ? " (Current)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {currentClass && (
                <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                  {currentClass.name === "XII" ? (
                    <p>Passed students will be <strong>graduated as alumni</strong>.</p>
                  ) : (
                    <p>Passed students will be promoted to the next grade with the same section.</p>
                  )}
                  <p>Failed students will be re-enrolled in the same class.</p>
                  <p>Terminated/Exited students will be skipped.</p>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setPromoteDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  disabled={promoting || !targetAcademicYearId || (statusCounts.active || 0) > 0}
                  onClick={handlePromote}
                  className="bg-navy-900 hover:bg-navy-800 text-white"
                >
                  {promoting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Promote Students
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Generate TC Dialog */}
      <Dialog open={generateTcOpen} onOpenChange={setGenerateTcOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
                <FileSignature className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <DialogTitle>Generate Transfer Certificate</DialogTitle>
                <p className="text-xs text-gray-500 mt-0.5">
                  {tcTargetStudent
                    ? `For ${tcTargetStudent.full_name} (${tcTargetStudent.admission_no})`
                    : ""}
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-300">
              A PDF TC will be generated, uploaded to the public Transfer
              Certificates page, and this student&apos;s record will be closed
              (marked inactive &amp; enrollment terminated).
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Issue Date *</Label>
                <Input
                  type="date"
                  value={tcForm.issue_date}
                  onChange={(e) =>
                    setTcForm({ ...tcForm, issue_date: e.target.value })
                  }
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Last Attended Date *</Label>
                <Input
                  type="date"
                  value={tcForm.last_attended_date}
                  onChange={(e) =>
                    setTcForm({ ...tcForm, last_attended_date: e.target.value })
                  }
                  className="h-9"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium">Reason for Leaving *</Label>
              <Input
                placeholder="e.g. Family relocation"
                value={tcForm.reason_for_leaving}
                onChange={(e) =>
                  setTcForm({ ...tcForm, reason_for_leaving: e.target.value })
                }
                className="h-9"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium">Conduct</Label>
              <Select
                value={tcForm.conduct}
                onValueChange={(val) =>
                  setTcForm({ ...tcForm, conduct: val || "Good" })
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select conduct" />
                </SelectTrigger>
                <SelectContent>
                  {[
                    "Excellent",
                    "Very Good",
                    "Good",
                    "Satisfactory",
                    "Needs Improvement",
                  ].map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium">
                Remarks (optional)
              </Label>
              <Input
                placeholder="Any additional remarks to be printed on the TC"
                value={tcForm.remarks}
                onChange={(e) =>
                  setTcForm({ ...tcForm, remarks: e.target.value })
                }
                className="h-9"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setGenerateTcOpen(false)}
              disabled={tcSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleGenerateTc}
              disabled={tcSubmitting}
              className="bg-navy-900 hover:bg-navy-800 text-white"
            >
              {tcSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <FileSignature className="h-4 w-4 mr-2" />
                  Generate &amp; Publish TC
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Upload Dialog */}
      <StudentBulkUpload
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        onSuccess={fetchStudents}
      />

      {/* Create Portal Users Dialog */}
      <CreatePortalUsersDialog
        open={portalDialogOpen}
        onOpenChange={setPortalDialogOpen}
        type="student"
        items={filteredStudents
          .filter((s) => selectedIds.has(s.id))
          .map((s) => ({ id: s.id, name: s.full_name, email: s.email, phone: s.phone }))}
        onComplete={fetchStudents}
      />
    </div>
  );
}
