import { MetadataRoute } from "next";
import { getPublishedArticles } from "@/lib/articles";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://www.nkpublicschool.com";

  const staticEntries: MetadataRoute.Sitemap = [
    { url: baseUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/about`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${baseUrl}/academics`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${baseUrl}/admissions`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${baseUrl}/student-life`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${baseUrl}/facilities`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${baseUrl}/gallery`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${baseUrl}/contact`, changeFrequency: "yearly", priority: 0.8 },
    { url: `${baseUrl}/transfer-certificates`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${baseUrl}/articles`, changeFrequency: "weekly", priority: 0.7 },
  ];

  let articleEntries: MetadataRoute.Sitemap = [];
  try {
    const articles = await getPublishedArticles();
    articleEntries = articles.map((a) => ({
      url: `${baseUrl}/articles/${a.slug}`,
      lastModified: a.updated_at,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));
  } catch {
    // If DB is unreachable at build time, serve the static entries only.
  }

  return [...staticEntries, ...articleEntries];
}
