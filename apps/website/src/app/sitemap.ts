import { MetadataRoute } from "next";
import { getPublishedArticles } from "@nkps/shared/lib/articles";
import { SITE_URL } from "@nkps/shared/lib/seo";

// Every public page must be listed here and linked from a server-rendered
// page (nav or footer) — a page with neither is an orphan Google may never
// find. /alumni and /academic-calendar were both missing until 2026-10.
const STATIC_PAGES: { path: string; priority: number }[] = [
  { path: "", priority: 1 },
  { path: "/admissions", priority: 0.9 },
  { path: "/about", priority: 0.8 },
  { path: "/academics", priority: 0.8 },
  { path: "/contact", priority: 0.8 },
  { path: "/articles", priority: 0.7 },
  { path: "/student-life", priority: 0.7 },
  { path: "/facilities", priority: 0.7 },
  { path: "/gallery", priority: 0.6 },
  { path: "/academic-calendar", priority: 0.6 },
  { path: "/alumni", priority: 0.6 },
  { path: "/transfer-certificates", priority: 0.5 },
  { path: "/mandatory-public-disclosure", priority: 0.5 },
  { path: "/for-parents", priority: 0.5 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let articles: Awaited<ReturnType<typeof getPublishedArticles>> = [];
  try {
    articles = await getPublishedArticles();
  } catch {
    // If DB is unreachable at build time, serve the static entries only.
  }

  // lastModified only where it is true. Stamping every page with "now" on
  // each request teaches Google to ignore the field for the whole site.
  const newestArticle = articles.reduce<string | undefined>(
    (latest, a) => (!latest || a.updated_at > latest ? a.updated_at : latest),
    undefined
  );

  const staticEntries: MetadataRoute.Sitemap = STATIC_PAGES.map(({ path, priority }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: path === "/articles" ? newestArticle : undefined,
    priority,
  }));

  const articleEntries: MetadataRoute.Sitemap = articles.map((a) => ({
    url: `${SITE_URL}/articles/${a.slug}`,
    lastModified: a.updated_at,
    priority: 0.6,
  }));

  return [...staticEntries, ...articleEntries];
}
