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
  ClipboardCheck,
  BarChart3,
  CreditCard,
} from "lucide-react";
import { UpcomingEvents } from "@/components/shared/UpcomingEvents";
import type { Profile } from "@/types";

interface StudentStats {
  attendancePercent: number | null;
  latestResult: string | null;
  feeStatus: "paid" | "pending" | "unknown";
}

export default function StudentDashboard() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<StudentStats>({
    attendancePercent: null,
    latestResult: null,
    feeStatus: "unknown",
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // Fetch profile (includes student_id linking to students table)
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileData) setProfile(profileData);

      // Resolve the linked student record ID
      const studentId = profileData?.student_id;
      if (!studentId) {
        setLoading(false);
        return;
      }

      // Fetch enrollment using the linked student_id
      const { data: enrollment } = await supabase
        .from("student_enrollments")
        .select("class_id")
        .eq("student_id", studentId)
        .limit(1)
        .single();

      const classId = enrollment?.class_id;

      // Attendance percentage
      let attendancePercent: number | null = null;
      if (classId) {
        const { count: totalDays } = await supabase
          .from("attendance")
          .select("*", { count: "exact", head: true })
          .eq("student_id", studentId)
          .eq("class_id", classId);

        const { count: presentDays } = await supabase
          .from("attendance")
          .select("*", { count: "exact", head: true })
          .eq("student_id", studentId)
          .eq("class_id", classId)
          .in("status", ["present", "late"]);

        if (totalDays && totalDays > 0) {
          attendancePercent = Math.round(
            ((presentDays ?? 0) / totalDays) * 100
          );
        }
      }

      // Latest result
      let latestResult: string | null = null;
      const { data: resultData } = await supabase
        .from("results")
        .select("marks_obtained, max_marks, grade")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (resultData) {
        latestResult = resultData.grade
          ? `Grade ${resultData.grade}`
          : `${resultData.marks_obtained}/${resultData.max_marks}`;
      }

      // Fee status — check most recent payment
      let feeStatus: "paid" | "pending" | "unknown" = "unknown";
      const { data: feeData } = await supabase
        .from("fee_payments")
        .select("status")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (feeData) {
        feeStatus = feeData.status === "paid" ? "paid" : "pending";
      }

      setStats({ attendancePercent, latestResult, feeStatus });
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

  const firstName = profile?.full_name?.split(" ")[0] ?? "Student";

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-navy-900">
          Welcome back, {firstName}!
        </h1>
        <p className="text-gray-500 mt-1">
          Here is a summary of your academic progress.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-white rounded-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-navy-900">
              <ClipboardCheck className="h-5 w-5 text-gold-500" />
              Attendance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-navy-900">
              {stats.attendancePercent !== null
                ? `${stats.attendancePercent}%`
                : "--"}
            </p>
            <p className="text-sm text-gray-500 mt-1">Overall attendance</p>
          </CardContent>
        </Card>

        <Card className="bg-white rounded-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-navy-900">
              <BarChart3 className="h-5 w-5 text-gold-500" />
              Latest Result
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-navy-900">
              {stats.latestResult ?? "--"}
            </p>
            <p className="text-sm text-gray-500 mt-1">Most recent exam</p>
          </CardContent>
        </Card>

        <Card className="bg-white rounded-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-navy-900">
              <CreditCard className="h-5 w-5 text-gold-500" />
              Fee Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.feeStatus === "paid" ? (
              <Badge className="bg-green-100 text-green-700 text-xs">
                Paid
              </Badge>
            ) : stats.feeStatus === "pending" ? (
              <Badge variant="destructive" className="text-xs">
                Pending
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">
                No Records
              </Badge>
            )}
            <p className="text-sm text-gray-500 mt-2">
              {stats.feeStatus === "paid"
                ? "All fees up to date"
                : stats.feeStatus === "pending"
                  ? "Payment due"
                  : "No fee records found"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <div>
        <h2 className="font-heading text-lg font-semibold text-navy-900 mb-4">
          Quick Links
        </h2>
        <div className="flex flex-wrap gap-4">
          <Link
            href="/student/attendance"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-navy-900 text-white rounded-lg text-sm font-medium hover:bg-navy-900/90 transition-colors"
          >
            <ClipboardCheck className="h-4 w-4" />
            View Attendance
          </Link>
          <Link
            href="/student/results"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gold-500 text-navy-900 rounded-lg text-sm font-medium hover:bg-gold-500/90 transition-colors"
          >
            <BarChart3 className="h-4 w-4" />
            View Results
          </Link>
          <Link
            href="/student/fees"
            className="inline-flex items-center gap-2 px-5 py-2.5 border border-navy-900 text-navy-900 rounded-lg text-sm font-medium hover:bg-navy-900/5 transition-colors"
          >
            <CreditCard className="h-4 w-4" />
            Check Fees
          </Link>
        </div>
      </div>

      {/* Upcoming Events */}
      <div>
        <h2 className="font-heading text-lg font-semibold text-navy-900 mb-4">
          Upcoming Events
        </h2>
        <UpcomingEvents limit={5} />
      </div>
    </div>
  );
}
