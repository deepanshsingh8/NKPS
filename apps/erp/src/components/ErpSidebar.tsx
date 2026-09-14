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
  Bus,
  Banknote,
  GitPullRequestArrow,
  MapPin,
  ReceiptText,
  Home,
  FileSpreadsheet,
  UserPlus,
  LayoutGrid,
  TriangleAlert,
} from "lucide-react";
import {
  SidebarShell,
  type SidebarSection,
} from "@nkps/shared/components/SidebarShell";
import { AppSwitcher } from "@nkps/shared/components/AppSwitcher";
import { useSidebar } from "@nkps/shared/components/providers/SidebarProvider";

// The ERP has around sixty destinations. It used to declare all of them under a
// single section whose label was, literally, "ERP" — which is not a category,
// it is the name of the thing you are already inside. On a phone that produced
// one undifferentiated scroll.
//
// These six headings are the actual shape of the work: who is enrolled, what is
// taught, what is examined, what is run day to day, and what it all adds up to.
// Every href is unchanged — this is a reorganisation of the menu, not of the
// app — which also keeps scripts/check-guide-coverage.mjs passing.
const erpSections: SidebarSection[] = [
  {
    // Attendance sits up here rather than under Operations on purpose: it is
    // the one screen that gets opened every single morning.
    label: "Overview",
    items: [
      { kind: "link", icon: LayoutDashboard, label: "Dashboard", href: "/" },
      { kind: "link", icon: CheckSquare, label: "Attendance", href: "/attendance" },
      { kind: "link", icon: Calendar, label: "Calendar", href: "/calendar" },
    ],
  },
  {
    label: "People",
    items: [
      { kind: "link", icon: LayoutGrid, label: "Overview", href: "/people" },
      { kind: "link", icon: UserCheck, label: "Students", href: "/people/students" },
      { kind: "link", icon: UserPlus, label: "Registrations", href: "/registrations" },
      { kind: "link", icon: UserCog, label: "Staff", href: "/people/staff" },
      { kind: "link", icon: GraduationCap, label: "Teachers", href: "/people/teachers" },
      { kind: "link", icon: Users, label: "Users", href: "/people/users" },
    ],
  },
  {
    label: "Academics",
    items: [
      { kind: "link", icon: LayoutGrid, label: "Overview", href: "/academics" },
      { kind: "link", icon: GraduationCap, label: "Classes", href: "/academics/classes" },
      { kind: "link", icon: BookOpen, label: "Subjects & Assignments", href: "/academics/subjects" },
      { kind: "link", icon: BookOpen, label: "XI–XII Electives", href: "/academics/electives" },
      { kind: "link", icon: CalendarDays, label: "Academic Years", href: "/academics/years" },
      { kind: "link", icon: Home, label: "Houses", href: "/academics/houses" },
      { kind: "link", icon: Sparkles, label: "Non-Scholastic Classes", href: "/exams/non-scholastic-assessments" },
    ],
  },
  {
    label: "Examinations",
    items: [
      { kind: "link", icon: LayoutGrid, label: "Overview", href: "/exams" },
      {
        // The four screens you configure once a year and then leave alone,
        // folded away from the ones you open every exam cycle.
        kind: "group",
        icon: Settings2,
        label: "Masters",
        landingHref: "/exams",
        hideOverview: true,
        children: [
          { kind: "link", icon: GraduationCap, label: "Grade Master", href: "/exams/grade-master" },
          { kind: "link", icon: ClipboardCheck, label: "Result Master", href: "/exams/result-master" },
          { kind: "link", icon: Sparkles, label: "Non-Scholastic Masters", href: "/exams/non-scholastic-masters" },
          { kind: "link", icon: FileText, label: "Header / Footer", href: "/exams/header-footer" },
        ],
      },
      { kind: "link", icon: ClipboardList, label: "Exam Types", href: "/exams/types" },
      { kind: "link", icon: CalendarClock, label: "Exam Timetable", href: "/exams/timetable" },
      { kind: "link", icon: IdCard, label: "Admit Cards", href: "/exams/admit-cards" },
      { kind: "link", icon: ClipboardCheck, label: "Class Tests", href: "/exams/class-tests" },
      { kind: "link", icon: BarChart3, label: "Results", href: "/exams/results" },
      { kind: "link", icon: Lock, label: "Publish & Finalize", href: "/exams/publish" },
      { kind: "link", icon: RefreshCw, label: "Supplementary Exams", href: "/exams/supplementary" },
      { kind: "link", icon: MessageSquare, label: "PTM Notes", href: "/exams/ptm-notes" },
      { kind: "link", icon: FileText, label: "PTM Format", href: "/exams/ptm-format" },
      {
        kind: "group",
        icon: FileText,
        label: "Sheets & Prints",
        landingHref: "/exams",
        hideOverview: true,
        children: [
          { kind: "link", icon: FileText, label: "Blank Marks List", href: "/exams/blank-marks-list" },
          { kind: "link", icon: FileText, label: "White Sheet", href: "/exams/white-sheet" },
          { kind: "link", icon: FileText, label: "Green Sheet", href: "/exams/green-sheet" },
        ],
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        kind: "group",
        icon: CreditCard,
        label: "Fees",
        landingHref: "/fees/academic",
        hideOverview: true,
        children: [
          { kind: "link", icon: CreditCard, label: "Academic", href: "/fees/academic" },
          { kind: "link", icon: Banknote, label: "Payment Management", href: "/fees/payments" },
          { kind: "link", icon: ReceiptText, label: "Dues & No-Dues", href: "/fees/dues" },
          { kind: "link", icon: GitPullRequestArrow, label: "Change Requests", href: "/fees/change-requests" },
        ],
      },
      {
        kind: "group",
        icon: Bus,
        label: "Transport",
        landingHref: "/transport",
        children: [
          { kind: "link", icon: MapPin, label: "Stops & Fees", href: "/transport/stops" },
          { kind: "link", icon: Bus, label: "Buses & Routes", href: "/transport/buses" },
          { kind: "link", icon: UserCog, label: "Drivers", href: "/transport/drivers" },
          { kind: "link", icon: UserCheck, label: "Student Assignments", href: "/transport/assignments" },
          { kind: "link", icon: GitPullRequestArrow, label: "Change Requests", href: "/transport/changes" },
        ],
      },
      {
        kind: "group",
        icon: Clock,
        label: "Timetable",
        landingHref: "/timetable",
        children: [
          { kind: "link", icon: Clock, label: "Class Timetable", href: "/timetable" },
          { kind: "link", icon: UserCog, label: "Teacher Timetable", href: "/timetable/teachers" },
          { kind: "link", icon: RefreshCw, label: "Substitutions", href: "/timetable/substitutions" },
      { kind: "link", icon: TriangleAlert, label: "Clash Check", href: "/timetable/clashes" },
          { kind: "link", icon: Sparkles, label: "Auto Generate", href: "/timetable/generate" },
          { kind: "link", icon: FileSpreadsheet, label: "Import from Excel", href: "/timetable/import" },
          { kind: "link", icon: FileText, label: "Period Templates", href: "/timetable/templates" },
        ],
      },
    ],
  },
  {
    label: "Insights",
    items: [
      { kind: "link", icon: LayoutGrid, label: "Overview", href: "/reports" },
      // First in the list on purpose: it is the fastest route to an answer, and
      // for a long time the page had no sidebar entry at all — the only way in
      // was a card on /reports, so anyone who did not scroll never found it.
      { kind: "link", icon: Sparkles, label: "Ask your school", href: "/reports/ask" },
      { kind: "link", icon: UserCheck, label: "Student Report", href: "/reports/students" },
      { kind: "link", icon: ReceiptText, label: "Fee Report", href: "/reports/students?focus=fees" },
      { kind: "link", icon: CheckSquare, label: "Attendance Report", href: "/reports/students?focus=attendance" },
      { kind: "link", icon: BarChart3, label: "Result Report", href: "/reports/students?focus=results" },
    ],
  },
];

const EDITOR_ALWAYS_ALLOWED = new Set(["/"]);
const PENDING_REGISTRATION_BADGE_HREFS = new Set(["/people/users"]);
const PENDING_FEE_CHANGE_REQUEST_BADGE_HREFS = new Set(["/fees/change-requests"]);
const PENDING_TRANSPORT_CHANGE_BADGE_HREFS = new Set(["/transport/changes"]);

export function ErpSidebar() {
  const { collapsed } = useSidebar();
  return (
    <SidebarShell
      sections={erpSections}
      headerTitle="NKPS ERP"
      headerSubtitle="Operations"
      editorAlwaysAllowedHrefs={EDITOR_ALWAYS_ALLOWED}
      pendingRegistrationBadgeHrefs={PENDING_REGISTRATION_BADGE_HREFS}
      pendingFeeChangeRequestBadgeHrefs={PENDING_FEE_CHANGE_REQUEST_BADGE_HREFS}
      pendingTransportChangeBadgeHrefs={PENDING_TRANSPORT_CHANGE_BADGE_HREFS}
      settingsHref="/portal/settings?from=erp"
      logoutRedirect="/login"
      footerExtra={<AppSwitcher scope="erp-admin" collapsed={collapsed} />}
    />
  );
}
