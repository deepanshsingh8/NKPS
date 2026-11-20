import { NextRequest, NextResponse } from "next/server";
import { verifyAdminOrEditorWithUser } from "@nkps/shared/lib/verify-admin";
import { applyTransportChange, isPermanentChange } from "@/lib/transport";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// PATCH /api/transport/changes/[id]
// Review a pending change request: approve (applies it) / reject / cancel.
// Body: { action: 'approve' | 'reject' | 'cancel', review_note?: string }
export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await verifyAdminOrEditorWithUser("transport");
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { admin, user } = auth;
  const { id } = await context.params;

  const body = await request.json().catch(() => ({}));
  const action = body?.action as string | undefined;
  const reviewNote = (body?.review_note as string | undefined) ?? null;
  if (!action || !["approve", "reject", "cancel"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const { data: change, error: loadError } = await admin
    .from("transport_change_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (loadError || !change) {
    return NextResponse.json({ error: "Change not found" }, { status: 404 });
  }
  if (change.status !== "pending") {
    return NextResponse.json(
      { error: `Change is already ${change.status}` },
      { status: 409 }
    );
  }

  // Every status flip below is conditional on the row still being pending.
  // The route used to read "pending", do its work, then write the new status
  // unconditionally — so a double click, or two people reviewing the same
  // request, applied one change twice.
  const alreadyReviewed = async () => {
    const { data: now } = await admin
      .from("transport_change_requests")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    return NextResponse.json(
      { error: `Change is already ${now?.status ?? "reviewed"}` },
      { status: 409 }
    );
  };

  if (action === "reject" || action === "cancel") {
    const { data: updated } = await admin
      .from("transport_change_requests")
      .update({
        status: action === "reject" ? "rejected" : "cancelled",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        review_note: reviewNote,
      })
      .eq("id", id)
      .eq("status", "pending")
      .select()
      .maybeSingle();
    if (!updated) return alreadyReviewed();
    return NextResponse.json({ success: true, change: updated });
  }

  // approve — guard one-side without a custom fee (would trip the DB check).
  if (
    change.change_type === "direction_change" &&
    change.direction &&
    change.direction !== "both"
  ) {
    const { data: enrollment } = await admin
      .from("student_enrollments")
      .select("transport_fee_override")
      .eq("id", change.enrollment_id)
      .maybeSingle();
    if (!enrollment || enrollment.transport_fee_override == null) {
      return NextResponse.json(
        {
          error:
            "Set the one-side custom fee on the Student Assignments page before approving this change.",
        },
        { status: 400 }
      );
    }
  }

  // Claim before applying: only the reviewer whose update matches a pending
  // row goes on to touch the enrollment.
  const reviewedAt = new Date().toISOString();
  const { data: claimed } = await admin
    .from("transport_change_requests")
    .update({
      status: "approved",
      reviewed_by: user.id,
      reviewed_at: reviewedAt,
      review_note: reviewNote,
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (!claimed) return alreadyReviewed();

  const applyResult = await applyTransportChange(admin, change, user.id);
  if (applyResult.error) {
    // Nothing was applied: put the request back so it can be retried.
    await admin
      .from("transport_change_requests")
      .update({ status: "pending", reviewed_by: null, reviewed_at: null, review_note: null })
      .eq("id", id)
      .eq("status", "approved");
    return NextResponse.json({ error: applyResult.error }, { status: 400 });
  }

  const newStatus =
    isPermanentChange(change) ||
    change.change_type === "drop" ||
    change.change_type === "resume"
      ? "applied"
      : "approved";

  const { data: updated } = await admin
    .from("transport_change_requests")
    .update({ status: newStatus })
    .eq("id", id)
    .select()
    .single();

  return NextResponse.json({ success: true, change: updated });
}
