"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  BookOpen,
  ClipboardCheck,
  BarChart3,
  Clock,
} from "lucide-react";
import type { Profile } from "@/types";

interface TeacherStats {
  classCount: number;
  studentCount: number;
  pendingAttendance: boolean;
}

export default function TeacherDashboard() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<TeacherStats>({
    classCount: 0,
    studentCount: 0,
    pendingAttendance: true,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // Fetch profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileData) setProfile(profileData);

      // Fetch assigned classes via class_subjects
      const { data: classSubjects } = await supabase
        .from("class_subjects")
        .select("class_id")
        .eq("teacher_id", user.id);

      const classIds = [
        ...new Set((classSubjects ?? []).map((cs) => cs.class_id)),
      ];

      // Also check if class teacher
      const { data: classTeacherClasses } = await supabase
        .from("classes")
        .select("id")
        .eq("class_teacher_id", user.id);

      const allClassIds = [
        ...new Set([
          ...classIds,
          ...(classTeacherClasses ?? []).map((c) => c.id),
        ]),
      ];

      // Fetch student count from enrollments
      let studentCount = 0;
      if (allClassIds.length > 0) {
        const { count } = await supabase
          .from("student_enrollments")
          .select("*", { count: "exact", head: true })
          .in("class_id", allClassIds);
        studentCount = count ?? 0;
      }

      // Check if attendance marked today
      const today = new Date().toISOString().split("T")[0];
      let pendingAttendance = true;
      if (allClassIds.length > 0) {
        const { count } = await supabase
          .from("attendance")
          .select("*", { count: "exact", head: true })
          .eq("marked_by", user.id)
          .eq("date", today);
        pendingAttendance = (count ?? 0) === 0;
      }

      setStats({
        classCount: allClassIds.length,
        studentCount,
        pendingAttendance,
      });
      setLoading(false);
    }

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-navy-900 border-t-transparent" />
      </div>
    );
  }

  const firstName = profile?.full_name?.split(" ")[0] ?? "Teacher";

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-navy-900">
          Welcome back, {firstName}!
        </h1>
        <p className="text-gray-500 mt-1">
          Here is an overview of your classes and tasks for today.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-white rounded-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-navy-900">
              <BookOpen className="h-5 w-5 text-gold-500" />
              My Classes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-navy-900">
              {stats.classCount}
            </p>
            <p className="text-sm text-gray-500 mt-1">Assigned classes</p>
          </CardContent>
        </Card>

        <Card className="bg-white rounded-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-navy-900">
              <Users className="h-5 w-5 text-gold-500" />
              Students
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-navy-900">
              {stats.studentCount}
            </p>
            <p className="text-sm text-gray-500 mt-1">Total students</p>
          </CardContent>
        </Card>

        <Card className="bg-white rounded-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-navy-900">
              <ClipboardCheck className="h-5 w-5 text-gold-500" />
              Attendance Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.pendingAttendance ? (
              <Badge variant="destructive" className="text-xs">
                Pending
              </Badge>
            ) : (
              <Badge className="bg-green-100 text-green-700 text-xs">
                Marked
              </Badge>
            )}
            <p className="text-sm text-gray-500 mt-2">
              {stats.pendingAttendance
                ? "Attendance not marked yet"
                : "All done for today"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="font-heading text-lg font-semibold text-navy-900 mb-4">
          Quick Actions
        </h2>
        <div className="flex flex-wrap gap-4">
          <Link
            href="/teacher/attendance"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-navy-900 text-white rounded-lg text-sm font-medium hover:bg-navy-900/90 transition-colors"
          >
            <ClipboardCheck className="h-4 w-4" />
            Mark Attendance
          </Link>
          <Link
            href="/teacher/results"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gold-500 text-navy-900 rounded-lg text-sm font-medium hover:bg-gold-500/90 transition-colors"
          >
            <BarChart3 className="h-4 w-4" />
            Enter Results
          </Link>
        </div>
      </div>

      {/* Today's Timetable */}
      <div>
        <h2 className="font-heading text-lg font-semibold text-navy-900 mb-4">
          Today&apos;s Timetable
        </h2>
        <Card className="bg-white rounded-xl">
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center text-gray-400">
              <Clock className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No timetable configured yet</p>
              <Link
                href="/teacher/timetable"
                className="text-sm text-gold-500 hover:underline mt-1 inline-block"
              >
                View Timetable
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
