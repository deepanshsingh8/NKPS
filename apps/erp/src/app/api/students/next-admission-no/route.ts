import { NextResponse } from "next/server";
import { verifyAdminOrEditor } from "@nkps/shared/lib/verify-admin";

/**
 * GET /api/students/next-admission-no
 *
 * Suggests the next admission number for the Add Student form: the highest
 * purely-numeric admission number across ALL students (including alumni —
 * their numbers must never be reused) plus one. Schools with alphanumeric
 * schemes still get a suggestion from the numeric portion of their records,
 * and the field stays editable — this is a convenience, not an allocator,
 * so a rare race simply surfaces as the existing duplicate-number 409.
 */
export async function GET() {
  try {
    const admin = await verifyAdminOrEditor("students");
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await admin
      .from("students")
      .select("admission_no")
      .range(0, 9999);

    if (error) {
      console.error("[students.next-admission-no]", error);
      return NextResponse.json({ error: "Failed to compute" }, { status: 500 });
    }

    let max = 0;
    for (const row of data ?? []) {
      const no = String(row.admission_no).trim();
      if (/^\d+$/.test(no)) max = Math.max(max, parseInt(no, 10));
    }

    return NextResponse.json({ next: String(max > 0 ? max + 1 : 1001) });
  } catch (err) {
    console.error("[students.next-admission-no]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
