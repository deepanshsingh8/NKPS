import type { SupabaseClient } from "@supabase/supabase-js";

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
  /** The incoming request (or its headers), for the client IP. */
  request?: Request | Headers | null;
}

function clientIp(source: Request | Headers | null | undefined): string | null {
  if (!source) return null;
  const headers = source instanceof Headers ? source : source.headers;
  // Vercel sets x-forwarded-for to "client, proxy1, …"; the first entry is the
  // client. Behind no proxy at all there is nothing trustworthy to record.
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || null;
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
      ip: clientIp(entry.request),
    });
    if (error) {
      console.error(`[audit-log] ${entry.action} not recorded:`, error);
    }
  } catch (err) {
    console.error(`[audit-log] ${entry.action} not recorded:`, err);
  }
}
