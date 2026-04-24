import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resultsBulkSchema } from "@/lib/validations";
import { computeGrade, resolveGradeScaleForClass } from "@/lib/grading";

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

    const invalidEntries = entries.filter(
      (entry) => entry.marks_obtained < 0 || entry.marks_obtained > maxMarks
    );
    if (invalidEntries.length > 0) {
      return NextResponse.json(
        {
          error: `Marks must be between 0 and ${maxMarks}`,
          invalid_entries: invalidEntries.map((e) => ({
            student_id: e.student_id,
            marks_obtained: e.marks_obtained,
          })),
        },
        { status: 400 }
      );
    }

    // Resolve the grade scale for this class once (falls back to default scale).
    const scale = await resolveGradeScaleForClass(supabase, class_id);
    const bands = scale?.bands ?? [];

    // Build records for upsert
    const records = entries.map((entry) => ({
      student_id: entry.student_id,
      class_id,
      subject_id,
      exam_type_id,
      marks_obtained: entry.marks_obtained,
      max_marks: maxMarks,
      grade: computeGrade((entry.marks_obtained / maxMarks) * 100, bands),
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
