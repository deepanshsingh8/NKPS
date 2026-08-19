import { NextRequest, NextResponse } from "next/server";
import { verifyAdminOrEditorWithUser } from "@nkps/shared/lib/verify-admin";
import { enrollmentStatusSchema } from "@nkps/shared/lib/validations";
import { z } from "zod";

// Statuses that end a student's participation. Marking one of these requires a
// reason: a year later nobody can otherwise say why a name left the roster.
const REASON_REQUIRED_STATUSES = new Set(["terminated", "exited"]);

const statusUpdateSchema = z.object({
  enrollment_id: z.string().uuid(),
  status: enrollmentStatusSchema,
  reason: z
    .string()
    .trim()
    .min(5, "Reason must be at least 5 characters")
    .max(500, "Reason must be 500 characters or fewer")
    .optional(),
});

const bulkStatusSchema = z
  .object({
    updates: z.array(statusUpdateSchema).min(1, "At least one update required"),
    // Bulk-level default: one selection, one target status, one shared
    // justification ("Batch of 2024-25 leavers, TC issued"). Per-item `reason`
    // overrides it when a caller genuinely needs distinct reasons.
    reason: z.string().trim().min(5).max(500).optional(),
  })
  .superRefine((value, ctx) => {
    value.updates.forEach((u, i) => {
      if (REASON_REQUIRED_STATUSES.has(u.status) && !(u.reason ?? value.reason)) {
        ctx.addIssue({
          code: "custom",
          path: ["updates", i, "reason"],
          message: `A reason is required when marking a student ${u.status}.`,
        });
      }
    });
  });

export async function PATCH(request: NextRequest) {
  try {
    // ...WithUser (not the plain variant) so the actor lands on every history
    // row. Matches promote/route.ts, the other editor-permitted endpoint that
    // needs attribution.
    const auth = await verifyAdminOrEditorWithUser("students");
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { admin, user } = auth;

    const body = await request.json();
    const result = bulkStatusSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid data", details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { updates, reason: bulkReason } = result.data;

    // One transaction in the database rather than 4+N round trips here.
    // Critically, the history row and the status write cannot come apart: a
    // status change that lost its reason to a failed second call is exactly
    // what this feature exists to prevent, and PostgREST offers the route no
    // transaction of its own.
    const { data, error } = await admin.rpc("change_enrollment_status", {
      p_updates: updates.map((u) => ({
        enrollment_id: u.enrollment_id,
        status: u.status,
        reason: u.reason ?? bulkReason ?? null,
      })),
      p_actor: user.id,
      p_source: updates.length > 1 ? "bulk" : "manual",
    });

    if (error) {
      console.error("[students.status.PATCH] change_enrollment_status:", error);
      return NextResponse.json(
        { error: "Failed to update student status" },
        { status: 500 }
      );
    }

    const summary = (data ?? {}) as { updated?: number; skipped?: number };

    return NextResponse.json({
      success: true,
      updated: summary.updated ?? 0,
      skipped: summary.skipped ?? 0,
    });
  } catch (err) {
    console.error("Update student status error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
