import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { LayoutShell } from "@/components/layout/LayoutShell";
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

export const metadata: Metadata = {
  title: {
    default: "NK Public School — Empowering Young Minds Since 1985",
    template: "%s | NK Public School",
  },
  description:
    "NK Public School, CBSE affiliated, is a premier educational institution in Jaipur offering holistic education from Nursery to Class XII. Founded in 1985 with 10000+ students.",
  keywords: [
    "NK Public School",
    "NKPS",
    "CBSE School Jaipur",
    "Best School in Rajawas",
    "School Admissions Jaipur",
  ],
  openGraph: {
    title: "NK Public School — Empowering Young Minds Since 1985",
    description:
      "Premier CBSE school in Jaipur offering holistic education from Nursery to Class XII.",
    type: "website",
    locale: "en_IN",
    siteName: "NK Public School",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable}`}>
      <body className="min-h-screen flex flex-col antialiased">
        <LayoutShell>
          <main className="flex-1">{children}</main>
        </LayoutShell>
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
