import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { Toaster } from "@nkps/shared/components/ui/sonner";
import { PWARegister } from "@nkps/shared/components/pwa/PWARegister";
import { InstallPrompt } from "@nkps/shared/components/pwa/InstallPrompt";
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

// Admin / portal layout — minimal wrapper. CMS and ERP pages each provide
// their own sidebar layouts via /src/app/cms/layout.tsx and /src/app/erp/layout.tsx.
// Public-site routes live in apps/website/.
export const metadata: Metadata = {
  title: "NKPS Portal",
  appleWebApp: {
    capable: true,
    // "black" rather than "default" or "black-translucent". The status bar has
    // to stay legible in both themes, and the other two options each fail in
    // one of them: "black-translucent" forces white glyphs over whatever the
    // page paints there (invisible above the light app bar), while "default"
    // takes the page background and can land dark-on-dark. An opaque black bar
    // is theme-independent, and sits flush against the navy app chrome.
    statusBarStyle: "black",
    title: "NKPS Portal",
  },
  icons: {
    // On disk since the PWA work but never referenced, so iOS was falling back
    // to a screenshot of the page for the home-screen icon.
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Required before env(safe-area-inset-*) reports anything but 0. Without it
  // the app is letterboxed inside the safe area on a notched phone and the
  // insets the layout reads are all zero.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0A1628" },
    { media: "(prefers-color-scheme: dark)", color: "#060E1A" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable}`}>
      <body className="min-h-screen antialiased">
        {children}
        <PWARegister />
        <InstallPrompt appName="NKPS Portal" />
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
