import { NextRequest, NextResponse } from "next/server";
import { verifyAdminWithUser } from "@nkps/shared/lib/verify-admin";
import { feeChangeRequestReviewSchema } from "@nkps/shared/lib/validations";
import { rejectFeeChangeRequest } from "@/lib/fee-change-apply";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/fees/change-requests/[id]/reject
//   Admin-only; a refund request needs a super admin (migration 135).
//   Atomic flip pending → rejected with optional review notes — see
//   rejectFeeChangeRequest(), shared with the bulk route.
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

  const outcome = await rejectFeeChangeRequest(admin, {
    id,
    reviewerId: user.id,
    isSuperAdmin,
    reviewNotes: parsed.data.review_notes || null,
  });
  if (!outcome.ok) {
    return NextResponse.json(outcome.body, { status: outcome.status });
  }
  return NextResponse.json({ success: true, id: outcome.id });
}
