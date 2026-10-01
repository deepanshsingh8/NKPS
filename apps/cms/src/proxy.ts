import { type NextRequest } from "next/server";
import {
  updateSession,
  type ProxyPolicy,
} from "@nkps/shared/lib/supabase/middleware";

// apps/cms proxy. The auth + role gate (admin/staff, and teachers holding a
// CMS grant; must_change_password → the ERP's change-password page), the
// per-request CSP nonce and the /api CSRF origin check all live in
// @nkps/shared updateSession — the same code the ERP runs, so the two cannot
// drift apart.
const POLICY: ProxyPolicy = {
  app: "cms",
  // Supabase (storage images, REST/auth) and Turnstile are in the shared
  // baseline; the CMS loads nothing else from a third party.
  csp: {},
  // No webhooks or server-to-server callers in the CMS.
  csrfExemptPaths: [],
};

export async function proxy(request: NextRequest) {
  return await updateSession(request, POLICY);
}

export const config = {
  matcher: [
    // Run on all paths EXCEPT static assets + Next.js internals. /api IS
    // matched, for the CSRF origin check (no session lookup runs there).
    // The `.*\\.` arm excludes anything containing a literal dot — i.e. files
    // with extensions like /images/logo.png. Without it, the auth gate
    // intercepts public assets and the Image optimizer gets a 307 → null.
    "/((?!_next/static|_next/image|_next/dev|favicon.ico|.*\\.).*)",
  ],
};
