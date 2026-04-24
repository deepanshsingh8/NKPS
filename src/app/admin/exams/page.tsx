"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ClipboardList,
  BarChart3,
  GraduationCap,
  FileText,
  Sparkles,
  CalendarClock,
  IdCard,
  ClipboardCheck,
  Lock,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/types";
import { type FeatureKey } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type ExamTile = {
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  accentColor: string;
  featureKey: FeatureKey | null;
  adminOnly?: boolean;
};

const tiles: ExamTile[] = [
  {
    label: "Exam Types",
    description:
      "Define exam instances (Half-Yearly, Annual, Class Tests) with max marks and ordering.",
    href: "/admin/exams/types",
    icon: ClipboardList,
    accentColor: "text-orange-600 bg-orange-100 dark:bg-orange-900/30",
    featureKey: "exam_types",
  },
  {
    label: "Grade Master",
    description:
      "Define grade cutoffs globally or per class. Applied automatically by report cards and teacher grading.",
    href: "/admin/exams/grade-master",
    icon: GraduationCap,
    accentColor: "text-amber-600 bg-amber-100 dark:bg-amber-900/30",
    featureKey: null,
    adminOnly: true,
  },
  {
    label: "Result Master",
    description:
      "Configure pass criteria, weightage, grace marks, rounding, and report card rules per class.",
    href: "/admin/exams/result-master",
    icon: ClipboardCheck,
    accentColor: "text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30",
    featureKey: null,
    adminOnly: true,
  },
  {
    label: "Header / Footer",
    description:
      "School branding and signature blocks for report cards, admit cards, and other generated PDFs.",
    href: "/admin/exams/header-footer",
    icon: FileText,
    accentColor: "text-teal-600 bg-teal-100 dark:bg-teal-900/30",
    featureKey: null,
    adminOnly: true,
  },
  {
    label: "Non-Scholastic Masters",
    description:
      "Co-scholastic subjects and sub-skills (Discipline, Arts, Sports) that teachers grade alongside academics.",
    href: "/admin/exams/non-scholastic-masters",
    icon: Sparkles,
    accentColor: "text-pink-600 bg-pink-100 dark:bg-pink-900/30",
    featureKey: null,
    adminOnly: true,
  },
  {
    label: "Exam Timetable",
    description:
      "Schedule the date, time, and room for each subject's paper per class and exam.",
    href: "/admin/exams/timetable",
    icon: CalendarClock,
    accentColor: "text-cyan-600 bg-cyan-100 dark:bg-cyan-900/30",
    featureKey: "exam_timetable",
  },
  {
    label: "Admit Cards",
    description:
      "Design reusable admit card templates and generate student-specific PDFs before each exam.",
    href: "/admin/exams/admit-cards",
    icon: IdCard,
    accentColor: "text-fuchsia-600 bg-fuchsia-100 dark:bg-fuchsia-900/30",
    featureKey: "admit_cards",
  },
  {
    label: "Results",
    description:
      "Class and subject-wise performance overview, top performers, and pass rates.",
    href: "/admin/exams/results",
    icon: BarChart3,
    accentColor: "text-indigo-600 bg-indigo-100 dark:bg-indigo-900/30",
    featureKey: "results",
  },
  {
    label: "Class Tests",
    description:
      "Unit tests and formative assessments — teachers create and grade, admin oversees across classes.",
    href: "/admin/exams/class-tests",
    icon: ClipboardCheck,
    accentColor: "text-lime-600 bg-lime-100 dark:bg-lime-900/30",
    featureKey: "class_tests",
  },
  {
    label: "Publish & Finalize",
    description:
      "Flip online visibility for students/parents, then snapshot official marksheet PDFs that survive later edits.",
    href: "/admin/exams/publish",
    icon: Lock,
    accentColor: "text-slate-600 bg-slate-100 dark:bg-slate-900/30",
    featureKey: "publish_results",
  },
];

export default function AdminExamsHubPage() {
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [permissions, setPermissions] = useState<Set<FeatureKey> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          const role = (data?.role as UserRole) ?? null;
          setUserRole(role);
          if (role === "editor") {
            supabase
              .from("editor_permissions")
              .select("feature_key")
              .eq("editor_id", user.id)
              .then(({ data: rows }) => {
                setPermissions(
                  new Set<FeatureKey>(
                    (rows ?? []).map((r) => r.feature_key as FeatureKey)
                  )
                );
              });
          } else {
            setPermissions(new Set());
          }
        });
    });
  }, []);

  const visibleTiles = tiles.filter((t) => {
    if (t.adminOnly && userRole !== "admin") return false;
    if (userRole === "editor") {
      return t.featureKey ? permissions?.has(t.featureKey) : true;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-navy-900 dark:text-white">
          Exams
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Everything related to examinations — types, schedules, marks, results,
          and report cards.
        </p>
      </div>

      {userRole === "editor" && permissions === null ? (
        <div className="flex items-center justify-center h-40">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-navy-900 border-t-transparent" />
        </div>
      ) : visibleTiles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            You don&apos;t have access to any exam features yet. Ask an admin to
            grant permissions.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleTiles.map((tile) => {
            const Icon = tile.icon;
            return (
              <Link
                key={tile.href}
                href={tile.href}
                className={cn(
                  "group rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-card p-5",
                  "transition-all hover:border-gold-500/60 hover:shadow-md hover:-translate-y-0.5"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div
                    className={cn(
                      "h-10 w-10 rounded-xl flex items-center justify-center",
                      tile.accentColor
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-300 dark:text-gray-600 group-hover:text-navy-900 dark:group-hover:text-white transition-colors" />
                </div>
                <h3 className="mt-4 font-heading text-base font-semibold text-navy-900 dark:text-white">
                  {tile.label}
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
                  {tile.description}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
