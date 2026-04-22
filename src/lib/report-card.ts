import type { SupabaseClient } from "@supabase/supabase-js";

export interface ReportCardSubject {
  subject_id: string;
  subject_name: string;
  subject_code: string | null;
  marks_obtained: number;
  max_marks: number;
  grade: string | null;
}

export interface ReportCardExamGroup {
  exam_type_id: string;
  exam_type_name: string;
  sort_order: number;
  subjects: ReportCardSubject[];
  total_obtained: number;
  total_max: number;
  percentage: number;
  overall_grade: string;
  remark: string | null;
}

export interface ReportCardStudent {
  id: string;
  name: string;
  email: string | null;
  class: { name: string; section: string } | null;
  roll_number: number | null;
}

export interface ReportCardAttendance {
  total_days: number;
  present_days: number; // present + late + half_day count as attended
  percentage: number;
  academic_year_label: string | null;
}

export interface ReportCardData {
  student: ReportCardStudent;
  exams: ReportCardExamGroup[];
  attendance: ReportCardAttendance | null;
}

/**
 * Authorize a viewer to see a given student's report card.
 * - admin / teacher: any student
 * - student: only themselves
 * - parent: only their linked children
 *
 * Returns `true` if allowed, `false` otherwise.
 */
export async function canViewReportCard(
  supabase: SupabaseClient,
  userId: string,
  studentId: string
): Promise<boolean> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, student_id, parent_id")
    .eq("id", userId)
    .single();

  if (!profile) return false;

  if (profile.role === "admin" || profile.role === "teacher" || profile.role === "editor") {
    return true;
  }

  if (profile.role === "student") {
    return profile.student_id === studentId;
  }

  if (profile.role === "parent") {
    if (!profile.parent_id) return false;
    const { data: link } = await supabase
      .from("student_parents")
      .select("student_id")
      .eq("parent_id", profile.parent_id)
      .eq("student_id", studentId)
      .maybeSingle();
    return Boolean(link);
  }

  return false;
}

export function gradeFromPercent(pct: number): string {
  if (pct >= 90) return "A+";
  if (pct >= 80) return "A";
  if (pct >= 70) return "B+";
  if (pct >= 60) return "B";
  if (pct >= 50) return "C";
  if (pct >= 40) return "D";
  return "F";
}

export async function getReportCardData(
  supabase: SupabaseClient,
  studentId: string,
  academicYearId?: string | null
): Promise<ReportCardData | null> {
  const { data: studentProfile } = await supabase
    .from("students")
    .select("id, full_name, email")
    .eq("id", studentId)
    .single();

  if (!studentProfile) return null;

  const { data: enrollment } = await supabase
    .from("student_enrollments")
    .select("class_id, roll_number, classes(name, section)")
    .eq("student_id", studentId)
    .limit(1)
    .single();

  // Current academic year — used for attendance window.
  const { data: academicYear } = await supabase
    .from("academic_years")
    .select("id, label, start_date, end_date")
    .eq("is_current", true)
    .limit(1)
    .maybeSingle();

  let attendance: ReportCardAttendance | null = null;
  if (enrollment?.class_id) {
    let attQuery = supabase
      .from("attendance")
      .select("status")
      .eq("student_id", studentId)
      .eq("class_id", enrollment.class_id);

    if (academicYear?.start_date && academicYear?.end_date) {
      attQuery = attQuery
        .gte("date", academicYear.start_date)
        .lte("date", academicYear.end_date);
    }

    const { data: attRows } = await attQuery;
    const total = attRows?.length ?? 0;
    const attended = (attRows ?? []).filter(
      (r) => r.status === "present" || r.status === "late" || r.status === "half_day"
    ).length;

    attendance = {
      total_days: total,
      present_days: attended,
      percentage: total > 0 ? Math.round((attended / total) * 100) : 0,
      academic_year_label: academicYear?.label ?? null,
    };
  }

  let query = supabase
    .from("results")
    .select(
      "id, marks_obtained, max_marks, grade, remarks, subjects(id, name, code), exam_types(id, name, max_marks, sort_order, academic_year_id)"
    )
    .eq("student_id", studentId)
    .eq("is_published", true)
    .order("created_at", { ascending: true });

  if (academicYearId) {
    const { data: examTypes } = await supabase
      .from("exam_types")
      .select("id")
      .eq("academic_year_id", academicYearId);

    if (examTypes && examTypes.length > 0) {
      const examTypeIds = examTypes.map((et) => et.id);
      query = query.in("exam_type_id", examTypeIds);
    }
  }

  const { data: results, error } = await query;
  if (error) throw error;

  const examGroups: Record<string, ReportCardExamGroup> = {};

  for (const r of results ?? []) {
    const examType = r.exam_types as unknown as {
      id: string;
      name: string;
      sort_order: number;
    };
    const subject = r.subjects as unknown as {
      id: string;
      name: string;
      code: string | null;
    };

    if (!examType || !subject) continue;

    if (!examGroups[examType.id]) {
      examGroups[examType.id] = {
        exam_type_id: examType.id,
        exam_type_name: examType.name,
        sort_order: examType.sort_order,
        subjects: [],
        total_obtained: 0,
        total_max: 0,
        percentage: 0,
        overall_grade: "",
        remark: null,
      };
    }

    const group = examGroups[examType.id];
    group.subjects.push({
      subject_id: subject.id,
      subject_name: subject.name,
      subject_code: subject.code,
      marks_obtained: r.marks_obtained,
      max_marks: r.max_marks,
      grade: r.grade,
    });
    group.total_obtained += r.marks_obtained;
    group.total_max += r.max_marks;
  }

  for (const group of Object.values(examGroups)) {
    if (group.total_max > 0) {
      group.percentage = Math.round(
        (group.total_obtained / group.total_max) * 100
      );
      group.overall_grade = gradeFromPercent(group.percentage);
    }
  }

  // Attach class-teacher remarks per exam
  const examTypeIds = Object.keys(examGroups);
  if (examTypeIds.length > 0) {
    const { data: remarks } = await supabase
      .from("student_remarks")
      .select("exam_type_id, remark")
      .eq("student_id", studentId)
      .in("exam_type_id", examTypeIds);

    for (const r of remarks ?? []) {
      const group = examGroups[r.exam_type_id as string];
      if (group) group.remark = r.remark as string;
    }
  }

  const sortedExams = Object.values(examGroups).sort(
    (a, b) => a.sort_order - b.sort_order
  );

  return {
    student: {
      id: studentProfile.id,
      name: studentProfile.full_name,
      email: studentProfile.email,
      class: enrollment
        ? (enrollment.classes as unknown as { name: string; section: string })
        : null,
      roll_number: enrollment?.roll_number ?? null,
    },
    exams: sortedExams,
    attendance,
  };
}
