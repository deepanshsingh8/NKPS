import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/verify-admin";

// Allowlisted tables and their columns that admins can read/write via this proxy
const ALLOWED_COLUMNS: Record<string, string[]> = {
  students: ["id", "admission_no", "full_name", "father_name", "mother_name", "date_of_birth", "gender", "address", "phone", "email", "blood_group", "category", "aadhar_number", "previous_school", "is_active", "created_at", "updated_at"],
  classes: ["id", "name", "section", "academic_year_id", "class_teacher_id", "sort_order", "created_at"],
  subjects: ["id", "name", "code", "is_active", "created_at"],
  academic_years: ["id", "name", "start_date", "end_date", "is_current", "created_at"],
  class_subjects: ["id", "class_id", "subject_id", "teacher_id", "created_at"],
  student_enrollments: ["id", "student_id", "class_id", "roll_number", "enrollment_date", "created_at"],
  fee_structures: ["id", "academic_year_id", "class_name", "fee_type", "amount", "due_date", "frequency", "created_at"],
  fee_payments: ["id", "student_id", "fee_structure_id", "amount_paid", "payment_date", "payment_method", "receipt_number", "month", "status", "recorded_by", "remarks", "created_at"],
  exam_types: ["id", "name", "academic_year_id", "max_marks", "weightage", "sort_order", "created_at"],
  calendar_events: ["id", "title", "description", "event_type", "start_date", "end_date", "class_id", "created_by", "created_at"],
  gallery_events: ["id", "title", "description", "event_date", "academic_year", "cover_image_url", "is_public", "sort_order", "created_at", "updated_at"],
  timetable_periods: ["id", "class_id", "subject_id", "teacher_id", "day_of_week", "period_number", "start_time", "end_time", "room", "created_at"],
  attendance: ["id", "student_id", "class_id", "date", "status", "marked_by", "remarks", "created_at"],
  results: ["id", "student_id", "class_id", "subject_id", "exam_type_id", "marks_obtained", "max_marks", "grade", "remarks", "entered_by", "created_at"],
  section_cards: ["id", "section", "title", "subtitle", "description", "quote", "name", "role", "initials", "date", "cta_text", "cta_link", "icon", "link", "image_url", "sort_order", "is_active", "created_at", "updated_at"],
};

const ALLOWED_TABLES = Object.keys(ALLOWED_COLUMNS);

export async function POST(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { action, table, data, match } = await request.json();

    if (!ALLOWED_TABLES.includes(table)) {
      return NextResponse.json({ error: "Table not allowed" }, { status: 403 });
    }

    const allowedCols = ALLOWED_COLUMNS[table];

    // Validate data keys against column allowlist
    if (data && typeof data === "object") {
      const invalidKeys = Object.keys(data).filter((k) => !allowedCols.includes(k));
      if (invalidKeys.length > 0) {
        return NextResponse.json(
          { error: "Invalid data fields" },
          { status: 400 }
        );
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query = admin.from(table) as any;
    let result: { data: unknown; error: { message: string } | null };

    switch (action) {
      case "insert": {
        result = await query.insert(data).select();
        break;
      }
      case "update": {
        if (!match || !match.column || match.value === undefined) {
          return NextResponse.json(
            { error: "Match criteria required for update" },
            { status: 400 }
          );
        }
        if (!allowedCols.includes(match.column)) {
          return NextResponse.json(
            { error: "Invalid match column" },
            { status: 400 }
          );
        }
        result = await query
          .update(data)
          .eq(match.column, match.value)
          .select();
        break;
      }
      case "delete": {
        if (!match || !match.column || match.value === undefined) {
          return NextResponse.json(
            { error: "Match criteria required for delete" },
            { status: 400 }
          );
        }
        if (!allowedCols.includes(match.column)) {
          return NextResponse.json(
            { error: "Invalid match column" },
            { status: 400 }
          );
        }
        result = await query
          .delete()
          .eq(match.column, match.value);
        break;
      }
      default:
        return NextResponse.json(
          { error: "Invalid action. Use insert, update, or delete." },
          { status: 400 }
        );
    }

    if (result.error) {
      console.error(`Admin proxy error [${table}/${action}]:`, result.error);
      return NextResponse.json({ error: "Operation failed" }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: result.data });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
