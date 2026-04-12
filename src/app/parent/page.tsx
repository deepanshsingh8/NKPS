"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ClipboardCheck,
  BarChart3,
  CreditCard,
  CalendarDays,
  ArrowRight,
  Users,
  GraduationCap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UpcomingEvents } from "@/components/shared/UpcomingEvents";
import type { Profile } from "@/types";

interface ChildInfo {
  student_id: string;
  relationship: string;
  is_primary_contact: boolean;
  student: {
    id: string;
    admission_no: string;
    full_name: string;
    photo_url: string | null;
  };
  class_name: string | null;
  section: string | null;
  roll_number: number | null;
}

export default function ParentDashboard() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [children, setChildren] = useState<ChildInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // Fetch profile (includes parent_id linking to parents table)
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileData) setProfile(profileData);

      const parentId = profileData?.parent_id;
      if (!parentId) {
        setLoading(false);
        return;
      }

      // Get children via student_parents
      const { data: studentParents } = await supabase
        .from("student_parents")
        .select(
          "student_id, relationship, is_primary_contact, students(id, admission_no, full_name, photo_url)"
        )
        .eq("parent_id", parentId);

      if (!studentParents || studentParents.length === 0) {
        setLoading(false);
        return;
      }

      // For each child, get enrollment info
      const childInfos: ChildInfo[] = [];
      for (const sp of studentParents) {
        const student = sp.students as unknown as {
          id: string;
          admission_no: string;
          full_name: string;
          photo_url: string | null;
        };
        if (!student) continue;

        const { data: enrollment } = await supabase
          .from("student_enrollments")
          .select("class_id, roll_number, classes(name, section)")
          .eq("student_id", student.id)
          .limit(1)
          .single();

        const classInfo = enrollment?.classes as unknown as {
          name: string;
          section: string;
        } | null;

        childInfos.push({
          student_id: sp.student_id,
          relationship: sp.relationship,
          is_primary_contact: sp.is_primary_contact,
          student,
          class_name: classInfo?.name ?? null,
          section: classInfo?.section ?? null,
          roll_number: enrollment?.roll_number ?? null,
        });
      }

      setChildren(childInfos);
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

  const firstName = profile?.full_name?.split(" ")[0] ?? "Parent";
  const greeting =
    new Date().getHours() < 12
      ? "Good morning"
      : new Date().getHours() < 17
        ? "Good afternoon"
        : "Good evening";

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <p className="text-sm text-gray-400 dark:text-gray-500 mb-1">
          {greeting}
        </p>
        <h1 className="erp-page-title">Welcome back, {firstName}!</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Here is an overview of your children&apos;s academic progress.
        </p>
      </div>

      {/* Children Cards */}
      <div>
        <h2 className="erp-section-title mb-4 flex items-center gap-2">
          <Users className="h-5 w-5 text-gray-400 dark:text-gray-500" />
          My Children
        </h2>
        {children.length === 0 ? (
          <Card className="erp-card">
            <CardContent className="flex items-center justify-center py-12">
              <div className="text-center text-gray-400 dark:text-gray-500">
                <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No children linked to your account</p>
                <p className="text-xs text-gray-300 dark:text-gray-500 mt-1">
                  Please contact the school admin to link your children.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {children.map((child) => (
              <Card
                key={child.student_id}
                className="erp-card relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-gold-500/8 to-transparent rounded-bl-full" />
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-navy-900 dark:text-white">
                    <div className="h-10 w-10 rounded-xl bg-navy-900/10 dark:bg-white/10 flex items-center justify-center">
                      <GraduationCap className="h-5 w-5 text-navy-900 dark:text-white" />
                    </div>
                    <div>
                      <p className="text-base font-semibold">
                        {child.student.full_name}
                      </p>
                      <p className="text-xs font-normal text-gray-500 dark:text-gray-400">
                        {child.class_name && child.section
                          ? `${child.class_name} - ${child.section}`
                          : "Class not assigned"}
                        {child.roll_number !== null &&
                          ` | Roll No: ${child.roll_number}`}
                      </p>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 mb-4">
                    <Badge className="bg-gray-100 dark:bg-muted text-gray-600 dark:text-gray-300 text-xs capitalize">
                      {child.relationship}
                    </Badge>
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      Admission No: {child.student.admission_no}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Link
                      href={`/parent/attendance?child=${child.student_id}`}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors"
                    >
                      <ClipboardCheck className="h-3.5 w-3.5" />
                      Attendance
                    </Link>
                    <Link
                      href={`/parent/results?child=${child.student_id}`}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400 text-xs font-medium hover:bg-violet-100 dark:hover:bg-violet-950/50 transition-colors"
                    >
                      <BarChart3 className="h-3.5 w-3.5" />
                      Results
                    </Link>
                    <Link
                      href={`/parent/fees?child=${child.student_id}`}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 text-xs font-medium hover:bg-green-100 dark:hover:bg-green-950/50 transition-colors"
                    >
                      <CreditCard className="h-3.5 w-3.5" />
                      Fees
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Quick Links */}
      <div>
        <h2 className="erp-section-title mb-4">Quick Links</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              href: "/parent/attendance",
              icon: ClipboardCheck,
              label: "View Attendance",
              color:
                "bg-navy-900 text-white hover:bg-navy-800",
            },
            {
              href: "/parent/results",
              icon: BarChart3,
              label: "View Results",
              color:
                "bg-gold-500 text-navy-900 hover:bg-gold-400",
            },
            {
              href: "/parent/fees",
              icon: CreditCard,
              label: "Check Fees",
              color:
                "bg-white dark:bg-card text-navy-900 dark:text-white border border-gray-200 dark:border-border hover:bg-gray-50 dark:hover:bg-muted",
            },
            {
              href: "/parent/calendar",
              icon: CalendarDays,
              label: "Calendar",
              color:
                "bg-white dark:bg-card text-navy-900 dark:text-white border border-gray-200 dark:border-border hover:bg-gray-50 dark:hover:bg-muted",
            },
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
