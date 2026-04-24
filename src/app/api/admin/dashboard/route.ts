import { NextResponse } from "next/server";
import { getCallerAccess } from "@/lib/verify-admin";
import type { FeatureKey } from "@/lib/permissions";

// Privileged counts — students, staff, admissions, fees — never appear in the
// response for an editor who lacks the grant, so nothing leaks into the DOM.
export async function GET() {
  const access = await getCallerAccess();
  if (!access) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { admin, isAdmin, permissions } = access;
  const can = (key: FeatureKey) => isAdmin || permissions.has(key);

  const today = new Date().toISOString().split("T")[0];

  const [
    galleryRes,
    tcRes,
    unreadRes,
    studentsRes,
    staffRes,
    eventsRes,
    pendingRegsRes,
    profilesRes,
  ] = await Promise.all([
    can("gallery")
      ? admin.from("gallery_images").select("*", { count: "exact", head: true })
      : Promise.resolve({ count: null }),
    can("transfer_certificates")
      ? admin.from("transfer_certificates").select("*", { count: "exact", head: true })
      : Promise.resolve({ count: null }),
    can("contact")
      ? admin
          .from("contact_submissions")
          .select("*", { count: "exact", head: true })
          .eq("is_read", false)
      : Promise.resolve({ count: null }),
    can("students")
      ? admin
          .from("students")
          .select("*", { count: "exact", head: true })
          .eq("is_active", true)
      : Promise.resolve({ count: null }),
    can("staff")
      ? admin
          .from("staff_members")
          .select("*", { count: "exact", head: true })
          .eq("is_active", true)
      : Promise.resolve({ count: null }),
    can("calendar")
      ? admin
          .from("calendar_events")
          .select("id, title, description, event_type, start_date, end_date")
          .gte("start_date", today)
          .order("start_date", { ascending: true })
          .limit(8)
      : Promise.resolve({ data: [] }),
    can("registrations")
      ? admin
          .from("registration_requests")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending")
      : Promise.resolve({ count: null }),
    // Total users count is admin-only — even editors with broad access don't
    // need to see the user population.
    isAdmin
      ? admin.from("profiles").select("*", { count: "exact", head: true })
      : Promise.resolve({ count: null }),
  ]);

  // Build only the keys the caller can see. Missing keys are hidden by the
  // frontend; nothing leaks to an editor without the grant.
  const stats: Partial<
    Record<
      | "galleryCount"
      | "tcCount"
      | "unreadCount"
      | "totalUsers"
      | "totalStudents"
      | "totalStaff"
      | "pendingRegistrations",
      number
    >
  > = {};
  if (can("gallery")) stats.galleryCount = galleryRes.count ?? 0;
  if (can("transfer_certificates")) stats.tcCount = tcRes.count ?? 0;
  if (can("contact")) stats.unreadCount = unreadRes.count ?? 0;
  if (can("students")) stats.totalStudents = studentsRes.count ?? 0;
  if (can("staff")) stats.totalStaff = staffRes.count ?? 0;
  if (can("registrations")) stats.pendingRegistrations = pendingRegsRes.count ?? 0;
  if (isAdmin) stats.totalUsers = profilesRes.count ?? 0;

  return NextResponse.json({
    stats,
    upcomingEvents: eventsRes.data ?? [],
    canSeeEvents: can("calendar"),
  });
}
