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

      // CMS module: /admin/content/* and CMS-only top-level paths flatten under /cms.
      { source: "/admin/content/gallery", destination: "/cms/gallery", permanent: true },
      { source: "/admin/content/gallery/:path*", destination: "/cms/gallery/:path*", permanent: true },
      { source: "/admin/content/articles", destination: "/cms/articles", permanent: true },
      { source: "/admin/content/articles/:path*", destination: "/cms/articles/:path*", permanent: true },
      { source: "/admin/content/site-media", destination: "/cms/site-media", permanent: true },
      { source: "/admin/content/site-media/:path*", destination: "/cms/site-media/:path*", permanent: true },
      { source: "/admin/content/disclosure", destination: "/cms/disclosure", permanent: true },
      { source: "/admin/content/disclosure/:path*", destination: "/cms/disclosure/:path*", permanent: true },
      { source: "/admin/content", destination: "/cms", permanent: true },
      { source: "/admin/transfer-certificates", destination: "/cms/transfer-certificates", permanent: true },
      { source: "/admin/transfer-certificates/:path*", destination: "/cms/transfer-certificates/:path*", permanent: true },
      { source: "/admin/contact", destination: "/cms/contact", permanent: true },
      { source: "/admin/contact/:path*", destination: "/cms/contact/:path*", permanent: true },

      // Convenience short-form CMS aliases (no longer go through /admin).
      { source: "/admin/gallery", destination: "/cms/gallery", permanent: true },
      { source: "/admin/gallery/:path*", destination: "/cms/gallery/:path*", permanent: true },
      { source: "/admin/articles", destination: "/cms/articles", permanent: true },
      { source: "/admin/articles/:path*", destination: "/cms/articles/:path*", permanent: true },
      { source: "/admin/site-media", destination: "/cms/site-media", permanent: true },
      { source: "/admin/site-media/:path*", destination: "/cms/site-media/:path*", permanent: true },
      { source: "/admin/disclosure", destination: "/cms/disclosure", permanent: true },
      { source: "/admin/disclosure/:path*", destination: "/cms/disclosure/:path*", permanent: true },

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

      // CMS-side admin API renames (CMS-only endpoints relocated under /api/cms/*).
      { source: "/api/admin/articles", destination: "/api/cms/articles", permanent: true },
      { source: "/api/admin/articles/:path*", destination: "/api/cms/articles/:path*", permanent: true },
      { source: "/api/admin/site-media", destination: "/api/cms/site-media", permanent: true },
      { source: "/api/admin/site-media/:path*", destination: "/api/cms/site-media/:path*", permanent: true },
      { source: "/api/admin/section-cards", destination: "/api/cms/section-cards", permanent: true },
      { source: "/api/admin/section-cards/:path*", destination: "/api/cms/section-cards/:path*", permanent: true },
      { source: "/api/admin/disclosure-documents", destination: "/api/cms/disclosure-documents", permanent: true },
      { source: "/api/admin/disclosure-documents/:path*", destination: "/api/cms/disclosure-documents/:path*", permanent: true },
      { source: "/api/admin/upload-url", destination: "/api/cms/upload-url", permanent: true },
      { source: "/api/admin/upload-url/:path*", destination: "/api/cms/upload-url/:path*", permanent: true },

      // Phase 3.3: cross-cutting admin APIs split into module-specific halves.
      { source: "/api/admin/contact", destination: "/api/cms/contact", permanent: true },
      { source: "/api/admin/contact/:path*", destination: "/api/cms/contact/:path*", permanent: true },
      { source: "/api/admin/dashboard/analytics", destination: "/api/erp/dashboard/analytics", permanent: true },
      // /api/admin/dashboard split → no single redirect target (callers must
      // pick /api/cms/dashboard or /api/erp/dashboard). Old clients hit /api/admin/dashboard
      // and get a 404; that's the intended signal that they need to be updated.
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
