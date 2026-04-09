import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/verify-admin";
import { enrollmentStatusSchema } from "@/lib/validations";
import { z } from "zod";

const bulkStatusSchema = z.object({
  updates: z.array(
    z.object({
      enrollment_id: z.string().uuid(),
      status: enrollmentStatusSchema,
    })
  ).min(1, "At least one update required"),
});

export async function PATCH(request: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const result = bulkStatusSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid data", details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { updates } = result.data;
    let successCount = 0;
    const errors: string[] = [];

    // Collect enrollment IDs that need student deactivation
    const deactivateEnrollmentIds = updates
      .filter((u) => u.status === "terminated" || u.status === "exited")
      .map((u) => u.enrollment_id);

    // Batch update enrollment statuses
    for (const update of updates) {
      const { error } = await admin
        .from("student_enrollments")
        .update({ status: update.status })
        .eq("id", update.enrollment_id);

      if (error) {
        errors.push(`Failed to update enrollment ${update.enrollment_id}: ${error.message}`);
      } else {
        successCount++;
      }
    }

    // For terminated/exited: deactivate the student record
    if (deactivateEnrollmentIds.length > 0) {
      // Look up student_ids from enrollment_ids
      const { data: enrollments } = await admin
        .from("student_enrollments")
        .select("student_id")
        .in("id", deactivateEnrollmentIds);

      if (enrollments && enrollments.length > 0) {
        const studentIds = [...new Set(enrollments.map((e) => e.student_id))];
        await admin
          .from("students")
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .in("id", studentIds);
      }
    }

    return NextResponse.json({
      success: true,
      updated: successCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("Update student status error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
