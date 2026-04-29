"use client";

import { usePathname } from "next/navigation";
import { Navbar } from "@/website/components/layout/Navbar";
import { Footer } from "@/website/components/layout/Footer";
import { TopBar } from "@/website/components/layout/TopBar";
import { ScrollToTop } from "@/website/components/layout/ScrollToTop";
import { ChatBot } from "@/shared/components/ChatBot";
import { WhatsAppButton } from "@/shared/components/WhatsAppButton";

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
