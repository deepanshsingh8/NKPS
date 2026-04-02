import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/verify-admin";

export async function GET() {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch all dashboard data using service role (bypasses RLS)
  const [galleryRes, tcRes, unreadRes, messagesRes, usersRes, studentsRes, teachersRes] = await Promise.all([
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
      .from("contact_submissions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5),
    admin
      .from("profiles")
      .select("*", { count: "exact", head: true }),
    admin
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "student"),
    admin
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "teacher"),
  ]);

  return NextResponse.json({
    stats: {
      galleryCount: galleryRes.count ?? 0,
      tcCount: tcRes.count ?? 0,
      unreadCount: unreadRes.count ?? 0,
      totalUsers: usersRes.count ?? 0,
      totalStudents: studentsRes.count ?? 0,
      totalTeachers: teachersRes.count ?? 0,
    },
    recentMessages: messagesRes.data ?? [],
  });
}
