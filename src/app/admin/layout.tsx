"use client";

import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { useTheme } from "@/components/providers/ThemeProvider";
import { SidebarProvider, useSidebar } from "@/components/providers/SidebarProvider";
import { cn } from "@/lib/utils";

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  const { collapsed } = useSidebar();

  return (
    <div className={cn("flex min-h-screen bg-gray-50 dark:bg-background transition-colors", resolvedTheme === "dark" && "dark")}>
      <AdminSidebar />
      <main className={cn("flex-1 p-8 transition-all duration-300", collapsed ? "ml-[72px]" : "ml-64")}>
        {children}
      </main>
    </div>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <AdminLayoutInner>{children}</AdminLayoutInner>
    </SidebarProvider>
  );
}
