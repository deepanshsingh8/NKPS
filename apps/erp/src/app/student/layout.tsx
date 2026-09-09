"use client";

import { StudentSidebar } from "@/components/portal/StudentSidebar";
import { SidebarProvider } from "@nkps/shared/components/providers/SidebarProvider";
import { SessionProvider } from "@nkps/shared/components/providers/SessionProvider";
import { AppShell } from "@nkps/shared/components/AppShell";

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <SidebarProvider>
        <AppShell sidebar={<StudentSidebar />} title="Student Portal">
          {children}
        </AppShell>
      </SidebarProvider>
    </SessionProvider>
  );
}
