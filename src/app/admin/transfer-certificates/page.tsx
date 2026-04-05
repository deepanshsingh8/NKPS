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
import { Plus, Download, Trash2, Loader2, Search, UserCheck } from "lucide-react";
import { adminUpload, adminDelete } from "@/lib/admin-api";
import type { TransferCertificate, Student } from "@/types";

export default function AdminTransferCertificatesPage() {
  const [certificates, setCertificates] = useState<TransferCertificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [admissionNo, setAdmissionNo] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Student search for linking
  const [studentSearch, setStudentSearch] = useState("");
  const [studentResults, setStudentResults] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [searchingStudents, setSearchingStudents] = useState(false);

  const supabase = createClient();

  const searchStudents = useCallback(async (query: string) => {
    if (query.length < 2) {
      setStudentResults([]);
      return;
    }
    setSearchingStudents(true);
    const { data } = await supabase
      .from("students")
      .select("*")
      .or(`full_name.ilike.%${query}%,admission_no.ilike.%${query}%`)
      .eq("is_active", true)
      .order("full_name")
      .limit(10);
    setStudentResults((data as Student[]) ?? []);
    setSearchingStudents(false);
  }, [supabase]);

  const selectStudent = (student: Student) => {
    setSelectedStudent(student);
    setStudentName(student.full_name);
    setAdmissionNo(student.admission_no);
    setStudentSearch("");
    setStudentResults([]);
  };

  const clearSelectedStudent = () => {
    setSelectedStudent(null);
    setStudentName("");
    setAdmissionNo("");
  };

  const fetchCertificates = async () => {
    const { data, error } = await supabase
      .from("transfer_certificates")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to fetch certificates");
      return;
    }

    setCertificates((data as TransferCertificate[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchCertificates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUpload = async () => {
    if (!file) {
      toast.error("Please select a PDF file");
      return;
    }
    if (!studentName.trim()) {
      toast.error("Please enter the student name");
      return;
    }
    if (!academicYear.trim()) {
      toast.error("Please enter the academic year");
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("studentName", studentName.trim());
      formData.append("academicYear", academicYear.trim());
      if (admissionNo.trim()) {
        formData.append("admissionNo", admissionNo.trim());
      }

      const res = await adminUpload("/api/transfer-certificates", formData);

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Upload failed");
        return;
      }

      toast.success("Transfer certificate uploaded successfully");
      setDialogOpen(false);
      setStudentName("");
      setAdmissionNo("");
      setFile(null);
      setSelectedStudent(null);
      fetchCertificates();
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (tc: TransferCertificate) => {
    if (!confirm(`Delete TC for "${tc.student_name}"? This cannot be undone.`))
      return;

    try {
      const res = await adminDelete("/api/transfer-certificates", { id: tc.id, fileUrl: tc.file_url });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Delete failed");
        return;
      }

      toast.success("Transfer certificate deleted");
      fetchCertificates();
    } catch {
      toast.error("An unexpected error occurred");
    }
  };

  const filtered = certificates.filter((tc) => {
    const q = searchQuery.toLowerCase();
    return (
      tc.student_name.toLowerCase().includes(q) ||
      (tc.admission_no && tc.admission_no.toLowerCase().includes(q))
    );
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl font-bold text-navy-900">
          Transfer Certificates
        </h1>

        <Button className="bg-navy-900 hover:bg-navy-800 text-white" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Upload TC
        </Button>

      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload Transfer Certificate</DialogTitle>
          </DialogHeader>
            <div className="space-y-4 mt-4">
              {/* Student Search */}
              <div className="space-y-2">
                <Label>Link to Student (search by name or admission no)</Label>
                {selectedStudent ? (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200">
                    <UserCheck className="h-4 w-4 text-green-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-green-800 truncate">
                        {selectedStudent.full_name}
                      </p>
                      <p className="text-xs text-green-600">
                        Adm No: {selectedStudent.admission_no}
                        {selectedStudent.father_name && ` | Father: ${selectedStudent.father_name}`}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={clearSelectedStudent}
                      className="text-green-600 hover:text-red-600 h-7 px-2"
                    >
                      Change
                    </Button>
                  </div>
                ) : (
                  <div className="relative">
                    <Input
                      placeholder="Type student name or admission no..."
                      value={studentSearch}
                      onChange={(e) => {
                        setStudentSearch(e.target.value);
                        searchStudents(e.target.value);
                      }}
                    />
                    {searchingStudents && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
                    )}
                    {studentResults.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {studentResults.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => selectStudent(s)}
                            className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b border-gray-100 last:border-0"
                          >
                            <span className="font-medium">{s.full_name}</span>
                            <span className="text-gray-500 ml-2">({s.admission_no})</span>
                            {s.father_name && (
                              <span className="text-gray-400 ml-1 text-xs">- {s.father_name}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <p className="text-xs text-gray-400">
                  Or fill in manually below if the student is not in the system
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="student-name">Student Name *</Label>
                  <Input
                    id="student-name"
                    placeholder="Enter student name"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    disabled={!!selectedStudent}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admission-no">Admission No</Label>
                  <Input
                    id="admission-no"
                    placeholder="e.g., 1001"
                    value={admissionNo}
                    onChange={(e) => setAdmissionNo(e.target.value)}
                    disabled={!!selectedStudent}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="academic-year">Academic Year *</Label>
                <Input
                  id="academic-year"
                  placeholder="e.g., 2024-25"
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tc-file">PDF File *</Label>
                <Input
                  id="tc-file"
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <Button
                onClick={handleUpload}
                disabled={uploading}
                className="w-full bg-navy-900 hover:bg-navy-800 text-white"
              >
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  "Upload"
                )}
              </Button>
            </div>
        </DialogContent>
      </Dialog>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search by name or admission no..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="erp-table-container overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {searchQuery
              ? "No certificates match your search."
              : "No transfer certificates uploaded yet."}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student Name</TableHead>
                <TableHead>Admission No</TableHead>
                <TableHead>Academic Year</TableHead>
                <TableHead>Upload Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((tc) => (
                <TableRow key={tc.id}>
                  <TableCell className="font-medium">
                    {tc.student_name}
                  </TableCell>
                  <TableCell className="text-gray-600">
                    {tc.admission_no || "—"}
                  </TableCell>
                  <TableCell>{tc.academic_year}</TableCell>
                  <TableCell>
                    {new Date(tc.upload_date).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <a
                        href={tc.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-gray-100 transition-colors"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(tc)}
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
    </div>
  );
}
