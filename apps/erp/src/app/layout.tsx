import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { Toaster } from "@nkps/shared/components/ui/sonner";
import { PWARegister } from "@nkps/shared/components/pwa/PWARegister";
import { InstallPrompt } from "@nkps/shared/components/pwa/InstallPrompt";
import { iconUrl } from "@nkps/shared/lib/pwa-manifest";
import {
  ThemeProvider,
  THEME_INIT_SCRIPT,
} from "@nkps/shared/components/providers/ThemeProvider";
import { getNonce } from "@nkps/shared/lib/security/nonce";
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
    //
    // Versioned: iOS keeps an installed home-screen icon forever, but it reads
    // this link again on the next Add to Home Screen, and the query string is
    // what stops a CDN or browser cache handing it the previous PNG.
    apple: iconUrl("apple-touch-icon.png"),
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Required before env(safe-area-inset-*) reports anything but 0. Without it
  // the app is letterboxed inside the safe area on a notched phone and the
  // insets the layout reads are all zero.
  viewportFit: "cover",
  // themeColor is deliberately NOT declared here. Next re-renders the viewport
  // metadata on client-side navigation, which reverted the browser chrome to
  // the light colour mid-session; ThemeProvider owns the tag instead.
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // The proxy's per-request CSP nonce (no 'unsafe-inline' on script-src), so
  // the theme script below is allowed to run. Reading it also makes every page
  // render dynamically, which the nonce needs — see lib/security/nonce.ts.
  const nonce = await getNonce();
  return (
    // suppressHydrationWarning because the script below writes to <html>'s
    // class and style before React sees the document. It suppresses the warning
    // for this element's attributes only, not for the tree inside it.
    <html
      lang="en"
      className={`${inter.variable} ${playfair.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* suppressHydrationWarning: browsers hide a nonce from the DOM once
            the page has parsed (it reads back as ""), which React would
            otherwise report as a server/client attribute mismatch. */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
      </head>
      <body className="min-h-screen antialiased">
        <ThemeProvider>
          {children}
          <PWARegister />
          <InstallPrompt appName="NKPS Portal" />
          <Toaster position="top-right" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
