import type { NextConfig } from "next";

// Content-Security-Policy — static, and deliberately so.
//
// apps/erp and apps/cms use a per-request nonce (no 'unsafe-inline' on
// script-src), built in their proxies. This site does NOT, by design: a nonce
// only works on a page rendered for that request, so adopting one would force
// every page here to render dynamically and throw away static generation and
// ISR — the CDN-cached HTML that keeps the public site fast and cheap. The
// trade-off is accepted here because the site has no login and no user data
// to steal; the ERP and CMS, which have both, carry the strict policy.
//
// So 'unsafe-inline' stays on script-src: Next's App Router injects inline
// hydration/bootstrap scripts that can't carry a nonce on a static page. The
// remaining directives (connect/img/frame/object/base/form) still constrain
// exfiltration and clickjacking. Origins: Supabase (storage images), Google
// Maps (contact-page location embed), Google Analytics (gtag via
// @next/third-parties), Cloudflare Turnstile (bot check on public forms:
// api.js script + challenge iframe).
const isDev = process.env.NODE_ENV === "development";
const TURNSTILE = "https://challenges.cloudflare.com";
const CSP = [
  "default-src 'self'",
  // React needs 'unsafe-eval' in development only, for its error overlays.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://www.googletagmanager.com ${TURNSTILE}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co https://www.google-analytics.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co https://www.googletagmanager.com https://www.google-analytics.com https://*.analytics.google.com",
  `frame-src 'self' https://www.google.com ${TURNSTILE}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // The one tightening that is free on a static site: everything it loads is
  // HTTPS, so a stray http:// URL in CMS content gets upgraded rather than
  // loaded in the clear. (Not in dev, where it would upgrade localhost.)
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig: NextConfig = {
  // No `X-Powered-By: Next.js` — it only tells a scanner what to try.
  poweredByHeader: false,
  transpilePackages: ["@nkps/shared"],
  images: {
    // Public marketing site: let Next optimize images (responsive WebP +
    // long-lived CDN cache) so we don't ship 1-2MB originals to mobile. The
    // config below keeps Vercel transformation usage low — webp-only, a single
    // quality, a 31-day minimum cache TTL, and a bounded set of size buckets.
    // (cms/erp keep unoptimized:true — auth-gated, low-traffic, not worth the quota.)
    minimumCacheTTL: 2678400,
    // AVIF first (smaller than WebP on photographic hero images, cutting mobile
    // LCP bytes), WebP fallback for older clients. Next negotiates per request.
    formats: ["image/avif", "image/webp"],
    qualities: [75],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [48, 64, 96, 128, 256, 384],
    localPatterns: [
      {
        pathname: "/images/**",
        search: "",
      },
    ],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
    ],
  },
  // Pages of the old PHP site that Google still crawls (Search Console →
  // Pages → 404 / 403 / 5xx, 2026-10). A permanent redirect hands each one's
  // standing to its new equivalent instead of an error. Only URLs Google has
  // actually reported belong here; the hundreds of spam URLs in the same report
  // (/word/word123/abc-123/, /123456789, /012345678.htm) should stay 404.
  //
  // The .php entries only work once the Vercel firewall stops challenging
  // `.php` requests for them: it answers before this config runs, and Google
  // gets a 403 (verified with Search Console's live test).
  async redirects() {
    return [
      { source: "/index.php", destination: "/", permanent: true },
      { source: "/pages.php", destination: "/", permanent: true },
      { source: "/admission-information.php", destination: "/admissions", permanent: true },
      { source: "/scholarship-schemes.php", destination: "/admissions", permanent: true },
      { source: "/ptm-schedule.php", destination: "/academic-calendar", permanent: true },
      { source: "/classroom.php", destination: "/facilities", permanent: true },
      { source: "/circular.php", destination: "/articles", permanent: true },
      { source: "/news", destination: "/articles", permanent: true },
      { source: "/blood-donation-camp", destination: "/articles", permanent: true },
      { source: "/our-staff-non", destination: "/about", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          // TODO(owner decision): add `; preload` and submit the domain to
          // hstspreload.org. Deliberately not done here: preload is baked into
          // browser builds and takes months to undo, and it would bind every
          // subdomain of nkpublicschool.com to HTTPS forever.
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          // Puts this window in its own browsing-context group, so a page this
          // site opens (or that opens it) can't hold a window.opener handle
          // into it. Same-origin popups (print windows) are unaffected.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
