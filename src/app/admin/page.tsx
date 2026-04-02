"use client";

import { useEffect, useState } from "react";
import {
  Image as ImageIcon,
  FileText,
  MessageSquare,
  Users,
  GraduationCap,
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

  const statCards = [
    {
      label: "Total Users",
      count: stats?.totalUsers ?? 0,
      icon: Users,
      color: "bg-purple-100 text-purple-600",
    },
    {
      label: "Students",
      count: stats?.totalStudents ?? 0,
      icon: GraduationCap,
      color: "bg-blue-100 text-blue-600",
    },
    {
      label: "Teachers",
      count: stats?.totalTeachers ?? 0,
      icon: Users,
      color: "bg-indigo-100 text-indigo-600",
    },
    {
      label: "Gallery Images",
      count: stats?.galleryCount ?? 0,
      icon: ImageIcon,
      color: "bg-amber-100 text-amber-600",
    },
    {
      label: "Transfer Certificates",
      count: stats?.tcCount ?? 0,
      icon: FileText,
      color: "bg-gold-300/30 text-gold-600",
    },
    {
      label: "Unread Messages",
      count: stats?.unreadCount ?? 0,
      icon: MessageSquare,
      color: "bg-green-100 text-green-600",
    },
  ];

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-navy-900 mb-6">
        Dashboard
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {statCards.map(({ label, count, icon: Icon, color }) => (
          <div
            key={label}
            className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200"
          >
            <div className="flex items-center gap-4">
              <div
                className={cn(
                  "h-12 w-12 rounded-full flex items-center justify-center",
                  color
                )}
              >
                <Icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-3xl font-bold text-navy-900">
                  {loading ? "..." : count}
                </p>
                <p className="text-sm text-gray-600">{label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div>
        <h2 className="font-heading text-lg font-semibold text-navy-900 mb-4">
          Recent Contact Messages
        </h2>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 animate-pulse h-20"
              />
            ))}
          </div>
        ) : recentMessages.length === 0 ? (
          <p className="text-gray-500 text-sm">No contact messages yet.</p>
        ) : (
          <div className="space-y-3">
            {recentMessages.map((msg) => (
              <div
                key={msg.id}
                className="bg-white rounded-xl p-4 shadow-sm border border-gray-200"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-navy-900">
                      {msg.full_name}
                    </p>
                    {!msg.is_read && (
                      <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-xs">
                        New
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(msg.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-sm font-medium text-gray-700">
                  {msg.subject}
                </p>
                <p className="text-sm text-gray-500">{msg.email}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
