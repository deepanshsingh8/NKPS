"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/types";
import { FEATURE_CATALOG, type FeatureKey } from "@/lib/permissions";
import {
  LayoutDashboard,
  Image as ImageIcon,
  FileText,
  MessageSquare,
  Layers,
  Users,
  UserCheck,
  GraduationCap,
  BookOpen,
  CreditCard,
  Calendar,
  CheckSquare,
  BarChart3,
  CalendarDays,
  ClipboardList,
  Clock,
  ChevronLeft,
  ScrollText,
  UserCog,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SidebarProfileMenu } from "@/components/portal/SidebarProfileMenu";
import { SidebarTooltip } from "@/components/portal/SidebarTooltip";
import { useSidebar } from "@/components/providers/SidebarProvider";
import { useUnreadCount } from "@/hooks/useUnreadCount";

const contentLinks = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/admin" },
  { icon: ImageIcon, label: "Gallery", href: "/admin/gallery" },
  { icon: FileText, label: "Transfer Certificates", href: "/admin/transfer-certificates" },
  { icon: MessageSquare, label: "Contact Messages", href: "/admin/contact" },
  { icon: Layers, label: "Site Media", href: "/admin/site-media" },
  { icon: ScrollText, label: "Disclosure", href: "/admin/disclosure" },
];

const erpLinks = [
  { icon: Users, label: "Users", href: "/admin/users" },
  { icon: UserCog, label: "Staff", href: "/admin/staff" },
  { icon: UserCheck, label: "Students", href: "/admin/students" },
  { icon: GraduationCap, label: "Classes", href: "/admin/classes" },
  { icon: BookOpen, label: "Subjects", href: "/admin/subjects" },
  { icon: CalendarDays, label: "Academic Years", href: "/admin/academic-years" },
  { icon: ClipboardList, label: "Exam Types", href: "/admin/exam-types" },
  { icon: CreditCard, label: "Fees", href: "/admin/fees" },
  { icon: Clock, label: "Timetable", href: "/admin/timetable" },
  { icon: Calendar, label: "Calendar", href: "/admin/calendar" },
  { icon: CheckSquare, label: "Attendance", href: "/admin/attendance" },
  { icon: BarChart3, label: "Results", href: "/admin/results" },
];

// Dashboard is always allowed for editors regardless of feature permissions.
const EDITOR_ALWAYS_ALLOWED_HREFS = new Set(["/admin"]);

// Map admin href → feature_key for the sidebar filter.
const HREF_TO_FEATURE_KEY: Record<string, FeatureKey> = Object.fromEntries(
  FEATURE_CATALOG.map((f) => [f.href, f.key])
);

export function AdminSidebar() {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebar();
  const { unreadCount, pendingRegistrationCount } = useUnreadCount();
  const [userRole, setUserRole] = useState<UserRole>("admin");
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
          if (!data?.role) return;
          const role = data.role as UserRole;
          setUserRole(role);
          if (role === "editor") {
            supabase
              .from("editor_permissions")
              .select("feature_key")
              .eq("editor_id", user.id)
              .then(({ data: rows }) => {
                const keys = new Set<FeatureKey>(
                  (rows ?? []).map((r) => r.feature_key as FeatureKey)
                );
                setPermissions(keys);
              });
          } else {
            setPermissions(new Set());
          }
        });
    });
  }, []);

  const isEditor = userRole === "editor";

  const isEditorAllowed = (href: string): boolean => {
    if (EDITOR_ALWAYS_ALLOWED_HREFS.has(href)) return true;
    const key = HREF_TO_FEATURE_KEY[href];
    if (!key) return false;
    return permissions?.has(key) ?? false;
  };

  // Hide everything until permissions load to avoid flash of forbidden links.
  const editorReady = !isEditor || permissions !== null;

  const visibleContentLinks = !editorReady
    ? []
    : isEditor
    ? contentLinks.filter((l) => isEditorAllowed(l.href))
    : contentLinks;

  const visibleErpLinks = !editorReady
    ? []
    : isEditor
    ? erpLinks.filter((l) => isEditorAllowed(l.href))
    : erpLinks;

  const renderLink = ({ icon: Icon, label, href }: (typeof contentLinks)[0]) => {
    const isActive =
      href === "/admin"
        ? pathname === "/admin"
        : pathname.startsWith(href);

    const badgeCount =
      href === "/admin/contact" ? unreadCount
      : href === "/admin/users" ? pendingRegistrationCount
      : 0;
    const showBadge = badgeCount > 0;
    const badgeLabel = badgeCount > 99 ? "99+" : badgeCount;

    const linkContent = (
      <Link
        href={href}
        className={cn(
          "flex items-center gap-3 rounded-lg text-sm transition-all duration-200 relative",
          collapsed ? "px-2.5 py-2.5 justify-center" : "px-3 py-2.5",
          isActive
            ? "bg-white/10 text-white font-semibold border-l-[3px] border-gold-500"
            : "text-white/60 hover:bg-white/5 hover:text-white hover:translate-x-0.5"
        )}
      >
        <span className="relative">
          <Icon className="h-5 w-5 shrink-0" />
          {showBadge && collapsed && (
            <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center bg-red-500 text-white text-[9px] font-bold rounded-full h-4 min-w-4 px-1">
              {badgeLabel}
            </span>
          )}
        </span>
        {!collapsed && (
          <>
            <span className="truncate">{label}</span>
            {showBadge && (
              <span className="ml-auto flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full h-5 min-w-5 px-1.5">
                {badgeLabel}
              </span>
            )}
          </>
        )}
      </Link>
    );

    if (collapsed) {
      return (
        <SidebarTooltip key={href} label={showBadge ? `${label} (${badgeCount})` : label}>
          {linkContent}
        </SidebarTooltip>
      );
    }

    return <div key={href}>{linkContent}</div>;
  };

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 h-screen bg-navy-900 flex flex-col z-40 transition-all duration-300 ease-in-out",
        collapsed ? "w-[72px]" : "w-64"
      )}
    >
      {/* Header */}
      <div className={cn("p-4 flex items-center", collapsed ? "justify-center" : "gap-3 px-6")}>
        {!collapsed && (
          <>
            <Image
              src="/images/logo.png"
              alt="NKPS Logo"
              width={36}
              height={36}
              className="rounded-full shrink-0"
            />
            <div className="min-w-0 flex-1">
              <h1 className="font-heading text-xl font-bold text-white truncate">
                NKPS ERP
              </h1>
              <p className="text-sm text-gold-500 mt-0.5">Admin</p>
            </div>
            <button
              onClick={toggle}
              className="flex items-center justify-center h-7 w-7 rounded-lg text-white/40 hover:bg-white/5 hover:text-white transition-colors shrink-0"
              title="Collapse sidebar"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </>
        )}
        {collapsed && (
          <button
            onClick={toggle}
            className="flex items-center justify-center h-8 w-8 rounded-lg hover:bg-white/5 transition-colors"
            title="Expand sidebar"
          >
            <Image
              src="/images/logo.png"
              alt="NKPS Logo"
              width={32}
              height={32}
              className="rounded-full"
            />
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="px-6 mb-2">
          <div className="h-0.5 w-12 bg-gold-500 rounded-full" />
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 min-h-0 px-2 overflow-y-auto">
        <div className="mb-1">
          {!collapsed && (
            <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">
              Content
            </p>
          )}
          {collapsed && <div className="h-px bg-white/10 mx-2 mb-2" />}
          <div className="space-y-0.5">
            {visibleContentLinks.map(renderLink)}
          </div>
        </div>

        {visibleErpLinks.length > 0 && (
          <div className="mt-4 pb-2">
            {!collapsed && (
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                ERP
              </p>
            )}
            {collapsed && <div className="h-px bg-white/10 mx-2 mb-2 mt-3" />}
            <div className="space-y-0.5">
              {visibleErpLinks.map(renderLink)}
            </div>
          </div>
        )}
      </nav>

      <SidebarProfileMenu settingsHref="/portal/settings" collapsed={collapsed} />
    </aside>
  );
}
