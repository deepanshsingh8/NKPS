"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LogOut, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface PortalSidebarProps {
  title: string;
  role: string;
  navLinks: { href: string; label: string; icon: React.ReactNode }[];
}

export function PortalSidebar({ title, role, navLinks }: PortalSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const basePath = navLinks[0]?.href ?? "/";

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    document.cookie = "x-user-role=; path=/; max-age=0";
    toast.success("Logged out");
    router.push("/portal/login");
  };

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-navy-900 flex flex-col z-40">
      <div className="p-6">
        <div className="flex items-center gap-3">
          <Image
            src="/images/logo.png"
            alt="NKPS Logo"
            width={36}
            height={36}
            className="rounded-full"
          />
          <div>
            <h1 className="font-heading text-xl font-bold text-white">{title}</h1>
            <p className="text-sm text-gold-500 mt-0.5">{role}</p>
          </div>
        </div>
        <div className="mt-2 h-0.5 w-12 bg-gold-500 rounded-full" />
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {navLinks.map(({ icon, label, href }) => {
          const isActive =
            href === basePath
              ? pathname === basePath
              : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                isActive
                  ? "bg-white/10 text-white font-semibold border-l-[3px] border-gold-500"
                  : "text-white/60 hover:bg-white/5 hover:text-white"
              )}
            >
              {icon}
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-white/10 space-y-1">
        <Link
          href="/"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/60 hover:bg-white/5 hover:text-white w-full transition-colors"
        >
          <ExternalLink className="h-5 w-5 shrink-0" />
          Back to Website
        </Link>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/60 hover:bg-white/5 hover:text-white w-full transition-colors"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          Logout
        </button>
      </div>
    </aside>
  );
}
