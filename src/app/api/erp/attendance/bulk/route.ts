import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { attendanceBulkSchema } from "@/lib/validations";
import {
  getTeacherIdForUser,
  teacherCanAccessClass,
} from "@/lib/teacher-scope";

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
    const result = attendanceBulkSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid data", details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { class_id, date, entries } = result.data;

    // Reject future-dated attendance — there is no school day in the future.
    // (M7 partial: leaves Sunday/holiday handling to a follow-up since those
    // require pulling the calendar.)
    const today = new Date();
    today.setUTCHours(23, 59, 59, 999);
    const reqDate = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(reqDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid date" },
        { status: 400 }
      );
    }
    if (reqDate.getTime() > today.getTime()) {
      return NextResponse.json(
        { error: "Cannot mark attendance for a future date" },
        { status: 400 }
      );
    }

    // Teacher ownership: a teacher can only mark attendance for classes
    // they teach (subject teacher) or are class teacher of. Admins skip.
    if (profile.role === "teacher") {
      const teacherId = await getTeacherIdForUser(supabase, user.id);
      if (
        !teacherId ||
        !(await teacherCanAccessClass(supabase, teacherId, class_id))
      ) {
        return NextResponse.json(
          { error: "You don't have access to this class" },
          { status: 403 }
        );
      }
    }

    // Build records for upsert
    const records = entries.map((entry) => ({
      student_id: entry.student_id,
      class_id,
      date,
      status: entry.status,
      marked_by: user.id,
    }));

    const { error } = await supabase
      .from("attendance")
      .upsert(records, { onConflict: "student_id,class_id,date" });

    if (error) {
      console.error("Attendance upsert error:", error);
      return NextResponse.json(
        { error: "Failed to save attendance" },
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
