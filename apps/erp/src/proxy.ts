import { type NextRequest } from "next/server";
import {
  updateSession,
  type ProxyPolicy,
} from "@nkps/shared/lib/supabase/middleware";

// apps/erp serves admin (root /), /portal, /teacher, /student, /parent.
// Auth, role gating, editor permission checks, the per-request CSP nonce and
// the /api CSRF origin check all live in @nkps/shared updateSession; this file
// only says what is specific to the ERP.
const POLICY: ProxyPolicy = {
  app: "erp",
  csp: {
    // Google Maps JS API: Places Autocomplete on the transport address fields.
    // The js-api-loader injects scripts from maps.googleapis.com /
    // maps.gstatic.com (script), the widget XHRs to maps.googleapis.com
    // (connect), and its dropdown shows the "powered by Google" logo from
    // maps.gstatic.com (img).
    script: ["https://maps.googleapis.com", "https://maps.gstatic.com"],
    // OpenStreetMap tiles: transport map base layer.
    img: [
      "https://*.tile.openstreetmap.org",
      "https://tile.openstreetmap.org",
      "https://maps.googleapis.com",
      "https://maps.gstatic.com",
    ],
    // Nominatim: transport address geocoding fallback.
    connect: [
      "https://nominatim.openstreetmap.org",
      "https://maps.googleapis.com",
    ],
  },
  // Server-to-server callers. Each verifies its own secret in the route:
  // the WhatsApp webhook its Meta signature / verify token, Exotel its
  // EXOTEL_CALLBACK_TOKEN query parameter.
  csrfExemptPaths: ["/api/webhooks/whatsapp", "/api/telephony/exotel-callback"],
};

export async function proxy(request: NextRequest) {
  return await updateSession(request, POLICY);
}

export const config = {
  matcher: [
    // Run on all paths EXCEPT static assets + Next.js internals. /api IS
    // matched — that is where the CSRF check runs — and so are /auth/*
    // callbacks, which the gate lets through without a session.
    // The `.*\\.` arm excludes anything containing a literal dot — i.e. files
    // with extensions like /images/logo.png. Without it, the auth gate
    // intercepts public assets and the Image optimizer gets a 307 → null.
    // Prefetches are deliberately NOT skipped (the CSP guide suggests it):
    // skipping them would skip the auth gate for RSC prefetches too.
    "/((?!_next/static|_next/image|_next/dev|favicon.ico|.*\\.).*)",
  ],
};
