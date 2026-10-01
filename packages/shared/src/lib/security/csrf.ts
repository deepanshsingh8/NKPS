import type { NextRequest } from "next/server";

// Cross-site request forgery guard for /api/* writes, run once in the proxy.
//
// Many ERP write routes authenticate by session COOKIE (createClient() +
// auth.getUser()). A browser attaches that cookie to a cross-site POST, so
// without this check any page on the internet could submit a form at, say,
// /api/attendance/bulk as whoever is signed in. @supabase/ssr's SameSite=Lax
// default blocks the plain cross-site POST today, but that is a library
// default rather than a decision of ours, and Lax does nothing at all against
// a sibling subdomain, which counts as same-site.
//
// The rule, for POST/PUT/PATCH/DELETE on /api/*:
//   - `Authorization: Bearer …` → allow. A cross-origin page cannot attach that
//     header without a CORS preflight, which none of our routes answer.
//   - `Sec-Fetch-Site: same-origin` → allow. Browsers set this header
//     themselves and page script cannot forge it.
//   - `Sec-Fetch-Site` absent (older browser) and `Origin` equals this host →
//     allow.
//   - anything else → 403. That includes same-site (cms.* → erp.*), cross-site,
//     `Origin: null`, and a request with neither header.
//
// Server-to-server callers (webhooks) send no browser headers at all, so they
// are listed by exact path and skipped; each of them authenticates itself
// (signature / shared token) inside the route.

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isCsrfExempt(
  request: NextRequest,
  exemptPaths: readonly string[]
): boolean {
  if (SAFE_METHODS.has(request.method)) return true;
  return exemptPaths.includes(request.nextUrl.pathname);
}

export function passesOriginCheck(request: NextRequest): boolean {
  const auth = request.headers.get("authorization");
  if (auth && /^Bearer\s+\S/i.test(auth)) return true;

  const site = request.headers.get("sec-fetch-site");
  if (site !== null) return site === "same-origin";

  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host || origin === "null") return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
