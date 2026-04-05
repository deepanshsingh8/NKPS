"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  BookOpen,
  ClipboardCheck,
  BarChart3,
  Clock,
  CalendarDays,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UpcomingEvents } from "@/components/shared/UpcomingEvents";
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
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-navy-900/20 border-t-navy-900" />
      </div>
    );
  }

  const firstName = profile?.full_name?.split(" ")[0] ?? "Teacher";
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <p className="text-sm text-gray-400 dark:text-gray-500 mb-1">{greeting}</p>
        <h1 className="erp-page-title">
          Welcome back, {firstName}!
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Here is an overview of your classes and tasks for today.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="erp-stat-card relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-blue-500/8 to-transparent rounded-bl-full" />
          <div className="relative">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <BookOpen className="h-5 w-5 text-blue-600" />
              </div>
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">My Classes</span>
            </div>
            <p className="text-3xl font-bold text-navy-900 dark:text-white tracking-tight">
              {stats.classCount}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Assigned classes</p>
          </div>
        </div>

        <div className="erp-stat-card relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-emerald-500/8 to-transparent rounded-bl-full" />
          <div className="relative">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <Users className="h-5 w-5 text-emerald-600" />
              </div>
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Students</span>
            </div>
            <p className="text-3xl font-bold text-navy-900 dark:text-white tracking-tight">
              {stats.studentCount}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Total students</p>
          </div>
        </div>

        <div className={cn(
          "erp-stat-card relative overflow-hidden group",
          stats.pendingAttendance && "ring-1 ring-amber-200"
        )}>
          <div className={cn(
            "absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl rounded-bl-full",
            stats.pendingAttendance ? "from-amber-500/10 to-transparent" : "from-green-500/8 to-transparent"
          )} />
          <div className="relative">
            <div className="flex items-center gap-3 mb-3">
              <div className={cn(
                "h-10 w-10 rounded-xl flex items-center justify-center",
                stats.pendingAttendance ? "bg-amber-100 dark:bg-amber-900/30" : "bg-green-100 dark:bg-green-950/30"
              )}>
                <ClipboardCheck className={cn(
                  "h-5 w-5",
                  stats.pendingAttendance ? "text-amber-600" : "text-green-600"
                )} />
              </div>
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Attendance Today</span>
            </div>
            {stats.pendingAttendance ? (
              <Badge className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-semibold">
                Pending
              </Badge>
            ) : (
              <Badge className="bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400 text-xs font-semibold">
                Marked
              </Badge>
            )}
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
              {stats.pendingAttendance
                ? "Attendance not marked yet"
                : "All done for today"}
            </p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="erp-section-title mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { href: "/teacher/attendance", icon: ClipboardCheck, label: "Mark Attendance", color: "bg-navy-900 text-white hover:bg-navy-800" },
            { href: "/teacher/results", icon: BarChart3, label: "Enter Results", color: "bg-gold-500 text-navy-900 hover:bg-gold-400" },
            { href: "/teacher/students", icon: Users, label: "View Students", color: "bg-white dark:bg-card text-navy-900 dark:text-white border border-gray-200 dark:border-border hover:bg-gray-50 dark:hover:bg-muted" },
            { href: "/teacher/timetable", icon: Clock, label: "View Timetable", color: "bg-white dark:bg-card text-navy-900 dark:text-white border border-gray-200 dark:border-border hover:bg-gray-50 dark:hover:bg-muted" },
          ].map(({ href, icon: Icon, label, color }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 group",
                color
              )}
            >
              <div className="flex items-center gap-2.5">
                <Icon className="h-4 w-4" />
                {label}
              </div>
              <ArrowRight className="h-3.5 w-3.5 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            </Link>
          ))}
        </div>
      </div>

      {/* Today's Timetable */}
      <div>
        <h2 className="erp-section-title mb-4">Today&apos;s Timetable</h2>
        <div className="erp-card">
          <div className="flex items-center justify-center py-14">
            <div className="text-center">
              <div className="h-12 w-12 rounded-xl bg-gray-100 dark:bg-muted flex items-center justify-center mx-auto mb-3">
                <Clock className="h-6 w-6 text-gray-400 dark:text-gray-500" />
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">No timetable configured yet</p>
              <Link
                href="/teacher/timetable"
                className="text-sm text-gold-600 hover:text-gold-500 font-medium mt-2 inline-flex items-center gap-1 transition-colors"
              >
                View Timetable
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Upcoming Events */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <CalendarDays className="h-5 w-5 text-gray-400 dark:text-gray-500" />
          <h2 className="erp-section-title">Upcoming Events</h2>
        </div>
        <UpcomingEvents limit={5} />
      </div>
    </div>
  );
}
