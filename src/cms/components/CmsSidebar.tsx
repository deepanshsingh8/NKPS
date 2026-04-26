"use client";

import {
  LayoutDashboard,
  Image as ImageIcon,
  FileText,
  MessageSquare,
  Layers,
  ScrollText,
  Newspaper,
  LayoutGrid,
} from "lucide-react";
import {
  SidebarShell,
  type SidebarItem,
} from "@/shared/components/SidebarShell";

const cmsItems: SidebarItem[] = [
  { kind: "link", icon: LayoutDashboard, label: "Dashboard", href: "/cms" },
  {
    kind: "group",
    icon: LayoutGrid,
    label: "Content",
    landingHref: "/cms",
    hideOverview: true,
    children: [
      { kind: "link", icon: ImageIcon, label: "Gallery", href: "/cms/gallery" },
      { kind: "link", icon: Newspaper, label: "Articles", href: "/cms/articles" },
      { kind: "link", icon: Layers, label: "Site Media", href: "/cms/site-media" },
      { kind: "link", icon: ScrollText, label: "Disclosure", href: "/cms/disclosure" },
    ],
  },
  { kind: "link", icon: FileText, label: "Transfer Certificates", href: "/cms/transfer-certificates" },
  { kind: "link", icon: MessageSquare, label: "Contact Messages", href: "/cms/contact" },
];

const EDITOR_ALWAYS_ALLOWED = new Set(["/cms"]);
const UNREAD_BADGE_HREFS = new Set(["/cms/contact"]);

export function CmsSidebar() {
  return (
    <SidebarShell
      sections={[{ label: "CMS", items: cmsItems }]}
      headerTitle="NKPS CMS"
      headerSubtitle="Content"
      editorAlwaysAllowedHrefs={EDITOR_ALWAYS_ALLOWED}
      unreadBadgeHrefs={UNREAD_BADGE_HREFS}
      settingsHref="/portal/settings?from=cms"
      logoutRedirect="/cms/login"
    />
  );
}
