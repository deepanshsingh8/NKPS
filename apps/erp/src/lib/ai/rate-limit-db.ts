import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A rate limiter the database owns.
 *
 * The shared `rateLimit()` helper is database-backed too (migration 132), but
 * it fails OPEN to a per-process in-memory Map when the database is
 * unreachable — right for login and password reset, where an outage must not
 * lock everyone out.
 *
 * That trade-off is wrong on the WhatsApp ingress, which is public,
 * unauthenticated at the transport layer, and costs real money per message —
 * Meta bills each service reply from 2026-10-01, plus Claude tokens on top. A
 * limit that degrades to `max x instances` is not a limit on a bill, so this
 * one fails CLOSED.
 *
 * `bump_rate_limit` does the increment and the comparison in one statement, so
 * two concurrent messages cannot both read 4 and both write 5.
 */

export interface DbRateLimitResult {
  ok: boolean;
  /** False when the check itself failed — see the note in `checkDbRateLimit`. */
  checked: boolean;
}

export async function checkDbRateLimit(
  admin: SupabaseClient,
  bucket: string,
  windowSeconds: number,
  max: number
): Promise<DbRateLimitResult> {
  const { data, error } = await admin.rpc("bump_rate_limit", {
    p_bucket: bucket,
    p_window_seconds: windowSeconds,
    p_max: max,
  });

  if (error) {
    // Fail CLOSED. The alternative — letting traffic through when the limiter
    // is broken — turns a database blip into an unbounded bill on a public
    // endpoint. A parent seeing "try again in a moment" is the cheaper failure.
    console.error("[ai.rate-limit] bump failed, refusing:", error.message);
    return { ok: false, checked: false };
  }

  return { ok: data === true, checked: true };
}

/**
 * The three limits the WhatsApp channel enforces, cheapest check first.
 *
 * Per-phone catches one chatty or hostile number. Per-parent catches someone
 * enrolling several numbers to the same family. Global is the circuit breaker:
 * whatever goes wrong, the school's bill for one hour is bounded.
 */
export async function checkWhatsAppLimits(
  admin: SupabaseClient,
  phoneE164: string,
  parentId: string | null
): Promise<{ ok: boolean; reason?: string }> {
  const perPhone = await checkDbRateLimit(admin, `wa:phone:${phoneE164}`, 3600, 30);
  if (!perPhone.ok) {
    return {
      ok: false,
      reason: perPhone.checked
        ? "You've sent a lot of messages this hour. Please try again later, or call the school office."
        : "I can't take messages right now. Please call the school office.",
    };
  }

  if (parentId) {
    const perParent = await checkDbRateLimit(admin, `wa:parent:${parentId}`, 86_400, 100);
    if (!perParent.ok) {
      return {
        ok: false,
        reason: "You've reached today's limit for messages. Please call the school office.",
      };
    }
  }

  const global = await checkDbRateLimit(admin, "wa:global", 3600, 2000);
  if (!global.ok) {
    return {
      ok: false,
      reason: "The assistant is very busy right now. Please call the school office.",
    };
  }

  return { ok: true };
}
