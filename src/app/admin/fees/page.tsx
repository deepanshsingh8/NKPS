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
import { Plus, Trash2, Loader2, Search } from "lucide-react";
import { adminApi } from "@/lib/admin-api";
import type { FeeStructure, FeePayment, Profile } from "@/types";

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

const FEE_TYPES = ["Tuition", "Transport", "Lab", "Annual", "Other"];
const FREQUENCIES = ["monthly", "quarterly", "annual", "one_time"] as const;
const PAYMENT_METHODS = [
  "cash",
  "online",
  "cheque",
  "bank_transfer",
] as const;

export default function AdminFeesPage() {
  const supabase = createClient();

  // Fee structures state
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);
  const [structuresLoading, setStructuresLoading] = useState(true);
  const [classFilter, setClassFilter] = useState("");
  const [addStructureOpen, setAddStructureOpen] = useState(false);
  const [structureSubmitting, setStructureSubmitting] = useState(false);
  const [newStructure, setNewStructure] = useState({
    class_name: CLASS_NAMES[0],
    fee_type: FEE_TYPES[0],
    amount: "",
    frequency: "monthly" as (typeof FREQUENCIES)[number],
    due_date: "",
  });

  // Payments state
  const [studentSearch, setStudentSearch] = useState("");
  const [studentResults, setStudentResults] = useState<Profile[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Profile | null>(null);
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
  }, [fetchAcademicYear]);

  useEffect(() => {
    fetchFeeStructures();
  }, [fetchFeeStructures]);

  // Search students
  const searchStudents = async (query: string) => {
    setStudentSearch(query);
    if (query.length < 2) {
      setStudentResults([]);
      return;
    }

    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("role", "student")
      .ilike("full_name", `%${query}%`)
      .limit(10);

    setStudentResults((data as Profile[]) ?? []);
  };

  // Select a student and load their data
  const selectStudent = async (student: Profile) => {
    setSelectedStudent(student);
    setStudentResults([]);
    setStudentSearch(student.full_name);
    setPaymentsLoading(true);

    // Get enrollment to determine class
    const { data: enrollment } = await supabase
      .from("student_enrollments")
      .select("class_id, classes(name)")
      .eq("student_id", student.id)
      .limit(1)
      .single();

    const className =
      (enrollment?.classes as unknown as { name: string })?.name ?? "";

    // Fetch fee structures for student's class
    if (className) {
      const { data: structures } = await supabase
        .from("fee_structures")
        .select("*")
        .eq("class_name", className);
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

  // Add fee structure
  const handleAddStructure = async () => {
    if (!academicYearId) {
      toast.error("No current academic year found");
      return;
    }
    const amount = parseFloat(newStructure.amount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    setStructureSubmitting(true);
    const result = await adminApi({
      action: "insert",
      table: "fee_structures",
      data: {
        academic_year_id: academicYearId,
        class_name: newStructure.class_name,
        fee_type: newStructure.fee_type,
        amount,
        frequency: newStructure.frequency,
        due_date: newStructure.due_date || null,
      },
    });

    if (!result.success) {
      toast.error(`Failed to add fee structure: ${result.error}`);
    } else {
      toast.success("Fee structure added");
      setAddStructureOpen(false);
      setNewStructure({
        class_name: CLASS_NAMES[0],
        fee_type: FEE_TYPES[0],
        amount: "",
        frequency: "monthly",
        due_date: "",
      });
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
          <Badge className="bg-green-100 text-green-700 border-green-200">
            Paid
          </Badge>
        );
      case "partial":
        return (
          <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">
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
      <h1 className="font-heading text-2xl font-bold text-navy-900 mb-6">
        Fee Management
      </h1>

      <Tabs defaultValue="structures">
        <TabsList>
          <TabsTrigger value="structures">Fee Structures</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>

        {/* Tab 1: Fee Structures */}
        <TabsContent value="structures">
          <Card className="bg-white rounded-2xl shadow-sm mt-4">
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <select
                    value={classFilter}
                    onChange={(e) => setClassFilter(e.target.value)}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm"
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
                  onClick={() => setAddStructureOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Fee Structure
                </Button>
              </div>

              {structuresLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-navy-900" />
                </div>
              ) : feeStructures.length === 0 ? (
                <p className="text-center py-12 text-gray-500">
                  No fee structures found.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Class</TableHead>
                      <TableHead>Fee Type</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Frequency</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {feeStructures.map((fs) => (
                      <TableRow key={fs.id}>
                        <TableCell className="font-medium">
                          {fs.class_name}
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
                        <TableCell>
                          <button
                            onClick={() => handleDeleteStructure(fs.id)}
                            className="text-red-500 hover:text-red-700 p-1"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
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
          <Card className="bg-white rounded-2xl shadow-sm mt-4">
            <CardContent>
              {/* Student search */}
              <div className="relative mb-6">
                <Label className="mb-2 block text-sm font-medium text-navy-900">
                  Search Student
                </Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search by student name..."
                    value={studentSearch}
                    onChange={(e) => searchStudents(e.target.value)}
                    className="pl-10"
                  />
                </div>
                {studentResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {studentResults.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => selectStudent(s)}
                        className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm"
                      >
                        <span className="font-medium">{s.full_name}</span>
                        <span className="text-gray-400 ml-2">{s.email}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedStudent && (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-heading text-lg font-semibold text-navy-900">
                      {selectedStudent.full_name}
                    </h3>
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
                      <h4 className="text-sm font-medium text-gray-500 mb-2">
                        Applicable Fee Structures
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {studentFeeStructures.map((fs) => (
                          <div
                            key={fs.id}
                            className="border border-gray-200 rounded-lg p-3"
                          >
                            <p className="font-medium text-sm">
                              {fs.fee_type}
                            </p>
                            <p className="text-lg font-bold text-navy-900">
                              {new Intl.NumberFormat("en-IN", {
                                style: "currency",
                                currency: "INR",
                                maximumFractionDigits: 0,
                              }).format(fs.amount)}
                            </p>
                            <p className="text-xs text-gray-400 capitalize">
                              {fs.frequency.replace("_", " ")}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Payment history */}
                  <h4 className="text-sm font-medium text-gray-500 mb-2">
                    Payment History
                  </h4>
                  {paymentsLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-navy-900" />
                    </div>
                  ) : studentPayments.length === 0 ? (
                    <p className="text-center py-8 text-gray-400 text-sm">
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
                <p className="text-center py-12 text-gray-400 text-sm">
                  Search and select a student to view fee details.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Fee Structure Dialog */}
      <Dialog open={addStructureOpen} onOpenChange={setAddStructureOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Fee Structure</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Class</Label>
              <select
                value={newStructure.class_name}
                onChange={(e) =>
                  setNewStructure({ ...newStructure, class_name: e.target.value })
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                {CLASS_NAMES.map((cn) => (
                  <option key={cn} value={cn}>
                    {cn}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Fee Type</Label>
              <select
                value={newStructure.fee_type}
                onChange={(e) =>
                  setNewStructure({ ...newStructure, fee_type: e.target.value })
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                {FEE_TYPES.map((ft) => (
                  <option key={ft} value={ft}>
                    {ft}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input
                type="number"
                placeholder="Enter amount"
                value={newStructure.amount}
                onChange={(e) =>
                  setNewStructure({ ...newStructure, amount: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Frequency</Label>
              <select
                value={newStructure.frequency}
                onChange={(e) =>
                  setNewStructure({
                    ...newStructure,
                    frequency: e.target.value as (typeof FREQUENCIES)[number],
                  })
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                {FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {f.charAt(0).toUpperCase() + f.slice(1).replace("_", " ")}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Due Date (optional)</Label>
              <Input
                type="date"
                value={newStructure.due_date}
                onChange={(e) =>
                  setNewStructure({ ...newStructure, due_date: e.target.value })
                }
              />
            </div>
            <Button
              onClick={handleAddStructure}
              disabled={structureSubmitting}
              className="w-full bg-navy-900 hover:bg-navy-800 text-white"
            >
              {structureSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
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
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Fee Structure</Label>
              <select
                value={newPayment.fee_structure_id}
                onChange={(e) =>
                  setNewPayment({
                    ...newPayment,
                    fee_structure_id: e.target.value,
                  })
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
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
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input
                type="number"
                placeholder="Enter amount"
                value={newPayment.amount_paid}
                onChange={(e) =>
                  setNewPayment({ ...newPayment, amount_paid: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <select
                value={newPayment.payment_method}
                onChange={(e) =>
                  setNewPayment({
                    ...newPayment,
                    payment_method: e.target.value as (typeof PAYMENT_METHODS)[number],
                  })
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m.charAt(0).toUpperCase() + m.slice(1).replace("_", " ")}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Month (optional)</Label>
              <Input
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
              className="w-full bg-navy-900 hover:bg-navy-800 text-white"
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
