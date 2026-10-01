import type { SupabaseClient } from "@supabase/supabase-js";
import { getErpUrl } from "@nkps/shared/lib/cross-app";
import { SCHOOL } from "@nkps/shared/lib/constants";
import {
  sendEmail,
  buildWelcomeEmail,
  buildAdminPasswordResetEmail,
} from "@nkps/shared/lib/email";

/**
 * One-time "set your password" links, and the account emails that carry them.
 *
 * Every account email — a new login, an approved registration, an admin reset,
 * a self-service forgot-password — sends the same kind of link: a Supabase
 * recovery token wrapped in our own `/auth/confirm` URL. No email ever carries
 * a password.
 *
 * Supabase's own mailer and email templates are not used. We ask GoTrue for
 * the token with `auth.admin.generateLink` (which sends nothing), build the
 * link ourselves, and send it through Resend (lib/email.ts). `/auth/confirm`
 * then calls `verifyOtp` server-side, sets the session cookies, and redirects
 * to `next` — by default the reset-password page, which sets the password and
 * clears `must_change_password` through /api/portal/complete-password-change.
 */

/** Where the link lands after /auth/confirm has verified it. */
export const SET_PASSWORD_PATH = "/portal/reset-password";

/**
 * How long a recovery link stays valid. This is Supabase Auth's "Email OTP
 * Expiration" (Authentication → Providers → Email), whose default is 3600s.
 * It is configured there, not here — this only feeds the wording in the
 * emails, so change both together.
 */
export const RECOVERY_LINK_TTL_MINUTES = 60;

export type SetPasswordLinkResult =
  | { ok: true; url: string; userId: string | null }
  | { ok: false; error: string };

/**
 * Mint a one-time recovery token for `email` and return the
 * `/auth/confirm?token_hash=…&type=recovery&next=…` URL that redeems it.
 *
 * The host is ALWAYS the configured ERP URL, never the request's Origin/Host:
 * those are attacker-controlled, and a spoofed Origin on someone else's reset
 * would otherwise mail the victim a genuine token inside a link to the
 * attacker's server. /auth/confirm and the reset-password page both live on
 * the ERP app, so getErpUrl() is correct for every caller.
 *
 * Minting a new token replaces any earlier one for the same user, so only the
 * most recent link works.
 *
 * `next` must be a same-origin path; /auth/confirm re-validates it anyway.
 */
export async function generateSetPasswordLink(
  admin: SupabaseClient,
  email: string,
  next: string = SET_PASSWORD_PATH
): Promise<SetPasswordLinkResult> {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
  });

  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) {
    return { ok: false, error: error?.message ?? "No recovery token returned" };
  }

  const url =
    `${getErpUrl("/auth/confirm")}` +
    `?token_hash=${encodeURIComponent(tokenHash)}` +
    `&type=recovery` +
    `&next=${encodeURIComponent(next)}`;

  return { ok: true, url, userId: data.user?.id ?? null };
}

export type EmailDelivery =
  | { delivered: true }
  | { delivered: false; reason: string };

interface SendSetPasswordEmailParams {
  email: string;
  fullName: string;
  role: string;
  /**
   * `new-account` — a login was just created for this person.
   * `admin-reset` — an admin replaced their password from Users.
   */
  kind: "new-account" | "admin-reset";
}

/**
 * Mint a set-password link for an existing auth user and email it to them.
 *
 * Never throws: account creation has already succeeded by the time this runs,
 * so a mail failure is reported back (for the admin to see) rather than
 * unwinding anything. The reason is safe to show to an admin; it is never the
 * link or token.
 */
export async function sendSetPasswordEmail(
  admin: SupabaseClient,
  { email, fullName, role, kind }: SendSetPasswordEmailParams
): Promise<EmailDelivery> {
  const link = await generateSetPasswordLink(admin, email, SET_PASSWORD_PATH);
  if (!link.ok) {
    console.error(`[auth-links] generateLink failed for ${email}:`, link.error);
    return {
      delivered: false,
      reason: "The set-password link could not be generated.",
    };
  }

  const params = {
    fullName,
    email,
    role,
    setPasswordUrl: link.url,
    loginUrl: getErpUrl("/portal/login"),
    forgotPasswordUrl: getErpUrl("/portal/forgot-password"),
    expiresInMinutes: RECOVERY_LINK_TTL_MINUTES,
  };

  try {
    if (kind === "admin-reset") {
      await sendEmail(
        email,
        `Your ${SCHOOL.shortName} portal password has been reset`,
        buildAdminPasswordResetEmail(params)
      );
    } else {
      await sendEmail(
        email,
        `Set your password for the ${SCHOOL.shortName} portal`,
        buildWelcomeEmail(params)
      );
    }
    return { delivered: true };
  } catch (err) {
    console.error(`[auth-links] ${kind} email to ${email} failed:`, err);
    return {
      delivered: false,
      reason: err instanceof Error ? err.message : "The email could not be sent.",
    };
  }
}
