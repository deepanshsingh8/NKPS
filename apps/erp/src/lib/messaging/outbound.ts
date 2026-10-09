import type { SupabaseClient } from "@supabase/supabase-js";
import { sendTemplate } from "@nkps/shared/lib/messaging/whatsapp";
import { writeAuditLog, type AuditAction } from "@nkps/shared/lib/audit-log";
import { phoneLast4 } from "./recipients";

/**
 * Sending office-initiated WhatsApp and leaving a truthful record of it.
 *
 * Follows the webhook's reply() helper and the click-to-call route: the log
 * row goes in BEFORE dispatch with status 'queued', then is updated to 'sent'
 * (with Meta's message id, which the webhook later advances to delivered /
 * read) or 'failed' with the error. A send that throws still leaves a trace
 * that we tried, and a crash between the two writes shows as a stuck 'queued'
 * rather than as nothing at all.
 */

export type BroadcastKind = "bus_notice" | "fee_reminder";

export interface OutboundRecipient {
  phoneE164: string;
  /** The student this message is about. Siblings on a bus notice share one message; the first is recorded. */
  studentId: string | null;
  variables: string[];
}

export interface BroadcastInput {
  kind: BroadcastKind;
  actorId: string;
  actorRole: string;
  busId?: string | null;
  studentId?: string | null;
  academicYearId?: string | null;
  templateName: string;
  /** What the office typed (or the note). School-authored; stored in full. */
  bodyText: string | null;
  recipients: OutboundRecipient[];
  /** Students the action could not reach, for the counts. */
  skippedCount: number;
  request: Request;
  /** Extra audit detail: ids and counts only, never personal values. */
  auditDetails?: Record<string, unknown>;
}

export interface BroadcastResult {
  broadcastId: string;
  sent: number;
  failed: number;
  skipped: number;
  /** The first provider error, for the toast — the office cannot read a log. */
  firstError: string | null;
}

/** How many sends run at once. Meta tolerates far more; this keeps one bus under maxDuration without a burst. */
const CONCURRENCY = 4;

async function sendOne(
  admin: SupabaseClient,
  input: BroadcastInput,
  broadcastId: string,
  recipient: OutboundRecipient
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: row, error: insertError } = await admin
    .from("whatsapp_messages")
    .insert({
      direction: "outbound",
      phone_last4: phoneLast4(recipient.phoneE164),
      category: "utility",
      template_name: input.templateName,
      status: "queued",
      broadcast_id: broadcastId,
      student_id: recipient.studentId,
      actor_id: input.actorId,
    })
    .select("id")
    .single();

  if (insertError || !row) {
    // Refuse to send what we cannot record. A message with no log row is a
    // bill with no explanation.
    return { ok: false, error: insertError?.message ?? "log insert failed" };
  }

  let waMessageId: string | null;
  try {
    const sent = await sendTemplate(
      recipient.phoneE164,
      input.templateName,
      recipient.variables
    );
    waMessageId = sent.waMessageId;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin
      .from("whatsapp_messages")
      .update({ status: "failed", error_code: message.slice(0, 200) })
      .eq("id", row.id as string);
    return { ok: false, error: message };
  }

  // Meta has the message by now, and the parent will get it whatever happens
  // next — so a failed status write is a bookkeeping problem to log, never a
  // reason to tell the office "not delivered" and have them send it twice.
  const { error: updateError } = await admin
    .from("whatsapp_messages")
    .update({ wa_message_id: waMessageId, status: "sent" })
    .eq("id", row.id as string);
  if (updateError) {
    console.error("[whatsapp] sent but status not recorded:", updateError.message);
  }
  return { ok: true };
}

/**
 * One office action: a `whatsapp_broadcasts` row, one message per recipient,
 * the counts written back, and an audit_log entry.
 *
 * Throws only if the broadcast row itself cannot be created — nothing has been
 * sent at that point. Once sending starts, every outcome is recorded and
 * returned rather than thrown, so a single bad number cannot abort the other
 * thirty-seven families on the bus.
 */
export async function runBroadcast(
  admin: SupabaseClient,
  input: BroadcastInput
): Promise<BroadcastResult> {
  const { data: broadcast, error: broadcastError } = await admin
    .from("whatsapp_broadcasts")
    .insert({
      kind: input.kind,
      actor_id: input.actorId,
      actor_role: input.actorRole,
      bus_id: input.busId ?? null,
      student_id: input.studentId ?? null,
      academic_year_id: input.academicYearId ?? null,
      template_name: input.templateName,
      body_text: input.bodyText,
      recipient_count: input.recipients.length,
      skipped_count: input.skippedCount,
      status: "sending",
    })
    .select("id")
    .single();

  if (broadcastError || !broadcast) {
    throw new Error(
      `whatsapp_broadcasts insert failed: ${broadcastError?.message ?? "no row"}`
    );
  }
  const broadcastId = broadcast.id as string;

  let sent = 0;
  let failed = 0;
  let firstError: string | null = null;

  // Bounded concurrency without a dependency: a shared cursor and N workers.
  let cursor = 0;
  const worker = async () => {
    while (cursor < input.recipients.length) {
      const recipient = input.recipients[cursor++];
      const outcome = await sendOne(admin, input, broadcastId, recipient);
      if (outcome.ok) sent += 1;
      else {
        failed += 1;
        firstError ??= outcome.error;
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, input.recipients.length) }, worker)
  );

  const status =
    input.recipients.length > 0 && sent === 0 ? "failed" : "completed";
  await admin
    .from("whatsapp_broadcasts")
    .update({
      sent_count: sent,
      failed_count: failed,
      status,
      completed_at: new Date().toISOString(),
    })
    .eq("id", broadcastId);

  const action: AuditAction =
    input.kind === "bus_notice" ? "whatsapp.bus_notice" : "whatsapp.fee_reminder";
  await writeAuditLog(admin, {
    actorId: input.actorId,
    actorRole: input.actorRole,
    action,
    targetTable: input.kind === "bus_notice" ? "buses" : "students",
    targetId: input.kind === "bus_notice" ? input.busId ?? null : input.studentId ?? null,
    details: {
      broadcast_id: broadcastId,
      recipients: input.recipients.length,
      sent,
      failed,
      skipped: input.skippedCount,
      ...(input.auditDetails ?? {}),
    },
    request: input.request,
  });

  return { broadcastId, sent, failed, skipped: input.skippedCount, firstError };
}

/** The office phone a template names. Never empty — Meta rejects an empty parameter. */
export function officePhoneParam(phones: string[]): string {
  const first = phones.find((p) => p && p.trim());
  return first ? first.trim() : "the school's number";
}
