"use client";

import { useEffect, useState } from "react";
import {
  CheckSquare,
  CreditCard,
  GraduationCap,
  UserPlus,
} from "lucide-react";
import { adminFetch } from "@/lib/admin-api";
import { cn } from "@/lib/utils";

interface AttendanceSummary {
  present: number;
  absent: number;
  late: number;
  total: number;
  percentage: number;
}

interface FeeCollection {
  collected: number;
  expected: number;
  percentage: number;
}

interface EnrollmentItem {
  name: string;
  count: number;
}

interface AdmissionTrend {
  month: string;
  count: number;
}

interface AnalyticsData {
  attendance: AttendanceSummary;
  feeCollection: FeeCollection;
  enrollmentByClass: EnrollmentItem[];
  admissionTrend: AdmissionTrend[];
  hasAcademicYear: boolean;
}

function formatCurrency(amount: number) {
  if (amount >= 100000) return `${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(1)}K`;
  return amount.toLocaleString("en-IN");
}

function SkeletonCard() {
  return (
    <div className="erp-stat-card animate-pulse">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-xl bg-gray-100 dark:bg-muted" />
        <div className="h-4 w-32 rounded bg-gray-100 dark:bg-muted" />
      </div>
      <div className="space-y-3">
        <div className="h-3 w-full rounded bg-gray-100 dark:bg-muted" />
        <div className="h-3 w-3/4 rounded bg-gray-100 dark:bg-muted" />
        <div className="h-3 w-1/2 rounded bg-gray-100 dark:bg-muted" />
      </div>
    </div>
  );
}

export function DashboardAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const res = await adminFetch("/api/admin/dashboard/analytics");
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!data) return null;

  const maxEnrollment = Math.max(...data.enrollmentByClass.map((e) => e.count), 1);
  const maxAdmission = Math.max(...data.admissionTrend.map((a) => a.count), 1);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {/* Attendance Overview */}
      <div className="erp-stat-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <CheckSquare className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-navy-900 dark:text-white">
              Attendance Overview
            </h3>
            <p className="text-[11px] text-gray-400">This month</p>
          </div>
        </div>
        {data.attendance.total === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">
            No attendance data this month
          </p>
        ) : (
          <>
            <div className="flex items-end justify-between mb-2">
              <span className="text-2xl font-bold text-navy-900 dark:text-white">
                {data.attendance.percentage}%
              </span>
              <span className="text-xs text-gray-400">
                {data.attendance.total} records
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-gray-100 dark:bg-muted overflow-hidden mb-3">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${data.attendance.percentage}%` }}
              />
            </div>
            <div className="flex gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-gray-500 dark:text-gray-400">
                  Present {data.attendance.present}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-red-400" />
                <span className="text-gray-500 dark:text-gray-400">
                  Absent {data.attendance.absent}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                <span className="text-gray-500 dark:text-gray-400">
                  Late {data.attendance.late}
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Fee Collection */}
      <div className="erp-stat-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <CreditCard className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-navy-900 dark:text-white">
              Fee Collection
            </h3>
            <p className="text-[11px] text-gray-400">Current academic year</p>
          </div>
        </div>
        {!data.hasAcademicYear ? (
          <p className="text-xs text-gray-400 text-center py-4">
            No active academic year set
          </p>
        ) : (
          <>
            <div className="flex items-end justify-between mb-2">
              <span className="text-2xl font-bold text-navy-900 dark:text-white">
                {data.feeCollection.percentage}%
              </span>
              <span className="text-xs text-gray-400">
                {formatCurrency(data.feeCollection.collected)} / {formatCurrency(data.feeCollection.expected)}
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-gray-100 dark:bg-muted overflow-hidden mb-3">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-500"
                style={{ width: `${Math.min(data.feeCollection.percentage, 100)}%` }}
              />
            </div>
            <div className="flex gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                <span className="text-gray-500 dark:text-gray-400">
                  Collected
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-gray-200 dark:bg-muted" />
                <span className="text-gray-500 dark:text-gray-400">
                  Pending
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Enrollment by Class */}
      <div className="erp-stat-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
            <GraduationCap className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-navy-900 dark:text-white">
              Enrollment by Class
            </h3>
            <p className="text-[11px] text-gray-400">Current academic year</p>
          </div>
        </div>
        {data.enrollmentByClass.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">
            No enrollment data
          </p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {data.enrollmentByClass.map((item) => (
              <div key={item.name} className="flex items-center gap-2">
                <span className="text-xs text-gray-600 dark:text-gray-400 w-20 shrink-0 truncate">
                  {item.name}
                </span>
                <div className="flex-1 h-5 rounded bg-gray-100 dark:bg-muted overflow-hidden">
                  <div
                    className="h-full rounded bg-violet-500/80 transition-all duration-500 flex items-center justify-end pr-1.5"
                    style={{
                      width: `${Math.max((item.count / maxEnrollment) * 100, 8)}%`,
                    }}
                  >
                    <span className="text-[10px] font-semibold text-white">
                      {item.count}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Admissions Trend */}
      <div className="erp-stat-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <UserPlus className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-navy-900 dark:text-white">
              Recent Admissions
            </h3>
            <p className="text-[11px] text-gray-400">Last 6 months</p>
          </div>
        </div>
        {data.admissionTrend.every((m) => m.count === 0) ? (
          <p className="text-xs text-gray-400 text-center py-4">
            No admissions in the last 6 months
          </p>
        ) : (
          <div className="flex items-end gap-2 h-28">
            {data.admissionTrend.map((item) => (
              <div
                key={item.month}
                className="flex-1 flex flex-col items-center gap-1"
              >
                <span className="text-[10px] font-semibold text-navy-900 dark:text-white">
                  {item.count > 0 ? item.count : ""}
                </span>
                <div
                  className={cn(
                    "w-full rounded-t transition-all duration-500",
                    item.count > 0
                      ? "bg-amber-400/80"
                      : "bg-gray-100 dark:bg-muted"
                  )}
                  style={{
                    height: `${item.count > 0 ? Math.max((item.count / maxAdmission) * 100, 10) : 5}%`,
                  }}
                />
                <span className="text-[10px] text-gray-400">{item.month}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
