// Cloudflare Turnstile — values shared by the widget and the server check.
//
// Env-gated end to end. With NEXT_PUBLIC_TURNSTILE_SITE_KEY unset the widget
// renders nothing and forms submit exactly as before; with TURNSTILE_SECRET_KEY
// unset the server skips verification. The server enforces only when BOTH are
// set: a secret without a site key would mean no browser ever sends a token
// and every form is rejected.
//
// Safe to import from client and server code: no secrets here.
// NEXT_PUBLIC_* is inlined at build time, so this must be read through the
// literal `process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY`.

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

/** True when the browser should render the widget and send a token. */
export const TURNSTILE_ENABLED = TURNSTILE_SITE_KEY.length > 0;

/** Request header our own API routes read the token from. A header rather
 *  than a body field so a route can verify before (and independently of)
 *  parsing its body. Supabase Auth takes its token as `captchaToken` instead. */
export const TURNSTILE_HEADER = "x-turnstile-token";

/** Shown when verification fails or the token is missing. */
export const TURNSTILE_FAILED_MESSAGE =
  "The security check didn't go through. Please complete it and try again.";
