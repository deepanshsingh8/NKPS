import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/verify-admin";

export async function GET() {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Optimized: 5 parallel queries instead of 7
  // - Students counted from students table (the source of truth)
  // - Teachers counted from profiles (they still need auth accounts)
  // - Recent messages selects only needed columns
  const [galleryRes, tcRes, unreadRes, messagesRes, studentsRes, teachersRes] =
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
        .from("contact_submissions")
        .select("id, full_name, email, subject, is_read, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
      admin
        .from("students")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true),
      admin
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("role", "teacher"),
    ]);

  const totalUsers =
    (studentsRes.count ?? 0) + (teachersRes.count ?? 0);

  return NextResponse.json({
    stats: {
      galleryCount: galleryRes.count ?? 0,
      tcCount: tcRes.count ?? 0,
      unreadCount: unreadRes.count ?? 0,
      totalUsers,
      totalStudents: studentsRes.count ?? 0,
      totalTeachers: teachersRes.count ?? 0,
    },
    recentMessages: messagesRes.data ?? [],
  });
}
