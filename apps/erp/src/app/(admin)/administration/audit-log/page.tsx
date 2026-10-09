"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@nkps/shared/lib/admin-api";
import { Button } from "@nkps/shared/components/ui/button";
import { Badge } from "@nkps/shared/components/ui/badge";
import { Label } from "@nkps/shared/components/ui/label";
import { NativeSelect } from "@nkps/shared/components/ui/native-select";
import { History, Inbox, Loader2 } from "lucide-react";
import { toast } from "sonner";

// Read-only view of public.audit_log (migration 134). Admin-only: the path is
// in ADMIN_ONLY_PREFIXES, the API checks verifyAdmin, and RLS agrees.

interface AuditEntry {
  id: number;
  at: string;
  actor_name: string;
  actor_role: string | null;
  action: string;
  target_table: string | null;
  target_name: string | null;
  details: Record<string, unknown> | null;
}

const CATEGORIES = [
  { value: "", label: "Everything" },
  { value: "users", label: "User accounts" },
  { value: "permissions", label: "Editor permissions" },
  { value: "registrations", label: "Registrations" },
  { value: "data", label: "Data changes" },
  { value: "messaging", label: "WhatsApp messages" },
] as const;

// Read as "<actor> <phrase> <target>"; the target is left off when it no
// longer resolves (a deleted login) or the row is a generic data write.
const ACTION_PHRASES: Record<string, string> = {
  "user.create": "created a login for",
  "user.delete": "deleted the login of",
  "user.role_change": "changed the role of",
  "user.super_admin_change": "changed the super-admin flag of",
  "user.password_reset": "reset the password of",
  "editor_permissions.change": "changed the editor permissions of",
  "registration.approve": "approved the registration of",
  "registration.reject": "rejected the registration of",
  "admin_proxy.insert": "added a record to",
  "admin_proxy.update": "edited a record in",
  "admin_proxy.delete": "deleted a record from",
  "whatsapp.bus_notice": "sent a WhatsApp notice to the families on",
  "whatsapp.fee_reminder": "sent a WhatsApp fee reminder for",
};

function describe(e: AuditEntry): { phrase: string; object: string | null } {
  const phrase = ACTION_PHRASES[e.action] ?? humanise(e.action);
  if (e.action.startsWith("admin_proxy.")) {
    return { phrase, object: e.target_table ? humanise(e.target_table) : "a table" };
  }
  if (e.target_name) return { phrase, object: e.target_name };
  // The person is gone (or was never resolvable): drop the dangling preposition.
  return { phrase: phrase.replace(/ (for|of|in|to|from)$/, "") + " (no longer on record)", object: null };
}

const DETAIL_LABELS: Record<string, string> = {
  role: "Role",
  from: "From",
  to: "To",
  columns: "Fields",
  rows: "Rows",
  granted: "Granted",
  revoked: "Revoked",
  feature_keys: "Now holds",
  editor_role: "Their role",
  email_delivered: "Email sent",
  must_change_password: "Must change password",
  password_typed_by_admin: "Password typed by admin",
  editor_permissions_cleared: "Editor permissions cleared",
  student_deleted: "Student record deleted",
  teacher_retired: "Teacher record retired",
  parent_deleted: "Parent record deleted",
  link_warning: "Needs linking",
  reason_given: "Reason given",
  via: "Via",
  match_column: "Matched on",
  recipients: "Families messaged",
  sent: "Sent",
  failed: "Failed",
  skipped: "No number on file",
  riders: "Students on the bus",
  amount: "Amount quoted (Rs.)",
  contact_type: "Sent to",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function humanise(key: string): string {
  return key.replace(/_/g, " ");
}

// Ids are kept in the log for tracing but never shown: the screen names
// people, and a bare uuid tells an office user nothing.
function formatDetail(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") return UUID_RE.test(value) ? null : humanise(value);
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    const parts = value.map(formatDetail).filter((v): v is string => Boolean(v));
    return parts.length ? parts.join(", ") : "none";
  }
  return null;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AuditLogPage() {
  const [category, setCategory] = useState("");
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = useCallback(async (cat: string, before: number | null) => {
    const params = new URLSearchParams();
    if (cat) params.set("category", cat);
    if (before) params.set("before", String(before));
    const res = await adminFetch(`/api/audit-log?${params}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error ?? "Failed to load the audit log");
      return null;
    }
    return body as { entries: AuditEntry[]; next_before: number | null };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchPage(category, null).then((page) => {
      if (cancelled) return;
      setEntries(page?.entries ?? []);
      setNextBefore(page?.next_before ?? null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [category, fetchPage]);

  const loadMore = async () => {
    if (!nextBefore) return;
    setLoadingMore(true);
    const page = await fetchPage(category, nextBefore);
    if (page) {
      setEntries((prev) => [...prev, ...page.entries]);
      setNextBefore(page.next_before);
    }
    setLoadingMore(false);
  };

  return (
    <div className="space-y-6">
      <div className="erp-page-bar">
        <div className="flex items-center gap-3">
          <div className="erp-page-icon">
            <History className="h-4.5 w-4.5 text-gold-400" />
          </div>
          <div>
            <h1 className="erp-page-title">Audit Log</h1>
            <p className="erp-page-subtitle">
              Who changed logins, permissions and records, and when
            </p>
          </div>
        </div>
        <div className="space-y-1 sm:w-56">
          <Label htmlFor="audit-category" className="text-xs font-medium">
            Show
          </Label>
          <NativeSelect
            id="audit-category"
            value={category}
            onChange={(e) => {
              setLoading(true);
              setCategory(e.target.value);
            }}
            className="w-full"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div className="erp-table-container p-4 sm:p-6">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500 dark:text-gray-400">
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            Loading…
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400">
            <Inbox className="h-10 w-10 mb-2 opacity-50" />
            <p className="text-sm">Nothing recorded yet.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-border">
            {entries.map((e) => {
              const { phrase, object } = describe(e);
              const details = Object.entries(e.details ?? {})
                .map(([k, v]) => [DETAIL_LABELS[k] ?? humanise(k), formatDetail(v)] as const)
                .filter((pair): pair is readonly [string, string] => pair[1] !== null);
              return (
                <li key={e.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <p className="text-sm text-navy-900 dark:text-white">
                        <span className="font-medium">{e.actor_name}</span>{" "}
                        <span className="text-gray-600 dark:text-gray-300">{phrase}</span>
                        {object && (
                          <>
                            {" "}
                            <span className="font-medium">{object}</span>
                          </>
                        )}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {e.actor_role && (
                          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                            {e.actor_role}
                          </Badge>
                        )}
                        {details.map(([label, value]) => (
                          <span key={label} className="text-xs text-gray-500 dark:text-gray-400">
                            {label}: {value}
                          </span>
                        ))}
                      </div>
                    </div>
                    <time
                      dateTime={e.at}
                      className="shrink-0 text-xs text-gray-500 dark:text-gray-400"
                    >
                      {formatWhen(e.at)}
                    </time>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {!loading && nextBefore && (
          <div className="mt-4 flex justify-center">
            <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
              {loadingMore && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Load older entries
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
