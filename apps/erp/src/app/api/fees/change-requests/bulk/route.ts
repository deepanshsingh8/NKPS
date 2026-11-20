import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminWithUser } from "@nkps/shared/lib/verify-admin";
import {
  applyFeeChangeRequest,
  rejectFeeChangeRequest,
} from "@/lib/fee-change-apply";

// POST /api/fees/change-requests/bulk
//   { action: "approve" | "reject", ids: uuid[], notes?: { [id]: string } }
//
// Approves or rejects several requests in one go — the fee office files
// discounts in batches, and approving twenty one dialog at a time was the
// "not working smoothly" in its report. Admin-only.
//
// Each request goes through exactly the code a single click runs
// (applyFeeChangeRequest / rejectFeeChangeRequest), one after another, in the
// order given — not in parallel, so of two identical discount requests the
// first is applied and the second comes back as a duplicate instead of both
// racing the same check. One failure never stops the rest; the response says
// what happened to each.
const MAX_PER_CALL = 50;

const bulkSchema = z.object({
  action: z.enum(["approve", "reject"]),
  ids: z
    .array(z.string().uuid())
    .min(1, "Select at least one request")
    .max(MAX_PER_CALL, `At most ${MAX_PER_CALL} requests at a time`),
  // Per-request review notes, e.g. the "Duplicate: …" note on a duplicate.
  notes: z.record(z.string(), z.string().max(1000)).optional(),
  review_notes: z.string().max(1000).optional().or(z.literal("")),
});

export async function POST(request: NextRequest) {
  const auth = await verifyAdminWithUser();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { admin, user, isSuperAdmin } = auth;

  const body = await request.json().catch(() => ({}));
  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }
  const { action, notes, review_notes } = parsed.data;
  const ids = Array.from(new Set(parsed.data.ids));

  const results: Array<{
    id: string;
    ok: boolean;
    status: number;
    error?: string;
    code?: string;
    verdict?: unknown;
  }> = [];
  for (const id of ids) {
    const opts = {
      id,
      reviewerId: user.id,
      isSuperAdmin,
      reviewNotes: notes?.[id] || review_notes || null,
    };
    const outcome =
      action === "approve"
        ? await applyFeeChangeRequest(admin, opts)
        : await rejectFeeChangeRequest(admin, opts);
    results.push(
      outcome.ok
        ? { id, ok: true, status: 200 }
        : {
            id,
            ok: false,
            status: outcome.status,
            error: String(outcome.body.error ?? "Failed"),
            code: outcome.body.code as string | undefined,
            verdict: outcome.body.verdict,
          }
    );
  }

  const done = results.filter((r) => r.ok).length;
  return NextResponse.json({
    action,
    results,
    summary: { done, failed: results.length - done, total: results.length },
  });
}
