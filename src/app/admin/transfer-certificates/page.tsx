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
import { Plus, Download, Trash2, Loader2, Search } from "lucide-react";
import type { TransferCertificate } from "@/types";

export default function AdminTransferCertificatesPage() {
  const [certificates, setCertificates] = useState<TransferCertificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const supabase = createClient();

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
      const fileName = `${Date.now()}-${studentName.replace(/\s+/g, "-").toLowerCase()}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from("transfer-certificates")
        .upload(fileName, file);

      if (uploadError) {
        toast.error(`Upload failed: ${uploadError.message}`);
        return;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("transfer-certificates").getPublicUrl(fileName);

      const { error: insertError } = await supabase
        .from("transfer_certificates")
        .insert({
          student_name: studentName,
          file_url: publicUrl,
          academic_year: academicYear,
          upload_date: new Date().toISOString().split("T")[0],
        });

      if (insertError) {
        toast.error(`Failed to save record: ${insertError.message}`);
        return;
      }

      toast.success("Transfer certificate uploaded successfully");
      setDialogOpen(false);
      setStudentName("");
      setAcademicYear("");
      setFile(null);
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

    const urlParts = tc.file_url.split("/");
    const fileName = urlParts[urlParts.length - 1];

    const { error: storageError } = await supabase.storage
      .from("transfer-certificates")
      .remove([fileName]);

    if (storageError) {
      toast.error(`Storage deletion failed: ${storageError.message}`);
    }

    const { error: dbError } = await supabase
      .from("transfer_certificates")
      .delete()
      .eq("id", tc.id);

    if (dbError) {
      toast.error(`Database deletion failed: ${dbError.message}`);
      return;
    }

    toast.success("Transfer certificate deleted");
    fetchCertificates();
  };

  const filtered = certificates.filter((tc) =>
    tc.student_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Transfer Certificate</DialogTitle>
          </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="tc-file">PDF File</Label>
                <Input
                  id="tc-file"
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="student-name">Student Name</Label>
                <Input
                  id="student-name"
                  placeholder="Enter student name"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="academic-year">Academic Year</Label>
                <Input
                  id="academic-year"
                  placeholder="e.g., 2024-25"
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
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
          placeholder="Search by student name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
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
