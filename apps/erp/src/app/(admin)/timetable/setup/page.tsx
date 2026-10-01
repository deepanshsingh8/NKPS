"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminFetch } from "@nkps/shared/lib/admin-api";
import { cn } from "@nkps/shared/lib/utils";
import {
  ChevronRight,
  CircleAlert,
  CircleCheck,
  FileSpreadsheet,
  FileText,
  Loader2,
  Sparkles,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import {
  accidentalClashes,
  sharedBookings,
  type ClashViewRow,
} from "@/lib/timetable-clashes";

// Setup & Checks — the once-a-year timetable tools in one place.
//
// Period Templates, Auto Generate, Import from Excel and Clash Check used to be
// four sidebar entries of their own, next to the three screens that are opened
// every day. They are really one job done in order: set the bell schedule, fill
// the timetables (generate them or import them), then check nothing clashes.
// So this page lays them out as those three steps, each with enough live status
// to tell whether it needs you, and the sidebar has one entry for all of it.

interface ToolCard {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  status?: React.ReactNode;
}

function Tool({ href, icon: Icon, title, description, status }: ToolCard) {
  return (
    <Link
      href={href}
      className="erp-table-container group flex h-full items-start gap-3 p-4 transition-colors hover:border-navy-900/30 hover:bg-gray-50 dark:hover:border-white/20 dark:hover:bg-muted"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-900/5 dark:bg-white/5">
        <Icon className="h-5 w-5 text-navy-900/70 dark:text-white/70" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-navy-900 dark:text-white">{title}</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 dark:text-gray-600" />
        </div>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{description}</p>
        {status && <div className="mt-2 text-xs">{status}</div>}
      </div>
    </Link>
  );
}

function Step({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="relative pl-10">
      <div className="absolute left-0 top-0 flex h-7 w-7 items-center justify-center rounded-full bg-navy-900 text-xs font-semibold text-white dark:bg-gold-500 dark:text-navy-900">
        {n}
      </div>
      <h2 className="font-heading text-lg font-semibold leading-7 text-navy-900 dark:text-white">
        {title}
      </h2>
      <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">{hint}</p>
      {children}
    </section>
  );
}

const Muted = ({ children }: { children: React.ReactNode }) => (
  <span className="text-gray-500 dark:text-gray-400">{children}</span>
);

export default function TimetableSetupPage() {
  const [templates, setTemplates] = useState<{ total: number; custom: number } | null>(null);
  const [clashes, setClashes] = useState<{ problems: number; shared: number } | null>(null);
  const [clashError, setClashError] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await adminFetch("/api/timetable/templates");
      if (!res.ok) return;
      const body = await res.json();
      const rows = (body.templates ?? []) as { is_system?: boolean; is_active?: boolean }[];
      const active = rows.filter((t) => t.is_active !== false);
      setTemplates({ total: active.length, custom: active.filter((t) => !t.is_system).length });
    })();
    (async () => {
      const res = await adminFetch("/api/timetable/clashes");
      if (!res.ok) {
        setClashError(true);
        return;
      }
      const rows = ((await res.json()) as { clashes?: ClashViewRow[] }).clashes ?? [];
      setClashes({
        problems: accidentalClashes(rows).length,
        shared: sharedBookings(rows).length,
      });
    })();
  }, []);

  const loadingLine = (
    <span className="inline-flex items-center gap-1 text-gray-400">
      <Loader2 className="h-3 w-3 animate-spin" /> Checking…
    </span>
  );

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-navy-900 dark:text-white">
          Setup &amp; Checks
        </h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          The tools for building the year&apos;s timetable, in the order you use
          them. Day to day, you only need Class Timetable, Teacher Timetable and
          Substitutions.
        </p>
      </div>

      <div className="space-y-8">
        <Step
          n={1}
          title="Set the bell schedule"
          hint="Period times, lunch and breaks. Auto Generate lays timetables out on one of these."
        >
          <Tool
            href="/timetable/templates"
            icon={FileText}
            title="Period Templates"
            description="Clone a built-in template and adjust its period times."
            status={
              templates ? (
                <Muted>
                  {templates.total} {templates.total === 1 ? "template" : "templates"}
                  {templates.custom > 0 && ` · ${templates.custom} of your own`}
                </Muted>
              ) : (
                loadingLine
              )
            }
          />
        </Step>

        <Step
          n={2}
          title="Fill the timetables"
          hint="Either let the generator build them, or bring in a timetable you already have. Individual periods are edited on Class Timetable."
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Tool
              href="/timetable/generate"
              icon={Sparkles}
              title="Auto Generate"
              description="Pick a template, classes and days; it fills them without teacher clashes."
            />
            <Tool
              href="/timetable/import"
              icon={FileSpreadsheet}
              title="Import from Excel"
              description="Upload a .xlsx, preview every row, then commit."
            />
          </div>
        </Step>

        <Step
          n={3}
          title="Check it"
          hint="Run this after generating, importing or a round of edits."
        >
          <Tool
            href="/timetable/clashes"
            icon={TriangleAlert}
            title="Clash Check"
            description="Every teacher booked in two places at once, and which of those are deliberate shared activities."
            status={
              clashError ? (
                <Muted>Could not load the clash report.</Muted>
              ) : !clashes ? (
                loadingLine
              ) : (
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 font-medium",
                      clashes.problems === 0
                        ? "text-green-700 dark:text-green-300"
                        : "text-red-700 dark:text-red-300"
                    )}
                  >
                    {clashes.problems === 0 ? (
                      <CircleCheck className="h-3.5 w-3.5" />
                    ) : (
                      <CircleAlert className="h-3.5 w-3.5" />
                    )}
                    {clashes.problems === 0
                      ? "No clashes"
                      : `${clashes.problems} ${clashes.problems === 1 ? "clash needs" : "clashes need"} attention`}
                  </span>
                  <Muted>
                    {clashes.shared} shared {clashes.shared === 1 ? "activity" : "activities"}
                  </Muted>
                </span>
              )
            }
          />
        </Step>
      </div>
    </div>
  );
}
