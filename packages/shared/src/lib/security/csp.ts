// Per-request, nonce-based Content-Security-Policy for the authenticated apps
// (apps/erp, apps/cms). Built in the proxy, once per document request; see
// node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md.
//
// How the nonce reaches the page: the proxy puts the policy on the REQUEST
// headers as well as the response. Next parses `'nonce-…'` out of the request's
// Content-Security-Policy while rendering and stamps it onto its own framework
// and chunk scripts; our own inline scripts read it back via getNonce()
// (./nonce.ts). That only happens at render time, so every page in these two
// apps must render dynamically — the root layouts call getNonce(), which reads
// headers() and opts the whole tree in.
//
// apps/website deliberately does NOT use this: a nonce forces dynamic
// rendering, which would throw away static/ISR on the public marketing site.
// It keeps a static header in its next.config.ts.

/** Origins a single app adds on top of the shared baseline. */
export interface CspSources {
  script?: readonly string[];
  img?: readonly string[];
  connect?: readonly string[];
  frame?: readonly string[];
}

/** Cloudflare Turnstile: api.js is a script, the challenge renders in an
 *  iframe. Allowed in every app so a form can add the widget without a CSP
 *  change landing alongside it. */
export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

const SUPABASE_WILDCARD = "https://*.supabase.co";
const SUPABASE_WSS_WILDCARD = "wss://*.supabase.co";

/** The configured Supabase origin when it is NOT a *.supabase.co host (a
 *  custom domain, or a local `supabase start` on 127.0.0.1), so the wildcard
 *  alone would miss it. */
function extraSupabaseOrigins(): string[] {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return [];
  try {
    const url = new URL(raw);
    if (url.hostname.endsWith(".supabase.co")) return [];
    const ws = url.protocol === "https:" ? "wss:" : "ws:";
    return [url.origin, `${ws}//${url.host}`];
  } catch {
    return [];
  }
}

/** 128 random bits, base64. Unpredictable and fresh per request. */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function buildCsp(nonce: string, sources: CspSources = {}): string {
  const isDev = process.env.NODE_ENV === "development";
  const supabase = [SUPABASE_WILDCARD, ...extraSupabaseOrigins()];
  const supabaseConnect = [
    SUPABASE_WILDCARD,
    SUPABASE_WSS_WILDCARD,
    ...extraSupabaseOrigins(),
  ];

  const directives: string[] = [
    "default-src 'self'",
    // 'strict-dynamic': a script the nonce let in may load further scripts
    // (Next's chunk loader, the Google Maps loader, Turnstile's api.js) without
    // each URL being listed. Browsers that understand it ignore 'self' and the
    // host list; those are kept as the fallback for CSP2-only browsers.
    // React needs 'unsafe-eval' in development only, for its error overlays.
    [
      "script-src 'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(isDev ? ["'unsafe-eval'"] : []),
      TURNSTILE_ORIGIN,
      ...(sources.script ?? []),
    ].join(" "),
    // style-src keeps 'unsafe-inline' on purpose. Framer Motion writes inline
    // `style` attributes on every animated element, sonner and the base-ui
    // primitives inject <style> at runtime, and none of them can carry a
    // nonce. Adding a nonce here would also make browsers IGNORE
    // 'unsafe-inline', breaking all of that — so there is no nonce on styles.
    // Inline styles can't execute code; the script policy is what stops XSS.
    "style-src 'self' 'unsafe-inline'",
    ["img-src 'self' data: blob:", ...supabase, ...(sources.img ?? [])].join(" "),
    "font-src 'self' data:",
    ["connect-src 'self'", ...supabaseConnect, ...(sources.connect ?? [])].join(" "),
    ["frame-src 'self'", TURNSTILE_ORIGIN, ...(sources.frame ?? [])].join(" "),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // PWA: the service worker and web-app manifest are same-origin. These
    // fall back to default-src 'self' if omitted, but are made explicit so
    // the fallback chain doesn't have to be reasoned about.
    "worker-src 'self'",
    "manifest-src 'self'",
    // Production is HTTPS end to end; in dev it would try to upgrade
    // http://localhost subresources.
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ];

  return directives.join("; ");
}
