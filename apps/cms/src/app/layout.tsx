import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { Toaster } from "@nkps/shared/components/ui/sonner";
import { PWARegister } from "@nkps/shared/components/pwa/PWARegister";
import { InstallPrompt } from "@nkps/shared/components/pwa/InstallPrompt";
import { iconUrl } from "@nkps/shared/lib/pwa-manifest";
import { CmsShell } from "@/components/CmsShell";
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

export const metadata: Metadata = {
  title: "NKPS CMS",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    // See apps/erp/src/app/layout.tsx for why "black" and not the other two.
    statusBarStyle: "black",
    title: "NKPS CMS",
  },
  icons: {
    // See apps/erp/src/app/layout.tsx for why this carries a version.
    apple: iconUrl("apple-touch-icon.png"),
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // See apps/erp/src/app/layout.tsx — safe-area insets report 0 without this.
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
    // See apps/erp/src/app/layout.tsx for why the inline script and the
    // suppressHydrationWarning are here.
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
          <CmsShell>{children}</CmsShell>
          <PWARegister />
          <InstallPrompt appName="NKPS CMS" />
          <Toaster position="top-right" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
