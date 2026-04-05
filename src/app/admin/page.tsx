"use client";

import { useEffect, useState } from "react";
import {
  Image as ImageIcon,
  FileText,
  MessageSquare,
  Users,
  GraduationCap,
  TrendingUp,
  Mail,
} from "lucide-react";
import { adminFetch } from "@/lib/admin-api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { ContactSubmission } from "@/types";

interface Stats {
  galleryCount: number;
  tcCount: number;
  unreadCount: number;
  totalUsers: number;
  totalStudents: number;
  totalTeachers: number;
}

const statCardConfig = [
  {
    key: "totalUsers",
    label: "Total Users",
    icon: Users,
    iconBg: "bg-violet-100",
    iconColor: "text-violet-600",
    accent: "from-violet-500/10 to-transparent",
  },
  {
    key: "totalStudents",
    label: "Students",
    icon: GraduationCap,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    accent: "from-blue-500/10 to-transparent",
  },
  {
    key: "totalTeachers",
    label: "Teachers",
    icon: Users,
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-600",
    accent: "from-emerald-500/10 to-transparent",
  },
  {
    key: "galleryCount",
    label: "Gallery Images",
    icon: ImageIcon,
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
    accent: "from-amber-500/10 to-transparent",
  },
  {
    key: "tcCount",
    label: "Transfer Certificates",
    icon: FileText,
    iconBg: "bg-gold-300/30",
    iconColor: "text-gold-600",
    accent: "from-gold-500/10 to-transparent",
  },
  {
    key: "unreadCount",
    label: "Unread Messages",
    icon: MessageSquare,
    iconBg: "bg-rose-100",
    iconColor: "text-rose-600",
    accent: "from-rose-500/10 to-transparent",
  },
] as const;

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentMessages, setRecentMessages] = useState<ContactSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await adminFetch("/api/admin/dashboard");
        const data = await res.json();

        if (res.ok) {
          setStats(data.stats);
          setRecentMessages(data.recentMessages ?? []);
        }
      } catch {
        // Silently fail — dashboard will show empty state
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

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
            {/* Subtle gradient accent */}
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
                  <div className="h-8 w-16 bg-gray-100 rounded-lg animate-pulse" />
                ) : (
                  <p className="text-3xl font-bold text-navy-900 tracking-tight">
                    {stats?.[key] ?? 0}
                  </p>
                )}
                <p className="text-sm text-gray-500 mt-0.5">{label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Messages */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Mail className="h-5 w-5 text-gray-400" />
          <h2 className="erp-section-title">Recent Contact Messages</h2>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-white rounded-xl border border-gray-200/80 p-5 animate-pulse"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-gray-100 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 bg-gray-100 rounded" />
                    <div className="h-3 w-48 bg-gray-50 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : recentMessages.length === 0 ? (
          <div className="erp-empty-state bg-white rounded-2xl border border-gray-200/80">
            <MessageSquare className="h-10 w-10 text-gray-300 mb-3" />
            <p className="text-sm text-gray-400">No contact messages yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentMessages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "bg-white rounded-xl border p-5 transition-all duration-200 hover:shadow-sm cursor-default",
                  !msg.is_read
                    ? "border-blue-200/80 bg-blue-50/30"
                    : "border-gray-200/80"
                )}
              >
                <div className="flex items-start gap-4">
                  {/* Avatar circle */}
                  <div className={cn(
                    "h-10 w-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0",
                    !msg.is_read
                      ? "bg-blue-100 text-blue-700"
                      : "bg-gray-100 text-gray-500"
                  )}>
                    {msg.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-navy-900 text-sm">
                          {msg.full_name}
                        </p>
                        {!msg.is_read && (
                          <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0">
                            New
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-gray-400 shrink-0 ml-2">
                        {new Date(msg.created_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-gray-700 truncate">
                      {msg.subject}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{msg.email}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
