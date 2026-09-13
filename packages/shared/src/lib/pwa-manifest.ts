import type { MetadataRoute } from "next";

// Shared web-app-manifest builder for the ERP and CMS installable apps. Both
// apps expose this via their own app/manifest.ts (Next file convention) so the
// display/theme/icon definition lives in exactly one place and can't drift.
//
// theme_color matches --color-navy-900 (globals.css); background_color is the
// splash-screen colour shown before first paint, kept white so the splash
// doesn't flash dark before a light UI loads.
const THEME_COLOR = "#0A1628";
const BACKGROUND_COLOR = "#FFFFFF";

/** A long-press target on the home-screen icon. */
export interface ManifestShortcut {
  name: string;
  shortName?: string;
  description?: string;
  /** App-relative, e.g. "/attendance". */
  url: string;
}

interface ManifestOptions {
  name: string;
  shortName: string;
  description: string;
  /** Where the app opens from the home-screen icon. "/" lets the auth
   *  middleware redirect each role to its own dashboard. */
  startUrl?: string;
  /** Up to ~4 are surfaced by Android; iOS ignores them entirely. */
  shortcuts?: ManifestShortcut[];
}

export function buildManifest({
  name,
  shortName,
  description,
  startUrl = "/",
  shortcuts = [],
}: ManifestOptions): MetadataRoute.Manifest {
  return {
    // A stable identity for the install, independent of start_url. Without it
    // the browser keys the installed app on start_url, and changing that later
    // registers a second app rather than updating the first.
    id: "/",
    name,
    short_name: shortName,
    description,
    start_url: startUrl,
    scope: "/",
    display: "standalone",
    // Preference order, not a single answer: a browser that can't honour
    // standalone falls back to minimal-ui (which keeps a slim URL bar) rather
    // than all the way to a full browser tab.
    display_override: ["standalone", "minimal-ui"],
    // Was "portrait", which locked the app upright even on a tablet. The
    // screens that most need width — the wide admin tables — were the ones it
    // stopped anyone from turning sideways to read.
    orientation: "any",
    categories: ["education", "productivity"],
    shortcuts: shortcuts.map((s) => ({
      name: s.name,
      short_name: s.shortName ?? s.name,
      description: s.description,
      url: s.url,
      icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    })),
    background_color: BACKGROUND_COLOR,
    theme_color: THEME_COLOR,
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
