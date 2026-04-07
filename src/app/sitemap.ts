import { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://www.nkpublicschool.com";

  return [
    { url: baseUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/about`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${baseUrl}/academics`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${baseUrl}/admissions`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${baseUrl}/student-life`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${baseUrl}/facilities`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${baseUrl}/gallery`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${baseUrl}/contact`, changeFrequency: "yearly", priority: 0.8 },
    { url: `${baseUrl}/transfer-certificates`, changeFrequency: "weekly", priority: 0.5 },
  ];
}
