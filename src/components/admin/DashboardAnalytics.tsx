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

interface AttendanceDay {
  date: string;
  day: number;
  present: number;
  absent: number;
  late: number;
  total: number;
}

interface AttendanceData {
  daily: AttendanceDay[];
  totals: {
    present: number;
    absent: number;
    late: number;
    total: number;
    percentage: number;
  };
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

// Every block is optional — the server omits blocks the caller can't see.
interface AnalyticsData {
  attendance?: AttendanceData;
  feeCollection?: FeeCollection;
  enrollmentByClass?: EnrollmentItem[];
  admissionTrend?: AdmissionTrend[];
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

function AttendanceBlock({ data }: { data: AttendanceData }) {
  const { daily, totals } = data;
  // Tallest column sets the bar scale.
  const maxTotal = Math.max(...daily.map((d) => d.total), 1);
  const monthLabel = new Date().toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="erp-stat-card md:col-span-2">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <CheckSquare className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-navy-900 dark:text-white">
              Attendance — {monthLabel}
            </h3>
            <p className="text-[11px] text-gray-400">
              {totals.total > 0
                ? `${totals.percentage}% overall · ${totals.total} records`
                : "No records yet"}
            </p>
          </div>
        </div>
        <div className="hidden sm:flex gap-3 text-[11px] text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-emerald-500" /> Present
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-amber-400" /> Late
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-red-400" /> Absent
          </span>
        </div>
      </div>

      {totals.total === 0 ? (
        <p className="text-xs text-gray-400 text-center py-10">
          No attendance recorded this month yet.
        </p>
      ) : (
        <div>
          {/* Chart area */}
          <div className="flex items-end gap-[3px] h-40">
            {daily.map((d) => {
              const hPresent = (d.present / maxTotal) * 100;
              const hLate = (d.late / maxTotal) * 100;
              const hAbsent = (d.absent / maxTotal) * 100;
              const hasData = d.total > 0;
              const pct =
                hasData
                  ? Math.round(((d.present + d.late) / d.total) * 100)
                  : null;
              return (
                <div
                  key={d.date}
                  className="flex-1 flex flex-col justify-end h-full group relative"
                  title={
                    hasData
                      ? `Day ${d.day} · ${pct}% present\nPresent ${d.present} · Late ${d.late} · Absent ${d.absent}`
                      : `Day ${d.day} · no data`
                  }
                >
                  {/* Stacked segments: absent (top) → late → present (bottom).
                      Rendered top-down so the tallest totals land at the top
                      of the column. */}
                  <div
                    className="w-full bg-red-400 rounded-t-sm transition-colors group-hover:bg-red-500"
                    style={{ height: `${hAbsent}%` }}
                  />
                  <div
                    className="w-full bg-amber-400 transition-colors group-hover:bg-amber-500"
                    style={{ height: `${hLate}%` }}
                  />
                  <div
                    className={cn(
                      "w-full bg-emerald-500 transition-colors group-hover:bg-emerald-600",
                      hAbsent === 0 && hLate === 0 && "rounded-t-sm"
                    )}
                    style={{ height: `${hPresent}%` }}
                  />
                </div>
              );
            })}
          </div>

          {/* Day axis — show every 5th day so the strip stays readable. */}
          <div className="flex gap-[3px] mt-1.5">
            {daily.map((d) => (
              <div
                key={d.date}
                className="flex-1 text-center text-[9px] text-gray-400"
              >
                {d.day % 5 === 0 || d.day === 1 ? d.day : ""}
              </div>
            ))}
          </div>

          {/* Mobile legend (hidden on sm+) */}
          <div className="sm:hidden flex gap-3 text-[11px] text-gray-500 dark:text-gray-400 mt-3">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-emerald-500" /> Present
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-amber-400" /> Late
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-red-400" /> Absent
            </span>
          </div>
        </div>
      )}
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

  // Caller sees nothing? Render nothing — prevents an empty gray band.
  const hasAnyBlock =
    data.attendance ||
    data.feeCollection ||
    data.enrollmentByClass ||
    data.admissionTrend;
  if (!hasAnyBlock) return null;

  const maxEnrollment = Math.max(
    ...(data.enrollmentByClass ?? []).map((e) => e.count),
    1
  );
  const maxAdmission = Math.max(
    ...(data.admissionTrend ?? []).map((a) => a.count),
    1
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {/* Attendance spans full row when present for readability */}
      {data.attendance && <AttendanceBlock data={data.attendance} />}

      {/* Fee Collection */}
      {data.feeCollection && (
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
                  {formatCurrency(data.feeCollection.collected)} /{" "}
                  {formatCurrency(data.feeCollection.expected)}
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-gray-100 dark:bg-muted overflow-hidden mb-3">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-500"
                  style={{
                    width: `${Math.min(data.feeCollection.percentage, 100)}%`,
                  }}
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
      )}

      {/* Enrollment by Class */}
      {data.enrollmentByClass && (
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
      )}

      {/* Recent Admissions Trend */}
      {data.admissionTrend && (
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
      )}
    </div>
  );
}
