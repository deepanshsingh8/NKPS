import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
    ],
  },
  async redirects() {
    return [
      {
        source: "/admin/exam-types",
        destination: "/admin/exams/types",
        permanent: false,
      },
      {
        source: "/admin/exam-types/:path*",
        destination: "/admin/exams/types/:path*",
        permanent: false,
      },
      {
        source: "/admin/results",
        destination: "/admin/exams/results",
        permanent: false,
      },
      {
        source: "/admin/gallery",
        destination: "/admin/content/gallery",
        permanent: false,
      },
      {
        source: "/admin/gallery/:path*",
        destination: "/admin/content/gallery/:path*",
        permanent: false,
      },
      {
        source: "/admin/articles",
        destination: "/admin/content/articles",
        permanent: false,
      },
      {
        source: "/admin/articles/:path*",
        destination: "/admin/content/articles/:path*",
        permanent: false,
      },
      {
        source: "/admin/site-media",
        destination: "/admin/content/site-media",
        permanent: false,
      },
      {
        source: "/admin/site-media/:path*",
        destination: "/admin/content/site-media/:path*",
        permanent: false,
      },
      {
        source: "/admin/disclosure",
        destination: "/admin/content/disclosure",
        permanent: false,
      },
      {
        source: "/admin/disclosure/:path*",
        destination: "/admin/content/disclosure/:path*",
        permanent: false,
      },
      {
        source: "/admin/classes",
        destination: "/admin/academics/classes",
        permanent: false,
      },
      {
        source: "/admin/classes/:path*",
        destination: "/admin/academics/classes/:path*",
        permanent: false,
      },
      {
        source: "/admin/subjects",
        destination: "/admin/academics/subjects",
        permanent: false,
      },
      {
        source: "/admin/subjects/:path*",
        destination: "/admin/academics/subjects/:path*",
        permanent: false,
      },
      {
        source: "/admin/academic-years",
        destination: "/admin/academics/years",
        permanent: false,
      },
      {
        source: "/admin/academic-years/:path*",
        destination: "/admin/academics/years/:path*",
        permanent: false,
      },
      {
        source: "/admin/users",
        destination: "/admin/people/users",
        permanent: false,
      },
      {
        source: "/admin/users/:path*",
        destination: "/admin/people/users/:path*",
        permanent: false,
      },
      {
        source: "/admin/students",
        destination: "/admin/people/students",
        permanent: false,
      },
      {
        source: "/admin/students/:path*",
        destination: "/admin/people/students/:path*",
        permanent: false,
      },
      {
        source: "/admin/staff",
        destination: "/admin/people/staff",
        permanent: false,
      },
      {
        source: "/admin/staff/:path*",
        destination: "/admin/people/staff/:path*",
        permanent: false,
      },
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
