"use client";

import {
  LayoutDashboard,
  Users,
  UserCheck,
  GraduationCap,
  BookOpen,
  CreditCard,
  Calendar,
  CheckSquare,
  CalendarDays,
  ClipboardList,
  Clock,
  FileText,
  MessageSquare,
  UserCog,
  Sparkles,
  CalendarClock,
  IdCard,
  ClipboardCheck,
  Settings2,
  Lock,
  RefreshCw,
  BarChart3,
} from "lucide-react";
import {
  SidebarShell,
  type SidebarItem,
} from "@/components/admin/SidebarShell";

const erpItems: SidebarItem[] = [
  { kind: "link", icon: LayoutDashboard, label: "Dashboard", href: "/erp" },
  {
    kind: "group",
    icon: Users,
    label: "People",
    landingHref: "/erp/people",
    children: [
      { kind: "link", icon: Users, label: "Users", href: "/erp/people/users" },
      { kind: "link", icon: UserCheck, label: "Students", href: "/erp/people/students" },
      { kind: "link", icon: UserCog, label: "Staff", href: "/erp/people/staff" },
    ],
  },
  {
    kind: "group",
    icon: GraduationCap,
    label: "Academics",
    landingHref: "/erp/academics",
    children: [
      { kind: "link", icon: GraduationCap, label: "Classes", href: "/erp/academics/classes" },
      { kind: "link", icon: BookOpen, label: "Subjects", href: "/erp/academics/subjects" },
      { kind: "link", icon: CalendarDays, label: "Academic Years", href: "/erp/academics/years" },
      { kind: "link", icon: Sparkles, label: "Non-Scholastic Classes", href: "/erp/exams/non-scholastic-assessments" },
    ],
  },
  {
    kind: "group",
    icon: ClipboardList,
    label: "Exams",
    landingHref: "/erp/exams",
    children: [
      {
        kind: "group",
        icon: Settings2,
        label: "Master",
        landingHref: "/erp/exams",
        hideOverview: true,
        children: [
          { kind: "link", icon: GraduationCap, label: "Grade Master", href: "/erp/exams/grade-master" },
          { kind: "link", icon: ClipboardCheck, label: "Result Master", href: "/erp/exams/result-master" },
          { kind: "link", icon: Sparkles, label: "Non-Scholastic Masters", href: "/erp/exams/non-scholastic-masters" },
        ],
      },
      { kind: "link", icon: ClipboardList, label: "Exam Types", href: "/erp/exams/types" },
      { kind: "link", icon: CalendarClock, label: "Timetable", href: "/erp/exams/timetable" },
      { kind: "link", icon: IdCard, label: "Admit Cards", href: "/erp/exams/admit-cards" },
      { kind: "link", icon: ClipboardCheck, label: "Class Tests", href: "/erp/exams/class-tests" },
      { kind: "link", icon: FileText, label: "Header / Footer", href: "/erp/exams/header-footer" },
      { kind: "link", icon: BarChart3, label: "Results", href: "/erp/exams/results" },
      { kind: "link", icon: Lock, label: "Publish & Finalize", href: "/erp/exams/publish" },
      { kind: "link", icon: MessageSquare, label: "PTM Notes", href: "/erp/exams/ptm-notes" },
      { kind: "link", icon: FileText, label: "PTM Format", href: "/erp/exams/ptm-format" },
      { kind: "link", icon: RefreshCw, label: "Supplementary Exams", href: "/erp/exams/supplementary" },
      {
        kind: "group",
        icon: FileText,
        label: "Sheets & Prints",
        landingHref: "/erp/exams",
        hideOverview: true,
        children: [
          { kind: "link", icon: FileText, label: "Blank Marks List", href: "/erp/exams/blank-marks-list" },
          { kind: "link", icon: FileText, label: "White Sheet", href: "/erp/exams/white-sheet" },
          { kind: "link", icon: FileText, label: "Green Sheet", href: "/erp/exams/green-sheet" },
        ],
      },
    ],
  },
  { kind: "link", icon: CreditCard, label: "Fees", href: "/erp/fees" },
  { kind: "link", icon: Clock, label: "Timetable", href: "/erp/timetable" },
  { kind: "link", icon: Calendar, label: "Calendar", href: "/erp/calendar" },
  { kind: "link", icon: CheckSquare, label: "Attendance", href: "/erp/attendance" },
];

const EDITOR_ALWAYS_ALLOWED = new Set(["/erp"]);
const PENDING_REGISTRATION_BADGE_HREFS = new Set(["/erp/people/users"]);

export function ErpSidebar() {
  return (
    <SidebarShell
      sections={[{ label: "ERP", items: erpItems }]}
      headerTitle="NKPS ERP"
      headerSubtitle="Operations"
      editorAlwaysAllowedHrefs={EDITOR_ALWAYS_ALLOWED}
      pendingRegistrationBadgeHrefs={PENDING_REGISTRATION_BADGE_HREFS}
      settingsHref="/portal/settings?from=erp"
    />
  );
}
