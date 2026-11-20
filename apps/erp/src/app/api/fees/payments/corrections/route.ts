import { NextRequest, NextResponse } from "next/server";
import { verifyAdminOrEditorWithUser } from "@nkps/shared/lib/verify-admin";
import { CORRECTION_COLUMNS } from "@/lib/payment-correction";

// GET /api/fees/payments/corrections?student_id=<uuid>
// Every correction made to this student's payments — who, when, why, and
// which fields moved — so Payment History can mark a corrected row and say
// what was corrected. Read with the service role: fee_change_audit_log is
// admin-only under RLS, and the fee clerk needs to see this too.
//
// Only corrections are reported (date, mode and its details, transport
// month). A refund is already plain from the row's status.
export async function GET(request: NextRequest) {
  const auth = await verifyAdminOrEditorWithUser("fees");
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { admin } = auth;

  const studentId = new URL(request.url).searchParams.get("student_id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(studentId)) {
    return NextResponse.json({ error: "student_id is required" }, { status: 400 });
  }

  const { data: payments, error: payErr } = await admin
    .from("fee_payments")
    .select("id")
    .eq("student_id", studentId);
  if (payErr) {
    console.error("[fees.payment-corrections] payments:", payErr);
    return NextResponse.json({ error: "Failed to load corrections" }, { status: 500 });
  }
  const ids = (payments ?? []).map((p) => p.id as string);
  if (ids.length === 0) return NextResponse.json({ corrections: {} });

  const { data: rows, error } = await admin
    .from("fee_change_audit_log")
    .select("target_id, before_snapshot, after_snapshot, performed_by, performed_at, notes")
    .eq("target_table", "fee_payments")
    .eq("action", "update")
    .in("target_id", ids)
    .order("performed_at", { ascending: true });
  if (error) {
    console.error("[fees.payment-corrections] audit:", error);
    return NextResponse.json({ error: "Failed to load corrections" }, { status: 500 });
  }

  const actorIds = Array.from(
    new Set((rows ?? []).map((r) => r.performed_by as string | null).filter(Boolean))
  ) as string[];
  const { data: profiles } = actorIds.length
    ? await admin.from("profiles").select("id, full_name, email").in("id", actorIds)
    : { data: [] as Array<{ id: string; full_name: string | null; email: string | null }> };
  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id as string, (p.full_name ?? p.email ?? "Unknown") as string])
  );

  type Change = { field: string; before: unknown; after: unknown };
  const corrections: Record<
    string,
    Array<{ at: string; by: string | null; reason: string | null; changes: Change[] }>
  > = {};
  for (const r of rows ?? []) {
    const before = (r.before_snapshot ?? {}) as Record<string, unknown>;
    const after = (r.after_snapshot ?? {}) as Record<string, unknown>;
    const changes: Change[] = [];
    for (const field of CORRECTION_COLUMNS) {
      if (JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null)) {
        changes.push({ field, before: before[field] ?? null, after: after[field] ?? null });
      }
    }
    if (changes.length === 0) continue;
    const id = r.target_id as string;
    (corrections[id] ??= []).push({
      at: r.performed_at as string,
      by: r.performed_by ? nameById.get(r.performed_by as string) ?? null : null,
      reason: (r.notes as string | null) ?? null,
      changes,
    });
  }

  return NextResponse.json({ corrections });
}
