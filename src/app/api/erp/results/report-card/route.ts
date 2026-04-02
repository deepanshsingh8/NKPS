import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get("student_id");
    const academicYearId = searchParams.get("academic_year_id");

    if (!studentId) {
      return NextResponse.json(
        { error: "student_id is required" },
        { status: 400 }
      );
    }

    // Fetch student profile
    const { data: studentProfile } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", studentId)
      .single();

    if (!studentProfile) {
      return NextResponse.json(
        { error: "Student not found" },
        { status: 404 }
      );
    }

    // Fetch enrollment info
    const { data: enrollment } = await supabase
      .from("student_enrollments")
      .select("class_id, roll_number, classes(name, section)")
      .eq("student_id", studentId)
      .limit(1)
      .single();

    // Build results query
    let query = supabase
      .from("results")
      .select(
        "id, marks_obtained, max_marks, grade, remarks, subjects(id, name, code), exam_types(id, name, max_marks, sort_order, academic_year_id)"
      )
      .eq("student_id", studentId)
      .order("created_at", { ascending: true });

    // If academic_year_id provided, filter exam_types by it
    if (academicYearId) {
      // First get exam_type_ids for this academic year
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

    if (error) {
      console.error("Report card fetch error:", error);
      return NextResponse.json(
        { error: error.message || "Failed to fetch results" },
        { status: 500 }
      );
    }

    // Group results by exam type
    interface GroupedSubject {
      subject_id: string;
      subject_name: string;
      subject_code: string | null;
      marks_obtained: number;
      max_marks: number;
      grade: string | null;
    }

    interface ExamGroup {
      exam_type_id: string;
      exam_type_name: string;
      sort_order: number;
      subjects: GroupedSubject[];
      total_obtained: number;
      total_max: number;
      percentage: number;
      overall_grade: string;
    }

    const examGroups: Record<string, ExamGroup> = {};

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

    // Calculate percentages and overall grades
    for (const group of Object.values(examGroups)) {
      if (group.total_max > 0) {
        group.percentage = Math.round(
          (group.total_obtained / group.total_max) * 100
        );
        const pct = group.percentage;
        if (pct >= 90) group.overall_grade = "A+";
        else if (pct >= 80) group.overall_grade = "A";
        else if (pct >= 70) group.overall_grade = "B+";
        else if (pct >= 60) group.overall_grade = "B";
        else if (pct >= 50) group.overall_grade = "C";
        else if (pct >= 40) group.overall_grade = "D";
        else group.overall_grade = "F";
      }
    }

    // Sort exam groups by sort_order
    const sortedExams = Object.values(examGroups).sort(
      (a, b) => a.sort_order - b.sort_order
    );

    return NextResponse.json({
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
    });
  } catch (err) {
    console.error("API error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
