"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Image as ImageIcon,
  FileText,
  MessageSquare,
  Users,
  GraduationCap,
  TrendingUp,
  Calendar,
  ArrowRight,
  ClipboardCheck,
} from "lucide-react";
import { adminFetch } from "@/lib/admin-api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { DashboardAnalytics } from "@/components/admin/DashboardAnalytics";
import { EVENT_TYPE_LABELS, EVENT_TYPE_COLORS } from "@/lib/constants/calendar";
import type { CalendarEventType } from "@/types";

interface Stats {
  galleryCount: number;
  tcCount: number;
  unreadCount: number;
  totalUsers: number;
  totalStudents: number;
  totalTeachers: number;
  pendingRegistrations: number;
}

interface UpcomingEvent {
  id: string;
  title: string;
  description: string | null;
  event_type: CalendarEventType;
  start_date: string;
  end_date: string | null;
}

const statCardConfig = [
  {
    key: "totalUsers",
    label: "Total Users",
    icon: Users,
    iconBg: "bg-violet-100 dark:bg-violet-900/30",
    iconColor: "text-violet-600",
    accent: "from-violet-500/10 to-transparent",
  },
  {
    key: "totalStudents",
    label: "Students",
    icon: GraduationCap,
    iconBg: "bg-blue-100 dark:bg-blue-900/30",
    iconColor: "text-blue-600",
    accent: "from-blue-500/10 to-transparent",
  },
  {
    key: "totalTeachers",
    label: "Teachers",
    icon: Users,
    iconBg: "bg-emerald-100 dark:bg-emerald-900/30",
    iconColor: "text-emerald-600",
    accent: "from-emerald-500/10 to-transparent",
  },
  {
    key: "galleryCount",
    label: "Gallery Images",
    icon: ImageIcon,
    iconBg: "bg-amber-100 dark:bg-amber-900/30",
    iconColor: "text-amber-600",
    accent: "from-amber-500/10 to-transparent",
  },
  {
    key: "tcCount",
    label: "Transfer Certificates",
    icon: FileText,
    iconBg: "bg-gold-300/30 dark:bg-gold-500/20",
    iconColor: "text-gold-600",
    accent: "from-gold-500/10 to-transparent",
  },
  {
    key: "unreadCount",
    label: "Unread Messages",
    icon: MessageSquare,
    iconBg: "bg-rose-100 dark:bg-rose-900/30",
    iconColor: "text-rose-600",
    accent: "from-rose-500/10 to-transparent",
  },
  {
    key: "pendingRegistrations",
    label: "Pending Registrations",
    icon: ClipboardCheck,
    iconBg: "bg-orange-100 dark:bg-orange-900/30",
    iconColor: "text-orange-600",
    accent: "from-orange-500/10 to-transparent",
  },
] as const;

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await adminFetch("/api/admin/dashboard");
        const data = await res.json();

        if (res.ok) {
          setStats(data.stats);
          setUpcomingEvents(data.upcomingEvents ?? []);
        }
      } catch {
        // Silently fail — dashboard will show empty state
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const formatEventDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    return {
      day: d.getDate(),
      month: d.toLocaleDateString("en-IN", { month: "short" }),
    };
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="h-9 w-9 rounded-xl bg-navy-900 flex items-center justify-center">
            <TrendingUp className="h-4.5 w-4.5 text-gold-400" />
          </div>
          <h1 className="erp-page-title">Dashboard</h1>
        </div>
        <p className="erp-page-subtitle ml-12">
          Overview of your school management system
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {statCardConfig.map(({ key, label, icon: Icon, iconBg, iconColor, accent }) => (
          <div
            key={key}
            className="erp-stat-card relative overflow-hidden group"
          >
            <div className={cn("absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl rounded-bl-full opacity-60", accent)} />
            <div className="relative flex items-center gap-4">
              <div
                className={cn(
                  "h-12 w-12 rounded-xl flex items-center justify-center transition-transform duration-200 group-hover:scale-105",
                  iconBg
                )}
              >
                <Icon className={cn("h-5.5 w-5.5", iconColor)} />
              </div>
              <div>
                {loading ? (
                  <div className="h-8 w-16 bg-gray-100 dark:bg-muted rounded-lg animate-pulse" />
                ) : (
                  <p className="text-3xl font-bold text-navy-900 dark:text-white tracking-tight">
                    {stats?.[key] ?? 0}
                  </p>
                )}
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Analytics */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-5 w-5 text-gray-400" />
          <h2 className="erp-section-title">Analytics</h2>
        </div>
        <DashboardAnalytics />
      </div>

      {/* Upcoming Events */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-gray-400" />
            <h2 className="erp-section-title">Upcoming Events</h2>
          </div>
          <Link
            href="/admin/calendar"
            className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            View All
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-white dark:bg-card rounded-xl border border-gray-200/80 dark:border-border p-4 animate-pulse"
              >
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 bg-gray-100 dark:bg-muted rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-40 bg-gray-100 dark:bg-muted rounded" />
                    <div className="h-3 w-24 bg-gray-50 dark:bg-muted rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : upcomingEvents.length === 0 ? (
          <div className="erp-empty-state bg-white dark:bg-card rounded-2xl border border-gray-200/80 dark:border-border">
            <Calendar className="h-10 w-10 text-gray-300 mb-3" />
            <p className="text-sm text-gray-400">No upcoming events scheduled</p>
          </div>
        ) : (
          <div className="space-y-3">
            {upcomingEvents.map((evt) => {
              const { day, month } = formatEventDate(evt.start_date);
              return (
                <div
                  key={evt.id}
                  className="bg-white dark:bg-card rounded-xl border border-gray-200/80 dark:border-border p-4 transition-all duration-200 hover:shadow-sm"
                >
                  <div className="flex items-center gap-4">
                    {/* Date block */}
                    <div className="h-12 w-12 rounded-xl bg-navy-900/5 dark:bg-white/5 flex flex-col items-center justify-center shrink-0">
                      <span className="text-lg font-bold leading-none text-navy-900 dark:text-white">
                        {day}
                      </span>
                      <span className="text-[10px] font-medium uppercase text-gray-500 dark:text-gray-400 mt-0.5">
                        {month}
                      </span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="font-semibold text-navy-900 dark:text-white text-sm truncate">
                          {evt.title}
                        </p>
                        <Badge
                          className={cn(
                            "text-[10px] px-1.5 py-0 shrink-0",
                            EVENT_TYPE_COLORS[evt.event_type] ?? EVENT_TYPE_COLORS.other
                          )}
                        >
                          {EVENT_TYPE_LABELS[evt.event_type] ?? evt.event_type}
                        </Badge>
                      </div>
                      {evt.description && (
                        <p className="text-xs text-gray-400 truncate">
                          {evt.description}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
