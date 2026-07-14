"use client";

import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { TopBar } from "@/components/layout/TopBar";
import { ScrollToTop } from "@/components/layout/ScrollToTop";

// Floating, below-the-fold widgets. Load them client-side only so their
// framer-motion bundles don't compete for the main thread during the initial
// hydration that gates LCP.
const ChatBot = dynamic(
  () => import("@nkps/shared/components/ChatBot").then((m) => m.ChatBot),
  { ssr: false }
);
const WhatsAppButton = dynamic(
  () => import("@nkps/shared/components/WhatsAppButton").then((m) => m.WhatsAppButton),
  { ssr: false }
);

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");
  const isCms = pathname.startsWith("/cms");
  const isErp = pathname.startsWith("/erp") && !pathname.startsWith("/erp-login");
  const isPortal = pathname.startsWith("/portal");
  const isStudent = pathname.startsWith("/student") && !pathname.startsWith("/student-life");
  const isTeacher = pathname.startsWith("/teacher");
  const isParent = pathname.startsWith("/parent");
  const hideChrome = isAdmin || isCms || isErp || isPortal || isStudent || isTeacher || isParent;

  if (hideChrome) {
    return <>{children}</>;
  }

  return (
    <>
      <TopBar />
      <Navbar />
      {children}
      <Footer />
      <ScrollToTop />
      <WhatsAppButton />
      <ChatBot />
    </>
  );
}
