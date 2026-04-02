import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/verify-admin";

// Allowlisted tables that admins can read/write via this proxy
const ALLOWED_TABLES = [
  "classes",
  "subjects",
  "academic_years",
  "class_subjects",
  "student_enrollments",
  "fee_structures",
  "fee_payments",
  "exam_types",
  "calendar_events",
  "timetable_periods",
  "attendance",
  "results",
];

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
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: result.data });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
