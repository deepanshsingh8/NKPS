"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
}

export function PageHeader({ title, subtitle }: PageHeaderProps) {
  const pathname = usePathname();

  // Build breadcrumbs from path
  const segments = pathname.split("/").filter(Boolean);
  const breadcrumbs = segments.map((seg, i) => ({
    label: seg
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase()),
    href: "/" + segments.slice(0, i + 1).join("/"),
    isLast: i === segments.length - 1,
  }));

  return (
    <section className="relative w-full bg-navy-900 bg-gradient-to-br from-navy-900 via-navy-800 to-navy-900 py-16 pt-24 sm:py-24 sm:pt-32 overflow-hidden">
      {/* Subtle dot pattern texture */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      />

      {/* CSS-only, transform-only entrance. This block holds the page's H1 and
          is the LCP element on every inner page: a framer-motion
          `initial={{ opacity: 0 }}` kept it invisible until hydration (~4s
          render delay on mobile). A CSS animation runs before any JS, and
          keeping opacity at 1 means the first frame already counts as painted. */}
      <div className="relative mx-auto max-w-4xl px-6 text-center motion-safe:animate-in motion-safe:slide-in-from-bottom-8 motion-safe:duration-600 motion-safe:ease-out">
        {/* Breadcrumbs */}
        <nav className="flex items-center justify-center gap-1.5 text-sm mb-6" aria-label="Breadcrumb">
          <Link href="/" className="text-gray-400 hover:text-gold-400 transition-colors">
            Home
          </Link>
          {breadcrumbs.map((crumb) => (
            <span key={crumb.href} className="flex items-center gap-1.5">
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              {crumb.isLast ? (
                <span className="text-gold-400 font-medium">{crumb.label}</span>
              ) : (
                <Link href={crumb.href} className="text-gray-400 hover:text-gold-400 transition-colors">
                  {crumb.label}
                </Link>
              )}
            </span>
          ))}
        </nav>

        <h1 className="font-heading text-4xl font-bold text-white md:text-5xl">
          {title}
        </h1>
        <div
          className="dash-grow-w mx-auto mt-4 h-1 w-16 rounded bg-gold-500"
          style={{ animationDelay: "300ms", animationFillMode: "backwards" }}
        />
        {subtitle && (
          <p className="mt-4 text-lg text-gray-300">{subtitle}</p>
        )}
      </div>
    </section>
  );
}
