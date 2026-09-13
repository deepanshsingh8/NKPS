"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { adminFetch, fetchRowDependencies } from "@nkps/shared/lib/admin-api";
import {
  pluralise,
  type DependencyReport,
} from "@nkps/shared/lib/row-dependencies";
import { Button } from "@nkps/shared/components/ui/button";
import { Input } from "@nkps/shared/components/ui/input";
import { Label } from "@nkps/shared/components/ui/label";
import { Badge } from "@nkps/shared/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@nkps/shared/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@nkps/shared/components/ui/table";
import { toast } from "sonner";
import {
  AlertTriangle,
  Loader2,
  Search,
  UserCheck,
  UserCog,
  UserX,
} from "lucide-react";

interface TeacherRow {
  id: string;
  employee_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  date_of_joining: string | null;
  date_of_leaving: string | null;
  leaving_reason: string | null;
  is_active: boolean;
  staff_member_id: string | null;
  specialization: string | null;
}

interface ReviewRow {
  id: string;
}

type Scope = "active" | "inactive" | "all";

const SCOPES: { value: Scope; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Retired" },
  { value: "all", label: "All" },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Teacher roster and lifecycle.
 *
 * ── Why this page exists ────────────────────────────────────────────────────
 * `teachers` is the row every teacher dropdown in the ERP reads, and until now
 * no screen could see it. People → Staff manages `staff_members`, a separate
 * row joined by `teachers.staff_member_id … ON DELETE SET NULL` — so deleting
 * someone from Staff left their teacher record behind, still active, invisible,
 * and still offered in every timetable and assignment picker. Three departed
 * teachers were reported by name before anyone realised why.
 *
 * Retiring, not deleting, is the only exit offered. Deleting a teacher who has
 * ever been timetabled fails outright (`timetable_periods.teacher_id` has no
 * ON DELETE rule), and if it succeeded it would erase the record of who taught
 * what. Retiring keeps the history and removes them from every picker.
 */
export default function TeachersPage() {
  const [rows, setRows] = useState<TeacherRow[]>([]);
  const [review, setReview] = useState<Map<string, ReviewRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<Scope>("active");
  const [search, setSearch] = useState("");
  const [onlyReview, setOnlyReview] = useState(false);

  const [target, setTarget] = useState<TeacherRow | null>(null);
  const [impact, setImpact] = useState<DependencyReport | null>(null);
  const [leavingDate, setLeavingDate] = useState(today());
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [listRes, reviewRes] = await Promise.all([
      adminFetch("/api/teachers?scope=all"),
      adminFetch("/api/teachers?scope=review"),
    ]);

    if (!listRes.ok) {
      const body = await listRes.json().catch(() => ({}));
      toast.error(body.error ?? "Failed to load teachers");
      setLoading(false);
      return;
    }
    const listBody = await listRes.json();
    setRows((listBody.data as TeacherRow[]) ?? []);

    // The review queue is a nicety, not the point of the page — if the view is
    // missing (migration 116 not applied yet) the roster still works.
    if (reviewRes.ok) {
      const reviewBody = await reviewRes.json();
      const map = new Map<string, ReviewRow>();
      for (const r of (reviewBody.data as ReviewRow[]) ?? []) map.set(r.id, r);
      setReview(map);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((t) => {
      if (scope === "active" && !t.is_active) return false;
      if (scope === "inactive" && t.is_active) return false;
      if (onlyReview && !review.has(t.id)) return false;
      if (!q) return true;
      return (
        t.full_name.toLowerCase().includes(q) ||
        t.employee_id.toLowerCase().includes(q) ||
        (t.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, scope, search, onlyReview, review]);

  const reviewCount = useMemo(
    () => rows.filter((t) => t.is_active && review.has(t.id)).length,
    [rows, review]
  );

  const openRetire = async (t: TeacherRow) => {
    setTarget(t);
    setImpact(null);
    setLeavingDate(t.date_of_leaving ?? today());
    setReason(t.leaving_reason ?? "");
    // Counted server-side on the service-role client, because several of these
    // tables are behind RLS an editor cannot read through — a policy-filtered
    // zero would read as "nothing to reassign".
    setImpact(await fetchRowDependencies("teachers", t.id));
  };

  const submit = async (isActive: boolean, t: TeacherRow) => {
    setSaving(true);
    const res = await adminFetch("/api/teachers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        isActive
          ? { id: t.id, is_active: true }
          : {
              id: t.id,
              is_active: false,
              date_of_leaving: leavingDate || undefined,
              leaving_reason: reason.trim() || undefined,
            }
      ),
    });
    setSaving(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error ?? "Failed to update teacher");
      return;
    }
    toast.success(
      isActive
        ? `${t.full_name} reinstated`
        : `${t.full_name} retired — removed from every teacher dropdown`
    );
    setTarget(null);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="erp-page-bar">
        <div className="flex items-center gap-3">
          <div className="erp-page-icon">
            <UserCog className="h-4.5 w-4.5 text-gold-400" />
          </div>
          <div>
            <h1 className="erp-page-title">Teachers</h1>
            <p className="erp-page-subtitle">
              Every teacher record the ERP can assign work to. Retire one and
              they leave every timetable and subject dropdown at once.
            </p>
          </div>
        </div>
      </div>

      {reviewCount > 0 && (
        <div className="flex flex-wrap items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/20">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1 text-sm text-amber-900 dark:text-amber-200">
            <p className="font-medium">
              {reviewCount} active {reviewCount === 1 ? "teacher" : "teachers"}{" "}
              need review
            </p>
            <p className="mt-0.5 text-amber-800/90 dark:text-amber-300/90">
              They have no staff record and no portal login — the shape left
              behind when someone is deleted from{" "}
              <Link href="/people/staff" className="underline">
                People → Staff
              </Link>
              . Check each one: retire the ones who have left, and leave anyone
              who is simply not linked to a staff entry yet.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setOnlyReview((v) => !v);
              setScope("active");
            }}
          >
            {onlyReview ? "Show all" : "Review these"}
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-gray-200 p-0.5 dark:border-border">
          {SCOPES.map((s) => (
            <button
              key={s.value}
              onClick={() => setScope(s.value)}
              className={`rounded px-3 py-1 text-sm transition-colors ${
                scope === s.value
                  ? "bg-navy-900 text-white"
                  : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-muted"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            className="pl-8"
            placeholder="Name, employee ID or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {onlyReview && (
          <Badge variant="secondary">Showing review queue only</Badge>
        )}
      </div>

      <div className="erp-table-container overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Employee ID</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-gray-400" />
                </TableCell>
              </TableRow>
            )}
            {!loading && visible.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-10 text-center text-sm text-gray-500 dark:text-gray-400"
                >
                  No teachers match this filter.
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              visible.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <div className="font-medium text-navy-900 dark:text-white">
                      {t.full_name}
                    </div>
                    {t.specialization && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {t.specialization}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{t.employee_id}</TableCell>
                  <TableCell className="text-sm text-gray-600 dark:text-gray-300">
                    <div>{t.email ?? "—"}</div>
                    <div className="text-xs text-gray-400">{t.phone ?? ""}</div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {t.date_of_joining ?? "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={t.is_active ? "default" : "secondary"}>
                        {t.is_active ? "Active" : "Retired"}
                      </Badge>
                      {t.is_active && review.has(t.id) && (
                        <Badge
                          variant="outline"
                          className="border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-300"
                        >
                          Needs review
                        </Badge>
                      )}
                      {!t.is_active && t.date_of_leaving && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          left {t.date_of_leaving}
                        </span>
                      )}
                    </div>
                    {!t.is_active && t.leaving_reason && (
                      <div className="mt-0.5 text-xs text-gray-400">
                        {t.leaving_reason}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      {t.is_active ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openRetire(t)}
                        >
                          <UserX className="mr-1.5 h-3.5 w-3.5" />
                          Retire
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={saving}
                          onClick={() => submit(true, t)}
                        >
                          <UserCheck className="mr-1.5 h-3.5 w-3.5" />
                          Reinstate
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {/* ── Retire dialog ── */}
      <Dialog
        open={target !== null}
        onOpenChange={(open) => !open && setTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Retire {target?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              They will stop appearing in every teacher dropdown — timetable,
              subject assignment, class teacher and substitutions. Nothing
              already recorded is deleted, and you can reinstate them here.
            </p>

            {impact && impact.blockingTotal > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2.5 text-sm dark:border-amber-900/40 dark:bg-amber-950/20">
                <p className="font-medium text-amber-900 dark:text-amber-200">
                  Still assigned to work
                </p>
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-amber-800/90 dark:text-amber-300/90">
                  {impact.blocking
                    .filter((d) => d.count > 0)
                    .map((d) => (
                      <li key={d.table + d.column}>
                        {d.count} {pluralise(d.label, d.count)}
                      </li>
                    ))}
                </ul>
                <p className="mt-1.5 text-xs text-amber-800/80 dark:text-amber-300/80">
                  These are kept as history. Reassign them to someone else so
                  the work has an owner.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="leaving-date" className="text-xs font-medium">
                Date of leaving
              </Label>
              <Input
                id="leaving-date"
                type="date"
                value={leavingDate}
                onChange={(e) => setLeavingDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="leaving-reason" className="text-xs font-medium">
                Reason (optional)
              </Label>
              <Input
                id="leaving-reason"
                placeholder="e.g. Resigned, transferred"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            {target?.staff_member_id && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Their linked staff entry will be deactivated too, so the public
                staff listing follows.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={saving}
              onClick={() => target && submit(false, target)}
              className="bg-navy-900 text-white hover:bg-navy-800"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Retire teacher
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
