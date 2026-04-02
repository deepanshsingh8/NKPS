import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { attendanceBulkSchema } from "@/lib/validations";

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
        { error: error.message || "Failed to save attendance" },
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
