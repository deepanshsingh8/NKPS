import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@nkps/shared/lib/verify-admin";
import { dbErrorResponse } from "@nkps/shared/lib/api-errors";

// GET /api/audit-log?category=<users|permissions|registrations|data>&before=<id>
//
// Read-only feed for /administration/audit-log. Admin-only, like the page
// (ADMIN_ONLY_PREFIXES) and like the table's own RLS policy (migration 134).
// Newest first, PAGE_SIZE at a time; `before` is the smallest id already shown.
//
// People and registrations are resolved to names here so the screen never has
// to show an id. Rows written by the generic proxy name the table only.

const PAGE_SIZE = 100;

const CATEGORY_PREFIX: Record<string, string> = {
  users: "user.",
  permissions: "editor_permissions.",
  registrations: "registration.",
  data: "admin_proxy.",
  messaging: "whatsapp.",
};

interface AuditRow {
  id: number;
  at: string;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  target_table: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
}

export async function GET(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const prefix = CATEGORY_PREFIX[params.get("category") ?? ""];
  const before = Number(params.get("before"));

  let query = admin
    .from("audit_log")
    .select("id, at, actor_id, actor_role, action, target_table, target_id, details")
    .order("id", { ascending: false })
    .limit(PAGE_SIZE + 1);
  if (prefix) query = query.like("action", `${prefix}%`);
  if (Number.isInteger(before) && before > 0) query = query.lt("id", before);

  const { data, error } = await query;
  if (error) return dbErrorResponse(error, "audit-log list");

  const rows = (data ?? []) as AuditRow[];
  const page = rows.slice(0, PAGE_SIZE);

  const profileIds = new Set<string>();
  const registrationIds = new Set<string>();
  const busIds = new Set<string>();
  const studentIds = new Set<string>();
  for (const r of page) {
    if (r.actor_id) profileIds.add(r.actor_id);
    if (!r.target_id) continue;
    if (r.target_table === "profiles" || r.target_table === "editor_permissions") {
      profileIds.add(r.target_id);
    } else if (r.target_table === "registration_requests") {
      registrationIds.add(r.target_id);
    } else if (r.action.startsWith("whatsapp.") && r.target_table === "buses") {
      // Only the WhatsApp actions show a bus or student by name; proxy rows
      // print the table name, so resolving theirs would be a query for nothing.
      busIds.add(r.target_id);
    } else if (r.action.startsWith("whatsapp.") && r.target_table === "students") {
      studentIds.add(r.target_id);
    }
  }

  const [profilesRes, registrationsRes, busesRes, studentsRes] = await Promise.all([
    profileIds.size
      ? admin.from("profiles").select("id, full_name, email").in("id", [...profileIds])
      : Promise.resolve({ data: [], error: null }),
    registrationIds.size
      ? admin
          .from("registration_requests")
          .select("id, full_name")
          .in("id", [...registrationIds])
      : Promise.resolve({ data: [], error: null }),
    // WhatsApp sends target a bus or a student (migration 138). Named here for
    // the same reason people are: the screen never shows an id.
    busIds.size
      ? admin.from("buses").select("id, bus_number").in("id", [...busIds])
      : Promise.resolve({ data: [], error: null }),
    studentIds.size
      ? admin.from("students").select("id, full_name").in("id", [...studentIds])
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (profilesRes.error) return dbErrorResponse(profilesRes.error, "audit-log profiles");
  if (registrationsRes.error) {
    return dbErrorResponse(registrationsRes.error, "audit-log registrations");
  }
  if (busesRes.error) return dbErrorResponse(busesRes.error, "audit-log buses");
  if (studentsRes.error) return dbErrorResponse(studentsRes.error, "audit-log students");

  const names = new Map<string, string>();
  for (const p of (profilesRes.data ?? []) as Array<{
    id: string;
    full_name: string | null;
    email: string | null;
  }>) {
    names.set(p.id, p.full_name || p.email || "Unnamed user");
  }
  for (const r of (registrationsRes.data ?? []) as Array<{ id: string; full_name: string | null }>) {
    names.set(r.id, r.full_name || "Unnamed registrant");
  }
  for (const b of (busesRes.data ?? []) as Array<{ id: string; bus_number: string | null }>) {
    names.set(b.id, b.bus_number ? `bus ${b.bus_number}` : "a bus");
  }
  for (const st of (studentsRes.data ?? []) as Array<{ id: string; full_name: string | null }>) {
    names.set(st.id, st.full_name || "Unnamed student");
  }

  return NextResponse.json({
    entries: page.map((r) => ({
      id: r.id,
      at: r.at,
      actor_name: r.actor_id ? (names.get(r.actor_id) ?? "Deleted user") : "Deleted user",
      actor_role: r.actor_role,
      action: r.action,
      target_table: r.target_table,
      // A profile that has since been deleted no longer resolves.
      target_name: r.target_id ? (names.get(r.target_id) ?? null) : null,
      details: r.details,
    })),
    next_before: rows.length > PAGE_SIZE ? page[page.length - 1].id : null,
  });
}
