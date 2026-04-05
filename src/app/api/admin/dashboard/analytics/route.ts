import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/verify-admin";

export async function GET() {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get current academic year
  const { data: currentYear } = await admin
    .from("academic_years")
    .select("id")
    .eq("is_current", true)
    .single();

  const currentYearId = currentYear?.id ?? null;

  // Current month date range
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split("T")[0];
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .split("T")[0];

  // 6 months ago for admission trend
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
    .toISOString()
    .split("T")[0];

  const [attendanceRes, feePaymentsRes, feeStructuresRes, enrollmentRes, admissionsRes] =
    await Promise.all([
      // Attendance for current month
      admin
        .from("attendance")
        .select("status")
        .gte("date", monthStart)
        .lte("date", monthEnd),

      // Fee payments for current academic year
      currentYearId
        ? admin
            .from("fee_payments")
            .select("amount_paid, fee_structure_id, fee_structures!inner(academic_year_id)")
            .eq("fee_structures.academic_year_id", currentYearId)
        : Promise.resolve({ data: null }),

      // Fee structures for current academic year (to calculate expected total)
      currentYearId
        ? admin
            .from("fee_structures")
            .select("amount, class_name")
            .eq("academic_year_id", currentYearId)
        : Promise.resolve({ data: null }),

      // Enrollment by class for current academic year
      currentYearId
        ? admin
            .from("student_enrollments")
            .select("class_id, classes!inner(name, section, academic_year_id)")
            .eq("classes.academic_year_id", currentYearId)
        : Promise.resolve({ data: null }),

      // Students created in last 6 months
      admin
        .from("students")
        .select("created_at")
        .gte("created_at", sixMonthsAgo),
    ]);

  // ── Process attendance ──
  const attendanceData = (attendanceRes.data ?? []) as { status: string }[];
  const attendanceSummary = {
    present: 0,
    absent: 0,
    late: 0,
    total: attendanceData.length,
    percentage: 0,
  };
  for (const record of attendanceData) {
    if (record.status === "present") attendanceSummary.present++;
    else if (record.status === "absent") attendanceSummary.absent++;
    else if (record.status === "late") attendanceSummary.late++;
  }
  if (attendanceSummary.total > 0) {
    attendanceSummary.percentage = Math.round(
      ((attendanceSummary.present + attendanceSummary.late) / attendanceSummary.total) * 100
    );
  }

  // ── Process fee collection ──
  const payments = (feePaymentsRes.data ?? []) as { amount_paid: number }[];
  const collected = payments.reduce((sum, p) => sum + Number(p.amount_paid), 0);

  // Count active students per class for expected calculation
  const structures = (feeStructuresRes.data ?? []) as { amount: number; class_name: string }[];
  // Simple estimation: sum of all fee structure amounts (per student cost)
  const totalExpected = structures.reduce((sum, s) => sum + Number(s.amount), 0);

  const feeCollection = {
    collected,
    expected: totalExpected,
    percentage: totalExpected > 0 ? Math.round((collected / totalExpected) * 100) : 0,
  };

  // ── Process enrollment by class ──
  const enrollments = (enrollmentRes.data ?? []) as unknown as {
    class_id: string;
    classes: { name: string; section: string } | { name: string; section: string }[] | null;
  }[];
  const classCountMap: Record<string, { name: string; count: number }> = {};
  for (const e of enrollments) {
    const raw = e.classes;
    if (!raw) continue;
    const cls = Array.isArray(raw) ? raw[0] : raw;
    if (!cls) continue;
    const key = `${cls.name}-${cls.section}`;
    if (!classCountMap[key]) {
      classCountMap[key] = { name: key, count: 0 };
    }
    classCountMap[key].count++;
  }
  const enrollmentByClass = Object.values(classCountMap).sort((a, b) => {
    // Sort by class order (Nursery, LKG, UKG, I-XII)
    const order = ["Nursery", "LKG", "UKG", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
    const aIdx = order.findIndex((o) => a.name.startsWith(o));
    const bIdx = order.findIndex((o) => b.name.startsWith(o));
    return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
  });

  // ── Process admission trend ──
  const admissions = (admissionsRes.data ?? []) as { created_at: string }[];
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // Build last 6 months
  const admissionTrend: { month: string; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const count = admissions.filter((a) => a.created_at.startsWith(monthKey)).length;
    admissionTrend.push({ month: monthNames[d.getMonth()], count });
  }

  return NextResponse.json({
    attendance: attendanceSummary,
    feeCollection,
    enrollmentByClass,
    admissionTrend,
    hasAcademicYear: !!currentYearId,
  });
}
