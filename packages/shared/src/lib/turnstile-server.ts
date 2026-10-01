// Server-side Cloudflare Turnstile verification (Siteverify).
//
// Every token must be checked here: the widget producing one proves nothing by
// itself, and a token is single-use and valid for 300 seconds.
//
// Failure policy:
//  - Not configured (either key unset)      → pass, `skipped: true`.
//  - Token missing, malformed or rejected   → FAIL. That is the whole point.
//  - Cloudflare unreachable / non-2xx / slow → pass, logged. The routes behind
//    this are also rate limited, and a Cloudflare blip should not stop a
//    parent submitting an enquiry. An attacker cannot cause our server's
//    outbound call to fail, so this opens nothing they can steer.

import { clientIp } from "./rate-limit";
import { TURNSTILE_HEADER, TURNSTILE_SITE_KEY } from "./turnstile";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const SITEVERIFY_TIMEOUT_MS = 5000;
// Cloudflare documents tokens as at most 2048 characters.
const MAX_TOKEN_LENGTH = 2048;

export interface TurnstileResult {
  ok: boolean;
  /** True when no verification actually happened (not configured, or Cloudflare unreachable). */
  skipped: boolean;
  errorCodes: string[];
}

/** Whether the server should demand a token. Both keys, or neither. */
export function turnstileEnforced(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY) && TURNSTILE_SITE_KEY.length > 0;
}

export async function verifyTurnstile(
  token: string | null | undefined,
  ip?: string | null
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !turnstileEnforced()) {
    return { ok: true, skipped: true, errorCodes: [] };
  }

  if (!token || token.length > MAX_TOKEN_LENGTH) {
    return { ok: false, skipped: false, errorCodes: ["missing-input-response"] };
  }

  const form = new URLSearchParams({ secret, response: token });
  if (ip && ip !== "unknown") form.set("remoteip", ip);

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`[turnstile] siteverify HTTP ${res.status}; allowing request`);
      return { ok: true, skipped: true, errorCodes: [`http-${res.status}`] };
    }
    const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    const errorCodes = data["error-codes"] ?? [];
    if (data.success !== true) {
      // internal-error is Cloudflare's own fault, not the visitor's.
      if (errorCodes.includes("internal-error")) {
        console.error("[turnstile] siteverify internal-error; allowing request");
        return { ok: true, skipped: true, errorCodes };
      }
      return { ok: false, skipped: false, errorCodes };
    }
    return { ok: true, skipped: false, errorCodes };
  } catch (err) {
    console.error(
      "[turnstile] siteverify unreachable; allowing request:",
      err instanceof Error ? err.message : err
    );
    return { ok: true, skipped: true, errorCodes: ["network-error"] };
  }
}

/** Verify the token the browser sent in the `x-turnstile-token` header. */
export function verifyTurnstileRequest(request: Request): Promise<TurnstileResult> {
  return verifyTurnstile(request.headers.get(TURNSTILE_HEADER), clientIp(request));
}
