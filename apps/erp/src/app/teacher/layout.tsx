"use client";

import { TeacherSidebar } from "@/components/portal/TeacherSidebar";
import { SidebarProvider } from "@nkps/shared/components/providers/SidebarProvider";
import { SessionProvider } from "@nkps/shared/components/providers/SessionProvider";
import { AppShell } from "@nkps/shared/components/AppShell";
import { GuideLauncher } from "@/components/GuideLauncher";

export default function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <SidebarProvider>
        <AppShell sidebar={<TeacherSidebar />} title="Teacher Portal">
          {children}
          <GuideLauncher />
        </AppShell>
      </SidebarProvider>
    </SessionProvider>
  );
}
