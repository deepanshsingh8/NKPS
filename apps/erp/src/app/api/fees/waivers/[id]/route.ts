import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminOrEditorWithUser } from "@nkps/shared/lib/verify-admin";
import { validateWaiver } from "@/lib/fee-waiver";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// PATCH  /api/fees/waivers/[id]  { waiver_amount, reason }  — change a discount
// DELETE /api/fees/waivers/[id]  { reason }                 — remove it
//
// A discount could be recorded but never changed or removed: the "one
// discount per instalment" refusal told the office to "edit or remove it
// instead", and no screen could. Admins apply the change directly, with the
// before/after rows and the reason in fee_change_audit_log; editors file a
// change request, as for any other change to a recorded fee_payments row.
//
// A changed amount passes the same cap as a new discount — no more than is
// still owed on the instalment, counting everything except this discount.
// Removing a discount on a paid instalment re-opens what it covered.

const changeSchema = z.object({
  waiver_amount: z.number().finite().positive("Amount must be positive"),
  reason: z.string().trim().min(5, "Reason is required (min 5 chars)").max(1000),
});
const removeSchema = z.object({
  reason: z.string().trim().min(5, "Reason is required (min 5 chars)").max(1000),
});

async function loadDiscount(
  admin: NonNullable<Awaited<ReturnType<typeof verifyAdminOrEditorWithUser>>>["admin"],
  id: string
) {
  const { data, error } = await admin.from("fee_payments").select("*").eq("id", id).maybeSingle();
  if (error) return { error: NextResponse.json({ error: "Failed to load the discount" }, { status: 500 }) };
  if (!data) return { error: NextResponse.json({ error: "Discount not found" }, { status: 404 }) };
  if (data.payment_method !== "waiver") {
    return { error: NextResponse.json({ error: "This entry is a payment, not a discount" }, { status: 400 }) };
  }
  if (data.status === "refunded") {
    return { error: NextResponse.json({ error: "This discount was reversed and can't be changed" }, { status: 400 }) };
  }
  return { row: data as Record<string, unknown> & { id: string } };
}

async function fileRequest(
  admin: NonNullable<Awaited<ReturnType<typeof verifyAdminOrEditorWithUser>>>["admin"],
  userId: string,
  live: Record<string, unknown>,
  action: "update" | "delete",
  proposed: Record<string, unknown>,
  reason: string
) {
  const { error } = await admin.from("fee_change_requests").insert({
    target_table: "fee_payments",
    target_id: live.id,
    action,
    current_snapshot: live,
    proposed_changes: action === "delete" ? {} : proposed,
    reason,
    requested_by: userId,
  });
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "A change request is already waiting for this discount. Wait for it to be reviewed first." },
        { status: 409 }
      );
    }
    console.error("[fees.waiver-change] request insert:", error);
    return NextResponse.json({ error: "Failed to file the request" }, { status: 500 });
  }
  return NextResponse.json({ success: true, pending: true });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await verifyAdminOrEditorWithUser("fees");
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { admin, user, role } = auth;
  const { id } = await context.params;

  const parsed = changeSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }
  const { waiver_amount, reason } = parsed.data;

  const loaded = await loadDiscount(admin, id);
  if ("error" in loaded) return loaded.error;
  const live = loaded.row;
  if (Math.abs(Number(live.waiver_amount) - waiver_amount) < 0.005) {
    return NextResponse.json({ error: "That is already the discount's amount." }, { status: 400 });
  }

  const check = await validateWaiver(
    admin,
    {
      student_id: String(live.student_id),
      fee_structure_id: String(live.fee_structure_id),
      waiver_amount,
      waiver_reason: String(live.waiver_reason ?? reason),
      month: (live.month as string | null) ?? null,
    },
    { excludePaymentId: id }
  );
  if (!check.ok) {
    return NextResponse.json({ error: check.error, code: check.code }, { status: 400 });
  }

  if (role === "editor") {
    return fileRequest(admin, user.id, live, "update", { waiver_amount }, reason);
  }

  const { data: updated, error } = await admin
    .from("fee_payments")
    .update({ waiver_amount })
    .eq("id", id)
    .eq("waiver_amount", live.waiver_amount as number)
    .select("*");
  if (error) {
    console.error("[fees.waiver-change] update:", error);
    return NextResponse.json({ error: "Failed to change the discount" }, { status: 500 });
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json(
      { error: "The discount was changed by someone else meanwhile. Refresh and try again." },
      { status: 409 }
    );
  }
  const { error: auditErr } = await admin.from("fee_change_audit_log").insert({
    target_table: "fee_payments",
    target_id: id,
    action: "update",
    before_snapshot: live,
    after_snapshot: updated[0],
    performed_by: user.id,
    notes: reason,
  });
  if (auditErr) console.error("[fees.waiver-change] audit insert:", auditErr);
  return NextResponse.json({ success: true, payment: updated[0] });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await verifyAdminOrEditorWithUser("fees");
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { admin, user, role } = auth;
  const { id } = await context.params;

  const parsed = removeSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }
  const { reason } = parsed.data;

  const loaded = await loadDiscount(admin, id);
  if ("error" in loaded) return loaded.error;
  const live = loaded.row;

  if (role === "editor") {
    return fileRequest(admin, user.id, live, "delete", {}, reason);
  }

  // Audit first: once the row is gone there is nothing left to describe.
  const { error: auditErr } = await admin.from("fee_change_audit_log").insert({
    target_table: "fee_payments",
    target_id: id,
    action: "delete",
    before_snapshot: live,
    after_snapshot: null,
    performed_by: user.id,
    notes: reason,
  });
  if (auditErr) {
    console.error("[fees.waiver-remove] audit insert:", auditErr);
    return NextResponse.json({ error: "Failed to record the removal; nothing was changed" }, { status: 500 });
  }
  const { error } = await admin.from("fee_payments").delete().eq("id", id).eq("payment_method", "waiver");
  if (error) {
    console.error("[fees.waiver-remove] delete:", error);
    return NextResponse.json({ error: "Failed to remove the discount" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
