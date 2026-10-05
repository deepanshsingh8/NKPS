import type { SupabaseClient } from "@supabase/supabase-js";
import { clientIp } from "@nkps/shared/lib/rate-limit";

// Append-only record of who changed what (public.audit_log, migration 134).
//
// Written on the service-role client, so RLS is bypassed and no client can
// forge or erase a row; a trigger refuses UPDATE / DELETE even for the service
// role. Admins read it through RLS.
//
// What goes in `details`: ids, column NAMES, role and feature keys, counts.
// Never passwords, tokens, links, or the values of personal fields — the log is
// kept forever and read by every admin, so it must not become a second copy of
// the data it describes.

export type AuditAction =
  | "user.create"
  | "user.delete"
  | "user.role_change"
  | "user.super_admin_change"
  | "user.password_reset"
  | "editor_permissions.change"
  | "registration.approve"
  | "registration.reject"
  | "admin_proxy.insert"
  | "admin_proxy.update"
  | "admin_proxy.delete";

export interface AuditEntry {
  actorId: string | null;
  /** The caller's access level at the time: a profile role, or "editor". */
  actorRole?: string | null;
  action: AuditAction;
  targetTable?: string | null;
  targetId?: string | number | null;
  details?: Record<string, unknown> | null;
  /** The incoming request, for the client IP. */
  request?: Request | null;
}

function auditIp(request: Request | null | undefined): string | null {
  if (!request) return null;
  // Same source of truth as the rate limiter, so the two never disagree about
  // who the caller was (and both honour TRUSTED_IP_HEADER / Vercel's header).
  const ip = clientIp(request);
  return ip === "unknown" ? null : ip;
}

/**
 * Records one audited action. Never throws and never rejects: an audit write
 * that fails is logged and the operation it describes carries on. Awaited
 * rather than fired-and-forgotten so a serverless function isn't frozen with
 * the insert still in flight.
 */
export async function writeAuditLog(admin: SupabaseClient, entry: AuditEntry): Promise<void> {
  try {
    const { error } = await admin.from("audit_log").insert({
      actor_id: entry.actorId,
      actor_role: entry.actorRole ?? null,
      action: entry.action,
      target_table: entry.targetTable ?? null,
      target_id: entry.targetId == null ? null : String(entry.targetId),
      details: entry.details ?? null,
      ip: auditIp(entry.request),
    });
    if (error) {
      console.error(`[audit-log] ${entry.action} not recorded:`, error);
    }
  } catch (err) {
    console.error(`[audit-log] ${entry.action} not recorded:`, err);
  }
}
