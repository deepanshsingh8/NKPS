import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resultsBulkSchema } from "@/lib/validations";

function calculateGrade(marks: number, maxMarks: number): string {
  const pct = (marks / maxMarks) * 100;
  if (pct >= 90) return "A+";
  if (pct >= 80) return "A";
  if (pct >= 70) return "B+";
  if (pct >= 60) return "B";
  if (pct >= 50) return "C";
  if (pct >= 40) return "D";
  return "F";
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user is a teacher or admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "teacher" && profile.role !== "admin")) {
      return NextResponse.json(
        { error: "Forbidden: teacher or admin access required" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const result = resultsBulkSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid data", details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { class_id, subject_id, exam_type_id, entries } = result.data;

    // Fetch exam type to get max_marks
    const { data: examType } = await supabase
      .from("exam_types")
      .select("max_marks")
      .eq("id", exam_type_id)
      .single();

    if (!examType) {
      return NextResponse.json(
        { error: "Exam type not found" },
        { status: 404 }
      );
    }

    const maxMarks = examType.max_marks;

    // Build records for upsert
    const records = entries.map((entry) => ({
      student_id: entry.student_id,
      class_id,
      subject_id,
      exam_type_id,
      marks_obtained: entry.marks_obtained,
      max_marks: maxMarks,
      grade: calculateGrade(entry.marks_obtained, maxMarks),
      entered_by: user.id,
    }));

    const { error } = await supabase
      .from("results")
      .upsert(records, {
        onConflict: "student_id,subject_id,exam_type_id",
      });

    if (error) {
      console.error("Results upsert error:", error);
      return NextResponse.json(
        { error: "Failed to save results" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, count: records.length });
  } catch (err) {
    console.error("API error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
