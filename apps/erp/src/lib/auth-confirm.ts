import type { EmailOtpType } from "@supabase/supabase-js";

// Shared by the email-link landing page (/auth/confirm), the POST that spends
// the token (/auth/confirm/verify) and the PKCE callback (/auth/callback).

/**
 * The one code an email-link failure redirects with. Supabase's own message
 * ("Email link is invalid or has expired", or worse, an internal one) used to
 * ride along in the query string and be painted on the page verbatim, which
 * also let anyone craft a link that put their own sentence on our login screen.
 */
export const LINK_ERROR_CODE = "link_invalid_or_expired";

/** Fixed sentences for the `?error=` codes the auth routes redirect with. */
export const AUTH_LINK_ERROR_MESSAGES: Record<string, string> = {
  [LINK_ERROR_CODE]:
    "This link is invalid or has expired. Links work once and only for a limited time — please request a new one.",
  missing_token: "This link is incomplete. Please request a new one.",
  missing_code: "This sign-in link is incomplete. Please request a new one.",
};

const OTP_TYPES: readonly EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

export function parseOtpType(value: unknown): EmailOtpType | null {
  return typeof value === "string" && (OTP_TYPES as readonly string[]).includes(value)
    ? (value as EmailOtpType)
    : null;
}

/**
 * Only allow same-origin relative redirects. `next` is attacker-supplied; a
 * value like `//evil.com` or `/\evil.com` is normalized by some browsers to a
 * protocol-relative off-site redirect (open redirect → phishing).
 */
export function safeNext(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/\\")
  ) {
    return "/portal/login";
  }
  return value;
}

/** Where a failed link lands: the set-password page for a reset, else login. */
export function linkErrorPath(next: string, code: string = LINK_ERROR_CODE): string {
  const page = next.startsWith("/portal/reset-password")
    ? "/portal/reset-password"
    : "/portal/login";
  return `${page}?error=${encodeURIComponent(code)}`;
}
