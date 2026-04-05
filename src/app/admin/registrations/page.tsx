"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  ClipboardCheck,
  Loader2,
  Search,
  CheckCircle2,
  XCircle,
  Copy,
  ShieldCheck,
} from "lucide-react";
import type { RegistrationRequest, RegistrationStatus } from "@/types";

const statusBadgeColors: Record<RegistrationStatus, string> = {
  pending: "bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400",
  approved: "bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400",
  rejected: "bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400",
};

const roleBadgeColors: Record<string, string> = {
  teacher: "bg-blue-100 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400",
  student: "bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400",
};

export default function AdminRegistrationsPage() {
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("pending");
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Reject dialog
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // Approve success dialog
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [approvedName, setApprovedName] = useState("");

  const fetchRequests = async () => {
    try {
      const res = await adminFetch("/api/erp/registrations");
      const data = await res.json();
      if (res.ok) {
        setRequests(data.data ?? []);
      }
    } catch {
      toast.error("Failed to fetch registrations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const counts = {
    all: requests.length,
    pending: requests.filter((r) => r.status === "pending").length,
    approved: requests.filter((r) => r.status === "approved").length,
    rejected: requests.filter((r) => r.status === "rejected").length,
  };

  const filteredRequests = requests.filter((r) => {
    const matchesTab = activeTab === "all" || r.status === activeTab;
    const matchesSearch =
      !search ||
      r.full_name.toLowerCase().includes(search.toLowerCase()) ||
      r.email.toLowerCase().includes(search.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const handleApprove = async (id: string, name: string) => {
    setProcessingId(id);
    try {
      const res = await adminFetch("/api/erp/registrations/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to approve registration");
        return;
      }

      toast.success("Registration approved — user account created");
      setApprovedName(name);
      setGeneratedPassword(data.generated_password);
      setApproveDialogOpen(true);
      await fetchRequests();
    } catch {
      toast.error("Failed to approve registration");
    } finally {
      setProcessingId(null);
    }
  };

  const openRejectDialog = (id: string) => {
    setRejectTargetId(id);
    setRejectReason("");
    setRejectDialogOpen(true);
  };

  const handleReject = async () => {
    if (!rejectTargetId) return;
    setProcessingId(rejectTargetId);
    setRejectDialogOpen(false);

    try {
      const res = await adminFetch("/api/erp/registrations/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rejectTargetId, reason: rejectReason || undefined }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to reject registration");
        return;
      }

      toast.success("Registration rejected");
      await fetchRequests();
    } catch {
      toast.error("Failed to reject registration");
    } finally {
      setProcessingId(null);
      setRejectTargetId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-navy-900 flex items-center justify-center">
            <ClipboardCheck className="h-4.5 w-4.5 text-gold-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="erp-page-title">Registrations</h1>
              {counts.pending > 0 && (
                <Badge variant="secondary" className="bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-xs">
                  {counts.pending} pending
                </Badge>
              )}
            </div>
            <p className="erp-page-subtitle">Review and manage registration requests</p>
          </div>
        </div>
      </div>

      <div className="erp-table-container p-6">
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-10 border-gray-200 dark:border-border focus:border-navy-900 focus:ring-navy-900/20"
            />
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList variant="line" className="mb-4">
            <TabsTrigger value="pending">
              Pending ({counts.pending})
            </TabsTrigger>
            <TabsTrigger value="approved">
              Approved ({counts.approved})
            </TabsTrigger>
            <TabsTrigger value="rejected">
              Rejected ({counts.rejected})
            </TabsTrigger>
            <TabsTrigger value="all">
              All ({counts.all})
            </TabsTrigger>
          </TabsList>

          {["pending", "approved", "rejected", "all"].map((tab) => (
            <TabsContent key={tab} value={tab}>
              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400 dark:text-gray-500" />
                </div>
              ) : filteredRequests.length === 0 ? (
                <p className="text-center py-12 text-gray-500 dark:text-gray-400">
                  No {tab === "all" ? "" : tab} registration requests found.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRequests.map((req) => (
                      <TableRow key={req.id}>
                        <TableCell className="font-medium">
                          {req.full_name}
                        </TableCell>
                        <TableCell className="text-gray-600 dark:text-gray-300">
                          {req.email}
                        </TableCell>
                        <TableCell className="text-gray-500 dark:text-gray-400">
                          {req.phone || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={roleBadgeColors[req.role]}>
                            {req.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={statusBadgeColors[req.status]}>
                            {req.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-gray-500 dark:text-gray-400">
                          {new Date(req.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {req.status === "pending" ? (
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleApprove(req.id, req.full_name)}
                                disabled={processingId === req.id}
                                className="bg-green-600 hover:bg-green-700 text-white"
                              >
                                {processingId === req.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <CheckCircle2 className="h-4 w-4 mr-1" />
                                    Approve
                                  </>
                                )}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openRejectDialog(req.id)}
                                disabled={processingId === req.id}
                                className="text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950/20"
                              >
                                <XCircle className="h-4 w-4 mr-1" />
                                Reject
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">
                              {req.reviewed_at
                                ? new Date(req.reviewed_at).toLocaleDateString()
                                : ""}
                              {req.status === "rejected" && req.rejection_reason && (
                                <span
                                  className="block text-red-400 mt-0.5 max-w-48 truncate"
                                  title={req.rejection_reason}
                                >
                                  Reason: {req.rejection_reason}
                                </span>
                              )}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* Reject Reason Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Registration</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Optionally provide a reason for rejecting this registration. The applicant will be notified via email.
            </p>
            <Input
              placeholder="Reason for rejection (optional)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="h-10"
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleReject}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Reject Registration
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Approve Success Dialog */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-green-100 dark:bg-green-950/30 flex items-center justify-center">
                <ShieldCheck className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <DialogTitle>Registration Approved</DialogTitle>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  Account created for {approvedName}
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              A welcome email with login credentials has been sent. The temporary password is also shown below for your reference:
            </p>
            <div className="flex items-center gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 p-4">
              <code className="flex-1 text-sm font-mono font-semibold text-navy-900 dark:text-white">
                {generatedPassword}
              </code>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  if (generatedPassword) {
                    navigator.clipboard.writeText(generatedPassword);
                    toast.success("Password copied");
                  }
                }}
                className="text-amber-700 hover:bg-amber-100"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              The user will be asked to set their own password on first login.
            </p>
            <DialogFooter>
              <Button
                onClick={() => {
                  setApproveDialogOpen(false);
                  setGeneratedPassword(null);
                }}
                className="bg-navy-900 hover:bg-navy-800 text-white"
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
