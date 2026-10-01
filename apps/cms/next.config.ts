import type { NextConfig } from "next";

// Content-Security-Policy is NOT set here. It carries a fresh nonce per
// request, so it is built in the proxy (src/proxy.ts → @nkps/shared
// lib/supabase/middleware.ts + lib/security/csp.ts) and set on documents only.
// Every third-party origin the app loads from is listed there.

const nextConfig: NextConfig = {
  // No `X-Powered-By: Next.js` — it only tells a scanner what to try.
  poweredByHeader: false,
  transpilePackages: ["@nkps/shared"],
  images: {
    unoptimized: true,
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
  async redirects() {
    return [
      // Legacy /admin/* paths that previously lived alongside CMS in the
      // root project. Kept as 308s so external bookmarks still resolve.
      { source: "/admin", destination: "/", permanent: true },
      { source: "/admin/login", destination: "/login", permanent: true },
      { source: "/admin/articles", destination: "/articles", permanent: true },
      { source: "/admin/articles/:path*", destination: "/articles/:path*", permanent: true },
      { source: "/admin/gallery", destination: "/gallery", permanent: true },
      { source: "/admin/gallery/:path*", destination: "/gallery/:path*", permanent: true },
      { source: "/admin/contact", destination: "/contact", permanent: true },
      { source: "/admin/contact/:path*", destination: "/contact/:path*", permanent: true },
      { source: "/admin/transfer-certificates", destination: "/transfer-certificates", permanent: true },
      { source: "/admin/transfer-certificates/:path*", destination: "/transfer-certificates/:path*", permanent: true },
      { source: "/admin/site-media", destination: "/site-media", permanent: true },
      { source: "/admin/disclosure", destination: "/disclosure", permanent: true },
      { source: "/admin/content/:path*", destination: "/:path*", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
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
      {
        // The service worker must never be cached, or users get stuck on a
        // stale app version. Also pin the correct MIME type.
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
