"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { SidebarProfileMenu } from "./SidebarProfileMenu";
import { useSidebar } from "@/components/providers/SidebarProvider";

interface PortalSidebarProps {
  title: string;
  role: string;
  navLinks: { href: string; label: string; icon: React.ReactNode }[];
}

export function PortalSidebar({ title, role, navLinks }: PortalSidebarProps) {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebar();

  const basePath = navLinks[0]?.href ?? "/";

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 h-screen bg-navy-900 flex flex-col z-40 transition-all duration-300 ease-in-out",
        collapsed ? "w-[72px]" : "w-64"
      )}
    >
      {/* Header */}
      <div className={cn("p-4 flex items-center", collapsed ? "justify-center" : "gap-3 px-6")}>
        {!collapsed && (
          <>
            <Image
              src="/images/logo.png"
              alt="NKPS Logo"
              width={36}
              height={36}
              className="rounded-full shrink-0"
            />
            <div className="min-w-0">
              <h1 className="font-heading text-xl font-bold text-white truncate">{title}</h1>
              <p className="text-sm text-gold-500 mt-0.5">{role}</p>
            </div>
          </>
        )}
        {collapsed && (
          <Image
            src="/images/logo.png"
            alt="NKPS Logo"
            width={32}
            height={32}
            className="rounded-full"
          />
        )}
      </div>

      {!collapsed && (
        <div className="px-6 mb-2">
          <div className="h-0.5 w-12 bg-gold-500 rounded-full" />
        </div>
      )}

      {/* Toggle button */}
      <div className={cn("px-3 mb-2", collapsed && "flex justify-center")}>
        <button
          onClick={toggle}
          className="flex items-center justify-center h-8 w-8 rounded-lg text-white/40 hover:bg-white/5 hover:text-white transition-colors"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
        {navLinks.map(({ icon, label, href }) => {
          const isActive =
            href === basePath
              ? pathname === basePath
              : pathname.startsWith(href);

          return (
            <div key={href} className="relative group">
              <Link
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-lg text-sm transition-all duration-200",
                  collapsed ? "px-2.5 py-2.5 justify-center" : "px-3 py-2.5",
                  isActive
                    ? "bg-white/10 text-white font-semibold border-l-[3px] border-gold-500"
                    : "text-white/60 hover:bg-white/5 hover:text-white hover:translate-x-0.5"
                )}
              >
                {icon}
                {!collapsed && <span className="truncate">{label}</span>}
              </Link>
              {/* Floating tooltip when collapsed */}
              {collapsed && (
                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 px-3 py-1.5 bg-navy-800 text-white text-xs font-medium rounded-lg shadow-xl border border-white/10 whitespace-nowrap opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-150 z-50">
                  {label}
                  <div className="absolute top-1/2 -translate-y-1/2 -left-1 w-2 h-2 bg-navy-800 border-l border-b border-white/10 rotate-45" />
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <SidebarProfileMenu settingsHref="/portal/settings" collapsed={collapsed} />
    </aside>
  );
}
