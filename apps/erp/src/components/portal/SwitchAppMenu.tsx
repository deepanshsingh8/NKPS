"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Settings2, ChevronRight } from "lucide-react";
import { createClient } from "@nkps/shared/lib/supabase/client";
import {
  FEATURE_CATALOG,
  type FeatureKey,
  type FeatureGroup,
} from "@nkps/shared/lib/permissions";
import { getCmsUrl } from "@nkps/shared/lib/cross-app";
import { cn } from "@nkps/shared/lib/utils";
import { SidebarTooltip } from "@nkps/shared/components/SidebarTooltip";

const FEATURE_GROUP_BY_KEY: Record<FeatureKey, FeatureGroup> = Object.fromEntries(
  FEATURE_CATALOG.map((f) => [f.key, f.group])
) as Record<FeatureKey, FeatureGroup>;

// Sidebar entry shown to teachers who also hold editor capability. Click
// surfaces a chooser between the in-app ERP admin dashboard and the cross-app
// CMS dashboard, but only includes the apps the user actually has grants for.
// Renders nothing for teachers with no grants and for non-teachers (staff /
// admin land directly in the admin area at login and don't need a switcher).
export function SwitchAppMenu({ collapsed }: { collapsed: boolean }) {
  const [groups, setGroups] = useState<Set<FeatureGroup> | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        setGroups(new Set());
        return;
      }
      supabase
        .from("editor_permissions")
        .select("feature_key")
        .eq("editor_id", user.id)
        .then(({ data: rows }) => {
          const next = new Set<FeatureGroup>();
          for (const r of rows ?? []) {
            const key = r.feature_key as FeatureKey | undefined;
            if (key && FEATURE_GROUP_BY_KEY[key]) {
              next.add(FEATURE_GROUP_BY_KEY[key]);
            }
          }
          setGroups(next);
        });
    });
  }, []);

  if (!groups || groups.size === 0) return null;

  const hasErp = groups.has("erp");
  const hasCms = groups.has("cms");

  // If only one target is available, render a direct link instead of a popover.
  if (hasErp && !hasCms) {
    return (
      <SwitchLink
        href="/"
        label="Switch to ERP Admin"
        collapsed={collapsed}
        // ERP root is in-app, so use Next's <Link>; CMS is cross-app and uses <a>.
        useNextLink
      />
    );
  }
  if (hasCms && !hasErp) {
    return (
      <SwitchLink
        href={getCmsUrl("/")}
        label="Switch to CMS"
        external
        collapsed={collapsed}
      />
    );
  }

  // Both available — small popover.
  const button = (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className={cn(
        "w-full flex items-center gap-3 rounded-lg text-sm transition-all duration-200 text-white/70 hover:bg-white/5 hover:text-white",
        collapsed ? "px-2.5 py-2.5 justify-center" : "px-3 py-2.5"
      )}
    >
      <Settings2 className="h-5 w-5 shrink-0" />
      {!collapsed && (
        <>
          <span className="truncate flex-1 text-left">Admin tools</span>
          <ChevronRight
            className={cn(
              "h-4 w-4 shrink-0 transition-transform",
              open && "rotate-90"
            )}
          />
        </>
      )}
    </button>
  );

  return (
    <div className="px-2 pb-2">
      {collapsed ? (
        <SidebarTooltip label="Admin tools">{button}</SidebarTooltip>
      ) : (
        button
      )}
      {open && !collapsed && (
        <div className="mt-1 ml-7 space-y-0.5 border-l border-white/10 pl-2">
          <Link
            href="/"
            className="block px-3 py-2 text-xs rounded-md text-white/60 hover:bg-white/5 hover:text-white"
          >
            ERP Admin
          </Link>
          <a
            href={getCmsUrl("/")}
            className="block px-3 py-2 text-xs rounded-md text-white/60 hover:bg-white/5 hover:text-white"
          >
            CMS
          </a>
        </div>
      )}
    </div>
  );
}

function SwitchLink({
  href,
  label,
  external,
  collapsed,
  useNextLink,
}: {
  href: string;
  label: string;
  external?: boolean;
  collapsed: boolean;
  useNextLink?: boolean;
}) {
  const className = cn(
    "flex items-center gap-3 rounded-lg text-sm transition-all duration-200 text-white/70 hover:bg-white/5 hover:text-white",
    collapsed ? "px-2.5 py-2.5 justify-center" : "px-3 py-2.5"
  );
  const inner = (
    <>
      <Settings2 className="h-5 w-5 shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </>
  );
  const link = useNextLink ? (
    <Link href={href} className={className}>
      {inner}
    </Link>
  ) : (
    <a
      href={href}
      className={className}
      {...(external ? { rel: "noopener" } : {})}
    >
      {inner}
    </a>
  );

  return (
    <div className="px-2 pb-2">
      {collapsed ? <SidebarTooltip label={label}>{link}</SidebarTooltip> : link}
    </div>
  );
}
