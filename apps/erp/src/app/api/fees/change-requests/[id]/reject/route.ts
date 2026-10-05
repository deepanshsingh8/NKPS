import { NextRequest, NextResponse } from "next/server";
import { verifyAdminWithUser } from "@nkps/shared/lib/verify-admin";
import { feeChangeRequestReviewSchema } from "@nkps/shared/lib/validations";
import {
  isRefundRequest,
  SUPER_ADMIN_REQUIRED_MESSAGE,
} from "@/lib/fee-change-requests";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/fees/change-requests/[id]/reject
//   Admin-only; a refund request needs a super admin (migration 135).
//   Atomic flip pending → rejected with optional review notes.
//   No DB side-effects on the target row. The requester sees the rejection
//   in their own request list.
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await verifyAdminWithUser();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { admin, user, isSuperAdmin } = auth;

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const parsed = feeChangeRequestReviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid review payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { review_notes } = parsed.data;

  // Reviewing a refund — either way — is the super admins' call. A plain
  // admin who thinks a refund request is wrong can still cancel their own.
  if (!isSuperAdmin) {
    const { data: peek } = await admin
      .from("fee_change_requests")
      .select("action, proposed_changes")
      .eq("id", id)
      .maybeSingle();
    if (
      peek &&
      isRefundRequest(peek.action, peek.proposed_changes as Record<string, unknown> | null)
    ) {
      return NextResponse.json(
        { error: SUPER_ADMIN_REQUIRED_MESSAGE, code: "SUPER_ADMIN_REQUIRED" },
        { status: 403 }
      );
    }
  }

  const { data: updated, error: updErr } = await admin
    .from("fee_change_requests")
    .update({
      status: "rejected",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      review_notes: review_notes || null,
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (updErr) {
    console.error("[fee-change-requests.reject]", updErr);
    return NextResponse.json(
      { error: "Failed to reject request" },
      { status: 500 }
    );
  }
  if (!updated) {
    const { data: existing } = await admin
      .from("fee_change_requests")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: `This request is already ${existing.status}` },
      { status: 409 }
    );
  }

  return NextResponse.json({ success: true, id });
}
