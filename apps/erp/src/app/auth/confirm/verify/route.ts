import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  LINK_ERROR_CODE,
  linkErrorPath,
  parseOtpType,
  safeNext,
} from "@/lib/auth-confirm";

// POST /auth/confirm/verify — spends an email link's one-time token.
//
// The link in the email points at GET /auth/confirm, which only renders a
// "Continue" button. Mail scanners (Outlook Safe Links, Defender, antivirus
// gateways) fetch every link in a message before the person does; when that
// GET verified the token, the scanner used it up and the person got "invalid
// or expired". Scanners follow links, they do not submit forms, so the token is
// spent here, on the POST the button sends.
//
// Uses the token_hash + verifyOtp pattern rather than Supabase's
// /auth/v1/verify redirect — no dependency on Supabase's redirect allowlist or
// flow type, and the session cookies are set server-side on the redirect.

const SEE_OTHER = 303;

/**
 * The form is same-origin. A cross-site POST here would be a login-CSRF: it
 * could sign the victim into an account whose token the attacker holds.
 * Browsers always send Origin on a form POST; a request without one (an old
 * client, curl) is let through because it carries no ambient credentials the
 * attacker could ride on.
 */
function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return true;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  const expected = [
    request.nextUrl.host,
    request.headers.get("x-forwarded-host"),
    request.headers.get("host"),
  ].filter((h): h is string => Boolean(h));
  return expected.includes(host);
}

export async function POST(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const form = await request.formData().catch(() => null);
  const tokenHash = form?.get("token_hash");
  const type = parseOtpType(form?.get("type"));
  const next = safeNext(form?.get("next"));

  const fail = (code: string = LINK_ERROR_CODE) =>
    NextResponse.redirect(`${origin}${linkErrorPath(next, code)}`, SEE_OTHER);

  if (!isSameOrigin(request)) return fail();
  if (typeof tokenHash !== "string" || !tokenHash || !type) return fail("missing_token");

  const response = NextResponse.redirect(`${origin}${next}`, SEE_OTHER);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) {
    // The reason stays in the server log; the browser gets a fixed code.
    console.error("[auth/confirm] verifyOtp failed:", error.code ?? error.message);
    return fail();
  }

  return response;
}
