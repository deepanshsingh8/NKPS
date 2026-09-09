"use client";

import { ErpSidebar } from "@/components/ErpSidebar";
import { SidebarProvider } from "@nkps/shared/components/providers/SidebarProvider";
import { SessionProvider } from "@nkps/shared/components/providers/SessionProvider";
import { AppShell } from "@nkps/shared/components/AppShell";

export default function ErpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <SidebarProvider>
        <AppShell sidebar={<ErpSidebar />} title="NKPS ERP">
          {children}
        </AppShell>
      </SidebarProvider>
    </SessionProvider>
  );
}
