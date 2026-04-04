"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard,
  Image as ImageIcon,
  FileText,
  MessageSquare,
  Layers,
  LogOut,
  Users,
  GraduationCap,
  BookOpen,
  CreditCard,
  Calendar,
  CheckSquare,
  BarChart3,
  CalendarDays,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const contentLinks = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/admin" },
  { icon: ImageIcon, label: "Gallery", href: "/admin/gallery" },
  {
    icon: FileText,
    label: "Transfer Certificates",
    href: "/admin/transfer-certificates",
  },
  {
    icon: MessageSquare,
    label: "Contact Messages",
    href: "/admin/contact",
  },
  {
    icon: Layers,
    label: "Site Media",
    href: "/admin/site-media",
  },
];

const erpLinks = [
  { icon: Users, label: "Users", href: "/admin/users" },
  { icon: GraduationCap, label: "Classes", href: "/admin/classes" },
  { icon: BookOpen, label: "Subjects", href: "/admin/subjects" },
  { icon: CalendarDays, label: "Academic Years", href: "/admin/academic-years" },
  { icon: CreditCard, label: "Fees", href: "/admin/fees" },
  { icon: Calendar, label: "Calendar", href: "/admin/calendar" },
  { icon: CheckSquare, label: "Attendance", href: "/admin/attendance" },
  { icon: BarChart3, label: "Results", href: "/admin/results" },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    toast.success("Logged out");
    router.push("/admin/login");
  };

  const renderLink = ({ icon: Icon, label, href }: (typeof contentLinks)[0]) => {
    const isActive =
      href === "/admin"
        ? pathname === "/admin"
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
        <Icon className="h-5 w-5 shrink-0" />
        {label}
      </Link>
    );
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
            <h1 className="font-heading text-xl font-bold text-white">
              NKPS ERP
            </h1>
            <p className="text-sm text-gold-500 mt-0.5">Admin</p>
          </div>
        </div>
        <div className="mt-2 h-0.5 w-12 bg-gold-500 rounded-full" />
      </div>

      <nav className="flex-1 px-3 overflow-y-auto">
        <div className="mb-1">
          <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">
            Content
          </p>
          <div className="space-y-1">
            {contentLinks.map(renderLink)}
          </div>
        </div>

        <div className="mt-4">
          <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">
            ERP
          </p>
          <div className="space-y-1">
            {erpLinks.map(renderLink)}
          </div>
        </div>
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
