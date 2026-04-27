import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@nkps/shared"],
  images: {
    minimumCacheTTL: 2678400,
    formats: ["image/webp"],
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
  async redirects() {
    return [
      // Legacy /erp-login alias → /erp/login.
      { source: "/erp-login", destination: "/erp/login", permanent: true },

      // /admin/login → /erp/login (ERP is the primary staff entry).
      { source: "/admin/login", destination: "/erp/login", permanent: true },

      // NOTE: CMS-side legacy /admin/content/* and /admin/(gallery|articles|...)
      // redirects were removed in Phase 3.5b. CMS now lives in apps/cms on its
      // own subdomain; cross-subdomain redirects (nkps.com/admin/articles →
      // cms.nkps.com/articles) will be wired via Vercel rewrites in Phase 3.6.

      // ERP module: every non-CMS /admin/* route maps 1:1 to /erp/*.
      { source: "/admin/academics", destination: "/erp/academics", permanent: true },
      { source: "/admin/academics/:path*", destination: "/erp/academics/:path*", permanent: true },
      { source: "/admin/attendance", destination: "/erp/attendance", permanent: true },
      { source: "/admin/attendance/:path*", destination: "/erp/attendance/:path*", permanent: true },
      { source: "/admin/calendar", destination: "/erp/calendar", permanent: true },
      { source: "/admin/calendar/:path*", destination: "/erp/calendar/:path*", permanent: true },
      { source: "/admin/exams", destination: "/erp/exams", permanent: true },
      { source: "/admin/exams/:path*", destination: "/erp/exams/:path*", permanent: true },
      { source: "/admin/fees", destination: "/erp/fees", permanent: true },
      { source: "/admin/fees/:path*", destination: "/erp/fees/:path*", permanent: true },
      { source: "/admin/people", destination: "/erp/people", permanent: true },
      { source: "/admin/people/:path*", destination: "/erp/people/:path*", permanent: true },
      { source: "/admin/registrations", destination: "/erp/registrations", permanent: true },
      { source: "/admin/registrations/:path*", destination: "/erp/registrations/:path*", permanent: true },
      { source: "/admin/timetable", destination: "/erp/timetable", permanent: true },
      { source: "/admin/timetable/:path*", destination: "/erp/timetable/:path*", permanent: true },

      // Legacy ERP convenience aliases.
      { source: "/admin/exam-types", destination: "/erp/exams/types", permanent: true },
      { source: "/admin/exam-types/:path*", destination: "/erp/exams/types/:path*", permanent: true },
      { source: "/admin/results", destination: "/erp/exams/results", permanent: true },
      { source: "/admin/classes", destination: "/erp/academics/classes", permanent: true },
      { source: "/admin/classes/:path*", destination: "/erp/academics/classes/:path*", permanent: true },
      { source: "/admin/subjects", destination: "/erp/academics/subjects", permanent: true },
      { source: "/admin/subjects/:path*", destination: "/erp/academics/subjects/:path*", permanent: true },
      { source: "/admin/academic-years", destination: "/erp/academics/years", permanent: true },
      { source: "/admin/academic-years/:path*", destination: "/erp/academics/years/:path*", permanent: true },
      { source: "/admin/users", destination: "/erp/people/users", permanent: true },
      { source: "/admin/users/:path*", destination: "/erp/people/users/:path*", permanent: true },
      { source: "/admin/students", destination: "/erp/people/students", permanent: true },
      { source: "/admin/students/:path*", destination: "/erp/people/students/:path*", permanent: true },
      { source: "/admin/staff", destination: "/erp/people/staff", permanent: true },
      { source: "/admin/staff/:path*", destination: "/erp/people/staff/:path*", permanent: true },

      // Bare /admin → /erp (the primary staff dashboard).
      { source: "/admin", destination: "/erp", permanent: true },

      // NOTE: /api/admin/{articles,site-media,section-cards,disclosure-documents,
      // upload-url,contact} redirects were removed in Phase 3.5b — those endpoints
      // now live in apps/cms (cms.nkps.com/api/...) and aren't reachable from
      // the root project anymore. Vercel cross-subdomain rewrites will handle
      // legacy /api/admin/* hits in Phase 3.6 if needed.

      // /api/admin/dashboard/analytics still lives in root (under /api/erp/).
      { source: "/api/admin/dashboard/analytics", destination: "/api/erp/dashboard/analytics", permanent: true },
      { source: "/api/admin/editor-permissions", destination: "/api/erp/editor-permissions", permanent: true },
      { source: "/api/admin/editor-permissions/:path*", destination: "/api/erp/editor-permissions/:path*", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
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
