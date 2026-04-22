"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
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
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, Search, CreditCard, Banknote } from "lucide-react";
import { adminApi } from "@/lib/admin-api";
import type { FeeStructure, FeePayment, Student, Stream } from "@/types";

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

const STREAM_CLASSES = ["XI", "XII"];

const FEE_TYPES = ["Tuition", "Transport", "Lab", "Annual", "Other"];
const FREQUENCIES = ["monthly", "quarterly", "annual", "one_time"] as const;
const PAYMENT_METHODS = [
  "cash",
  "online",
  "cheque",
  "bank_transfer",
] as const;

const EMPTY_STRUCTURE = {
  class_name: CLASS_NAMES[0],
  stream_id: "" as string,
  fee_type: FEE_TYPES[0],
  amount: "",
  frequency: "monthly" as (typeof FREQUENCIES)[number],
  due_date: "",
};

export default function AdminFeesPage() {
  const supabase = createClient();

  // Fee structures state
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);
  const [structuresLoading, setStructuresLoading] = useState(true);
  const [classFilter, setClassFilter] = useState("");
  const [streams, setStreams] = useState<Stream[]>([]);
  const [structureDialogOpen, setStructureDialogOpen] = useState(false);
  const [structureDialogMode, setStructureDialogMode] = useState<"add" | "edit">("add");
  const [editingStructureId, setEditingStructureId] = useState<string | null>(null);
  const [structureSubmitting, setStructureSubmitting] = useState(false);
  const [structureForm, setStructureForm] = useState(EMPTY_STRUCTURE);

  // Payments state
  const [studentSearch, setStudentSearch] = useState("");
  const [studentResults, setStudentResults] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [selectedStudentStreamId, setSelectedStudentStreamId] = useState<
    string | null
  >(null);
  const [studentFeeStructures, setStudentFeeStructures] = useState<
    FeeStructure[]
  >([]);
  const [studentPayments, setStudentPayments] = useState<
    (FeePayment & { fee_structure?: FeeStructure })[]
  >([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [newPayment, setNewPayment] = useState({
    fee_structure_id: "",
    amount_paid: "",
    payment_method: "cash" as (typeof PAYMENT_METHODS)[number],
    month: "",
  });

  // Academic year
  const [academicYearId, setAcademicYearId] = useState("");

  const fetchAcademicYear = useCallback(async () => {
    const { data } = await supabase
      .from("academic_years")
      .select("id")
      .eq("is_current", true)
      .single();
    if (data) setAcademicYearId(data.id);
  }, [supabase]);

  const fetchStreams = useCallback(async () => {
    const { data } = await supabase
      .from("streams")
      .select("*")
      .eq("is_active", true)
      .order("sort_order");
    setStreams((data as Stream[]) ?? []);
  }, [supabase]);

  const fetchFeeStructures = useCallback(async () => {
    let query = supabase
      .from("fee_structures")
      .select("*")
      .order("class_name", { ascending: true });

    if (classFilter) {
      query = query.eq("class_name", classFilter);
    }

    const { data, error } = await query;
    if (error) {
      toast.error("Failed to fetch fee structures");
      return;
    }
    setFeeStructures((data as FeeStructure[]) ?? []);
    setStructuresLoading(false);
  }, [supabase, classFilter]);

  useEffect(() => {
    fetchAcademicYear();
    fetchStreams();
  }, [fetchAcademicYear, fetchStreams]);

  useEffect(() => {
    fetchFeeStructures();
  }, [fetchFeeStructures]);

  const streamById = useMemo(() => {
    const map: Record<string, string> = {};
    streams.forEach((s) => {
      map[s.id] = s.code ? `${s.name} (${s.code})` : s.name;
    });
    return map;
  }, [streams]);

  // Search students (from students table, not profiles)
  const searchStudents = async (query: string) => {
    setStudentSearch(query);
    if (query.length < 2) {
      setStudentResults([]);
      return;
    }

    const { data } = await supabase
      .from("students")
      .select("*")
      .eq("is_active", true)
      .ilike("full_name", `%${query}%`)
      .limit(10);

    setStudentResults((data as Student[]) ?? []);
  };

  // Select a student and load their data
  const selectStudent = async (student: Student) => {
    setSelectedStudent(student);
    setStudentResults([]);
    setStudentSearch(student.full_name);
    setPaymentsLoading(true);

    // Get active enrollment to determine class + stream
    const { data: enrollment } = await supabase
      .from("student_enrollments")
      .select("class_id, stream_id, classes(name)")
      .eq("student_id", student.id)
      .order("enrollment_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const className =
      (enrollment?.classes as unknown as { name: string })?.name ?? "";
    const streamId = enrollment?.stream_id ?? null;
    setSelectedStudentStreamId(streamId);

    // Fetch fee structures for student's class. Filter by stream:
    //  - rows with stream_id IS NULL always apply
    //  - rows with matching stream_id apply
    if (className) {
      let query = supabase
        .from("fee_structures")
        .select("*")
        .eq("class_name", className);

      if (streamId) {
        query = query.or(`stream_id.is.null,stream_id.eq.${streamId}`);
      } else {
        query = query.is("stream_id", null);
      }

      const { data: structures } = await query;
      setStudentFeeStructures((structures as FeeStructure[]) ?? []);
    } else {
      setStudentFeeStructures([]);
    }

    // Fetch payment history
    const { data: payments } = await supabase
      .from("fee_payments")
      .select("*, fee_structure:fee_structures(*)")
      .eq("student_id", student.id)
      .order("payment_date", { ascending: false });

    setStudentPayments(
      (payments as (FeePayment & { fee_structure?: FeeStructure })[]) ?? []
    );
    setPaymentsLoading(false);
  };

  const openAddStructure = () => {
    setStructureDialogMode("add");
    setEditingStructureId(null);
    setStructureForm({
      ...EMPTY_STRUCTURE,
      class_name: classFilter || CLASS_NAMES[0],
    });
    setStructureDialogOpen(true);
  };

  const openEditStructure = (fs: FeeStructure) => {
    setStructureDialogMode("edit");
    setEditingStructureId(fs.id);
    setStructureForm({
      class_name: fs.class_name,
      stream_id: fs.stream_id ?? "",
      fee_type: fs.fee_type,
      amount: String(fs.amount),
      frequency: fs.frequency,
      due_date: fs.due_date ?? "",
    });
    setStructureDialogOpen(true);
  };

  const supportsStream = STREAM_CLASSES.includes(structureForm.class_name);

  // Save fee structure (add or edit)
  const handleSaveStructure = async () => {
    if (!academicYearId) {
      toast.error("No current academic year found");
      return;
    }
    const amount = parseFloat(structureForm.amount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    setStructureSubmitting(true);

    const data: Record<string, unknown> = {
      academic_year_id: academicYearId,
      class_name: structureForm.class_name,
      fee_type: structureForm.fee_type,
      amount,
      frequency: structureForm.frequency,
      due_date: structureForm.due_date || null,
      stream_id: supportsStream ? (structureForm.stream_id || null) : null,
    };

    const result = editingStructureId
      ? await adminApi({
          action: "update",
          table: "fee_structures",
          data,
          match: { column: "id", value: editingStructureId },
        })
      : await adminApi({
          action: "insert",
          table: "fee_structures",
          data,
        });

    if (!result.success) {
      toast.error(
        `Failed to ${editingStructureId ? "update" : "add"} fee structure: ${result.error}`
      );
    } else {
      toast.success(editingStructureId ? "Fee structure updated" : "Fee structure added");
      setStructureDialogOpen(false);
      setStructureForm(EMPTY_STRUCTURE);
      setEditingStructureId(null);
      fetchFeeStructures();
    }
    setStructureSubmitting(false);
  };

  // Delete fee structure
  const handleDeleteStructure = async (id: string) => {
    if (!confirm("Delete this fee structure? This cannot be undone.")) return;

    const result = await adminApi({
      action: "delete",
      table: "fee_structures",
      match: { column: "id", value: id },
    });

    if (!result.success) {
      toast.error(`Failed to delete: ${result.error}`);
      return;
    }
    toast.success("Fee structure deleted");
    fetchFeeStructures();
  };

  // Record payment
  const handleRecordPayment = async () => {
    if (!selectedStudent) return;

    const amount = parseFloat(newPayment.amount_paid);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    if (!newPayment.fee_structure_id) {
      toast.error("Please select a fee structure");
      return;
    }

    setPaymentSubmitting(true);
    const res = await fetch("/api/erp/fees/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: selectedStudent.id,
        fee_structure_id: newPayment.fee_structure_id,
        amount_paid: amount,
        payment_method: newPayment.payment_method,
        month: newPayment.month || "",
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Failed to record payment");
    } else {
      toast.success(`Payment recorded. Receipt: ${data.payment.receipt_number}`);
      setRecordPaymentOpen(false);
      setNewPayment({
        fee_structure_id: "",
        amount_paid: "",
        payment_method: "cash",
        month: "",
      });
      // Refresh payments
      selectStudent(selectedStudent);
    }
    setPaymentSubmitting(false);
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return (
          <Badge className="bg-green-100 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800">
            Paid
          </Badge>
        );
      case "partial":
        return (
          <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-950/30 dark:text-yellow-400 dark:border-yellow-800">
            Partial
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="destructive">Pending</Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-navy-900 dark:text-white mb-6">
        Fee Management
      </h1>

      <Tabs defaultValue="structures">
        <TabsList>
          <TabsTrigger value="structures">Fee Structures</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>

        {/* Tab 1: Fee Structures */}
        <TabsContent value="structures">
          <Card className="bg-white dark:bg-card rounded-2xl shadow-sm mt-4">
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <select
                    value={classFilter}
                    onChange={(e) => setClassFilter(e.target.value)}
                    className="rounded-md border border-gray-300 dark:border-border px-3 py-2 text-sm dark:bg-muted"
                  >
                    <option value="">All Classes</option>
                    {CLASS_NAMES.map((cn) => (
                      <option key={cn} value={cn}>
                        {cn}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  className="bg-navy-900 hover:bg-navy-800 text-white"
                  onClick={openAddStructure}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Fee Structure
                </Button>
              </div>

              {structuresLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-navy-900 dark:text-white" />
                </div>
              ) : feeStructures.length === 0 ? (
                <p className="text-center py-12 text-gray-500 dark:text-gray-400">
                  No fee structures found.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Class</TableHead>
                      <TableHead>Stream</TableHead>
                      <TableHead>Fee Type</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Frequency</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead className="w-24 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {feeStructures.map((fs) => (
                      <TableRow key={fs.id}>
                        <TableCell className="font-medium">
                          {fs.class_name}
                        </TableCell>
                        <TableCell className="text-gray-600 dark:text-gray-300">
                          {fs.stream_id ? streamById[fs.stream_id] ?? "—" : "All streams"}
                        </TableCell>
                        <TableCell>{fs.fee_type}</TableCell>
                        <TableCell>
                          {new Intl.NumberFormat("en-IN", {
                            style: "currency",
                            currency: "INR",
                            maximumFractionDigits: 0,
                          }).format(fs.amount)}
                        </TableCell>
                        <TableCell className="capitalize">
                          {fs.frequency.replace("_", " ")}
                        </TableCell>
                        <TableCell>{fs.due_date ?? "--"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEditStructure(fs)}
                              className="text-blue-500 hover:text-blue-700 p-1"
                              aria-label="Edit fee structure"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteStructure(fs.id)}
                              className="text-red-500 hover:text-red-700 p-1"
                              aria-label="Delete fee structure"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Payments */}
        <TabsContent value="payments">
          <Card className="bg-white dark:bg-card rounded-2xl shadow-sm mt-4">
            <CardContent>
              {/* Student search */}
              <div className="relative mb-6">
                <Label className="mb-2 block text-sm font-medium text-navy-900 dark:text-white">
                  Search Student
                </Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
                  <Input
                    placeholder="Search by student name..."
                    value={studentSearch}
                    onChange={(e) => searchStudents(e.target.value)}
                    className="pl-10"
                  />
                </div>
                {studentResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white dark:bg-card border border-gray-200 dark:border-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {studentResults.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => selectStudent(s)}
                        className="w-full text-left px-4 py-2 hover:bg-gray-50 dark:hover:bg-muted text-sm"
                      >
                        <span className="font-medium">{s.full_name}</span>
                        <span className="text-gray-400 dark:text-gray-500 ml-2">{s.admission_no}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedStudent && (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-heading text-lg font-semibold text-navy-900 dark:text-white">
                        {selectedStudent.full_name}
                      </h3>
                      {selectedStudentStreamId && streamById[selectedStudentStreamId] && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          Stream: {streamById[selectedStudentStreamId]}
                        </p>
                      )}
                    </div>
                    <Button
                      className="bg-gold-500 hover:bg-gold-600 text-navy-900"
                      onClick={() => setRecordPaymentOpen(true)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Record Payment
                    </Button>
                  </div>

                  {/* Fee structures for student's class */}
                  {studentFeeStructures.length > 0 && (
                    <div className="mb-6">
                      <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                        Applicable Fee Structures
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {studentFeeStructures.map((fs) => (
                          <div
                            key={fs.id}
                            className="border border-gray-200 dark:border-border rounded-lg p-3"
                          >
                            <p className="font-medium text-sm">
                              {fs.fee_type}
                            </p>
                            <p className="text-lg font-bold text-navy-900 dark:text-white">
                              {new Intl.NumberFormat("en-IN", {
                                style: "currency",
                                currency: "INR",
                                maximumFractionDigits: 0,
                              }).format(fs.amount)}
                            </p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 capitalize">
                              {fs.frequency.replace("_", " ")}
                              {fs.stream_id && streamById[fs.stream_id]
                                ? ` • ${streamById[fs.stream_id]}`
                                : ""}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Payment history */}
                  <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                    Payment History
                  </h4>
                  {paymentsLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-navy-900 dark:text-white" />
                    </div>
                  ) : studentPayments.length === 0 ? (
                    <p className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
                      No payments recorded yet.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Method</TableHead>
                          <TableHead>Receipt</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {studentPayments.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell>{p.payment_date}</TableCell>
                            <TableCell>
                              {p.fee_structure?.fee_type ?? "--"}
                            </TableCell>
                            <TableCell>
                              {new Intl.NumberFormat("en-IN", {
                                style: "currency",
                                currency: "INR",
                                maximumFractionDigits: 0,
                              }).format(p.amount_paid)}
                            </TableCell>
                            <TableCell className="capitalize">
                              {p.payment_method?.replace("_", " ") ?? "--"}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {p.receipt_number ?? "--"}
                            </TableCell>
                            <TableCell>{statusBadge(p.status)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </>
              )}

              {!selectedStudent && (
                <p className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
                  Search and select a student to view fee details.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Fee Structure Dialog */}
      <Dialog open={structureDialogOpen} onOpenChange={setStructureDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
                <CreditCard className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <DialogTitle>
                  {structureDialogMode === "edit"
                    ? "Edit Fee Structure"
                    : "Add Fee Structure"}
                </DialogTitle>
                <p className="text-xs text-gray-500 mt-0.5">
                  {structureDialogMode === "edit"
                    ? "Update the fee for this class"
                    : "Define fees for a class"}
                </p>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Class</Label>
                <select
                  value={structureForm.class_name}
                  onChange={(e) =>
                    setStructureForm({
                      ...structureForm,
                      class_name: e.target.value,
                      stream_id: STREAM_CLASSES.includes(e.target.value)
                        ? structureForm.stream_id
                        : "",
                    })
                  }
                  className="w-full h-9 rounded-lg border border-gray-200 dark:border-border px-3 text-sm bg-white dark:bg-muted focus:border-navy-900 focus:ring-1 focus:ring-navy-900 outline-none transition-colors"
                >
                  {CLASS_NAMES.map((cn) => (
                    <option key={cn} value={cn}>
                      {cn}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Fee Type</Label>
                <select
                  value={structureForm.fee_type}
                  onChange={(e) =>
                    setStructureForm({ ...structureForm, fee_type: e.target.value })
                  }
                  className="w-full h-9 rounded-lg border border-gray-200 dark:border-border px-3 text-sm bg-white dark:bg-muted focus:border-navy-900 focus:ring-1 focus:ring-navy-900 outline-none transition-colors"
                >
                  {FEE_TYPES.map((ft) => (
                    <option key={ft} value={ft}>
                      {ft}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {supportsStream && (
              <div className="space-y-1">
                <Label className="text-xs font-medium">Stream (optional)</Label>
                <select
                  value={structureForm.stream_id}
                  onChange={(e) =>
                    setStructureForm({ ...structureForm, stream_id: e.target.value })
                  }
                  className="w-full h-9 rounded-lg border border-gray-200 dark:border-border px-3 text-sm bg-white dark:bg-muted focus:border-navy-900 focus:ring-1 focus:ring-navy-900 outline-none transition-colors"
                >
                  <option value="">All streams (applies to everyone)</option>
                  {streams.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.code ? ` (${s.code})` : ""}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Leave blank to apply the same fee to every stream in this class.
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Amount</Label>
                <Input
                  className="h-9"
                  type="number"
                  placeholder="Enter amount"
                  value={structureForm.amount}
                  onChange={(e) =>
                    setStructureForm({ ...structureForm, amount: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Frequency</Label>
                <select
                  value={structureForm.frequency}
                  onChange={(e) =>
                    setStructureForm({
                      ...structureForm,
                      frequency: e.target.value as (typeof FREQUENCIES)[number],
                    })
                  }
                  className="w-full h-9 rounded-lg border border-gray-200 dark:border-border px-3 text-sm bg-white dark:bg-muted focus:border-navy-900 focus:ring-1 focus:ring-navy-900 outline-none transition-colors"
                >
                  {FREQUENCIES.map((f) => (
                    <option key={f} value={f}>
                      {f.charAt(0).toUpperCase() + f.slice(1).replace("_", " ")}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Due Date (optional)</Label>
              <Input
                className="h-9"
                type="date"
                value={structureForm.due_date}
                onChange={(e) =>
                  setStructureForm({ ...structureForm, due_date: e.target.value })
                }
              />
            </div>
            <Button
              onClick={handleSaveStructure}
              disabled={structureSubmitting}
              className="w-full h-10 rounded-xl font-medium bg-navy-900 hover:bg-navy-800 text-white"
            >
              {structureSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : structureDialogMode === "edit" ? (
                "Save Changes"
              ) : (
                "Add Fee Structure"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Record Payment Dialog */}
      <Dialog open={recordPaymentOpen} onOpenChange={setRecordPaymentOpen}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10">
                <Banknote className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <DialogTitle>Record Payment</DialogTitle>
                <p className="text-xs text-gray-500 mt-0.5">Log a fee payment from a student</p>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs font-medium">Fee Structure</Label>
              <select
                value={newPayment.fee_structure_id}
                onChange={(e) =>
                  setNewPayment({
                    ...newPayment,
                    fee_structure_id: e.target.value,
                  })
                }
                className="w-full h-9 rounded-lg border border-gray-200 dark:border-border px-3 text-sm bg-white dark:bg-muted focus:border-navy-900 focus:ring-1 focus:ring-navy-900 outline-none transition-colors"
              >
                <option value="">Select fee type</option>
                {studentFeeStructures.map((fs) => (
                  <option key={fs.id} value={fs.id}>
                    {fs.fee_type} -{" "}
                    {new Intl.NumberFormat("en-IN", {
                      style: "currency",
                      currency: "INR",
                      maximumFractionDigits: 0,
                    }).format(fs.amount)}
                    {fs.stream_id && streamById[fs.stream_id]
                      ? ` (${streamById[fs.stream_id]})`
                      : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Amount</Label>
                <Input
                  className="h-9"
                  type="number"
                  placeholder="Enter amount"
                  value={newPayment.amount_paid}
                  onChange={(e) =>
                    setNewPayment({ ...newPayment, amount_paid: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Payment Method</Label>
                <select
                  value={newPayment.payment_method}
                  onChange={(e) =>
                    setNewPayment({
                      ...newPayment,
                      payment_method: e.target.value as (typeof PAYMENT_METHODS)[number],
                    })
                  }
                  className="w-full h-9 rounded-lg border border-gray-200 dark:border-border px-3 text-sm bg-white dark:bg-muted focus:border-navy-900 focus:ring-1 focus:ring-navy-900 outline-none transition-colors"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m.charAt(0).toUpperCase() + m.slice(1).replace("_", " ")}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Month (optional)</Label>
              <Input
                className="h-9"
                type="month"
                value={newPayment.month}
                onChange={(e) =>
                  setNewPayment({ ...newPayment, month: e.target.value })
                }
              />
            </div>
            <Button
              onClick={handleRecordPayment}
              disabled={paymentSubmitting}
              className="w-full h-10 rounded-xl font-medium bg-navy-900 hover:bg-navy-800 text-white"
            >
              {paymentSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Recording...
                </>
              ) : (
                "Record Payment"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
