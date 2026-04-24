"use client";

import {
  LayoutDashboard,
  ClipboardCheck,
  BarChart3,
  Clock,
  Users,
  CalendarDays,
  Sparkles,
} from "lucide-react";
import { PortalSidebar } from "./PortalSidebar";

const navLinks = [
  {
    href: "/teacher",
    label: "Dashboard",
    icon: <LayoutDashboard className="h-5 w-5 shrink-0" />,
  },
  {
    href: "/teacher/attendance",
    label: "Attendance",
    icon: <ClipboardCheck className="h-5 w-5 shrink-0" />,
  },
  {
    href: "/teacher/results",
    label: "Results",
    icon: <BarChart3 className="h-5 w-5 shrink-0" />,
  },
  {
    href: "/teacher/non-scholastic",
    label: "Non-Scholastic",
    icon: <Sparkles className="h-5 w-5 shrink-0" />,
  },
  {
    href: "/teacher/timetable",
    label: "Timetable",
    icon: <Clock className="h-5 w-5 shrink-0" />,
  },
  {
    href: "/teacher/students",
    label: "Students",
    icon: <Users className="h-5 w-5 shrink-0" />,
  },
  {
    href: "/teacher/calendar",
    label: "Calendar",
    icon: <CalendarDays className="h-5 w-5 shrink-0" />,
  },
];

export function TeacherSidebar() {
  return (
    <PortalSidebar title="Teacher Portal" role="Teacher" navLinks={navLinks} />
  );
}
