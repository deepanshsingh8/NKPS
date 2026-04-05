"use client";

import { usePathname } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { TopBar } from "@/components/layout/TopBar";
import { ScrollToTop } from "@/components/layout/ScrollToTop";
import { ChatBot } from "@/components/shared/ChatBot";
import { WhatsAppButton } from "@/components/shared/WhatsAppButton";

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");
  const isPortal = pathname.startsWith("/portal");
  const isStudent = pathname.startsWith("/student") && !pathname.startsWith("/student-life");
  const isTeacher = pathname.startsWith("/teacher");
  const hideChrome = isAdmin || isPortal || isStudent || isTeacher;

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
