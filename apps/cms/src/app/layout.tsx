"use client";

import { CmsSidebar } from "@/components/CmsSidebar";
import { SidebarProvider, useSidebar } from "@nkps/shared/components/providers/SidebarProvider";
import { cn } from "@nkps/shared/lib/utils";

function CmsLayoutInner({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();

  return (
    <div className="flex min-h-screen bg-gray-50">
      <CmsSidebar />
      <main className={cn("flex-1 p-8 transition-all duration-300", collapsed ? "ml-[72px]" : "ml-64")}>
        {children}
      </main>
    </div>
  );
}

export default function CmsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <CmsLayoutInner>{children}</CmsLayoutInner>
    </SidebarProvider>
  );
}
