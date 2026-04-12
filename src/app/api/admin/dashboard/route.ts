import { NextResponse } from "next/server";
import { verifyAdminOrEditor } from "@/lib/verify-admin";

export async function GET() {
  const admin = await verifyAdminOrEditor();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().split("T")[0];

  const [galleryRes, tcRes, unreadRes, studentsRes, teachersRes, eventsRes, pendingRegsRes, profilesRes] =
    await Promise.all([
      admin
        .from("gallery_images")
        .select("*", { count: "exact", head: true }),
      admin
        .from("transfer_certificates")
        .select("*", { count: "exact", head: true }),
      admin
        .from("contact_submissions")
        .select("*", { count: "exact", head: true })
        .eq("is_read", false),
      admin
        .from("students")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true),
      admin
        .from("teachers")
        .select("*", { count: "exact", head: true }),
      admin
        .from("calendar_events")
        .select("id, title, description, event_type, start_date, end_date")
        .gte("start_date", today)
        .order("start_date", { ascending: true })
        .limit(8),
      admin
        .from("registration_requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending"),
      admin
        .from("profiles")
        .select("*", { count: "exact", head: true }),
    ]);

  const totalUsers = profilesRes.count ?? 0;

  return NextResponse.json({
    stats: {
      galleryCount: galleryRes.count ?? 0,
      tcCount: tcRes.count ?? 0,
      unreadCount: unreadRes.count ?? 0,
      totalUsers,
      totalStudents: studentsRes.count ?? 0,
      totalTeachers: teachersRes.count ?? 0,
      pendingRegistrations: pendingRegsRes.count ?? 0,
    },
    upcomingEvents: eventsRes.data ?? [],
  });
}
