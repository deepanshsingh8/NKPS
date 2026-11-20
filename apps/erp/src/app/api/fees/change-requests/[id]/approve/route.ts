import { NextRequest, NextResponse } from "next/server";
import { verifyAdminWithUser } from "@nkps/shared/lib/verify-admin";
import { feeChangeRequestReviewSchema } from "@nkps/shared/lib/validations";
import { applyFeeChangeRequest } from "@/lib/fee-change-apply";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/fees/change-requests/[id]/approve
//   Admin-only; a refund request needs a super admin (migration 135). The
//   claim / apply / audit sequence is applyFeeChangeRequest() in
//   lib/fee-change-apply.ts, shared with the bulk route.
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

  const outcome = await applyFeeChangeRequest(admin, {
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
