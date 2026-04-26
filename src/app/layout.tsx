import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import { Analytics } from "@vercel/analytics/next";
import { Toaster } from "@/shared/components/ui/sonner";
import { LayoutShell } from "@/website/components/layout/LayoutShell";
import { JsonLd } from "@/website/components/seo/JsonLd";
import { SITE_URL, schoolJsonLd } from "@/shared/lib/seo";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;
const GSC_VERIFICATION = process.env.NEXT_PUBLIC_GSC_VERIFICATION;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "NK Public School — Best CBSE School in Jaipur Since 1985",
    template: "%s | NK Public School",
  },
  description:
    "NK Public School (NKPS), Rajawas — a CBSE affiliated co-educational school in Jaipur offering Nursery to Class XII. 40+ years of holistic education, 20,000+ students, 300+ faculty.",
  keywords: [
    "NK Public School",
    "NKPS",
    "Best School in Jaipur",
    "Best CBSE School in Jaipur",
    "CBSE School Jaipur",
    "CBSE School Rajawas",
    "Schools in Rajawas Jaipur",
    "School near Grand Sikar Road",
    "Top School North Jaipur",
    "School Admissions Jaipur",
    "Co-ed School Jaipur",
  ],
  authors: [{ name: "NK Public School" }],
  creator: "NK Public School",
  publisher: "NK Public School",
  alternates: { canonical: "/" },
  openGraph: {
    title: "NK Public School — Best CBSE School in Jaipur Since 1985",
    description:
      "Premier CBSE school in Jaipur offering holistic education from Nursery to Class XII. 40+ years, 20,000+ students.",
    url: SITE_URL,
    type: "website",
    locale: "en_IN",
    siteName: "NK Public School",
    images: [
      {
        url: `${SITE_URL}/opengraph-image`,
        width: 1200,
        height: 630,
        alt: "NK Public School — CBSE Affiliated, Jaipur",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NK Public School — Best CBSE School in Jaipur Since 1985",
    description:
      "Premier CBSE school in Jaipur offering holistic education from Nursery to Class XII.",
    images: [`${SITE_URL}/opengraph-image`],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  verification: GSC_VERIFICATION ? { google: GSC_VERIFICATION } : undefined,
  category: "education",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable}`}>
      <body className="min-h-screen flex flex-col antialiased">
        <JsonLd data={schoolJsonLd} />
        <LayoutShell>
          <main className="flex-1">{children}</main>
        </LayoutShell>
        <Toaster position="top-right" richColors />
        {GA_ID ? <GoogleAnalytics gaId={GA_ID} /> : null}
        <Analytics />
      </body>
    </html>
  );
}
