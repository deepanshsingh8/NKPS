import { Metadata } from "next";
import { FacilitiesContent } from "./FacilitiesContent";
import { JsonLd } from "@/components/seo/JsonLd";
import { getPageMedia, mediaUrl, getSectionCards } from "@/lib/site-media";
import { buildMetadata, breadcrumbJsonLd } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Facilities — Smart Classrooms, Labs, Library — NKPS Jaipur",
  description:
    "Modern facilities at NK Public School, Jaipur — smart classrooms, science and computer labs, 10,000-volume library, sports grounds, auditorium, indoor games and school bus transport.",
  path: "/facilities",
});

export const revalidate = 60;

export default async function FacilitiesPage() {
  const [homeMedia, facilitiesMedia, facilityCards] = await Promise.all([
    getPageMedia("home"),
    getPageMedia("facilities"),
    getSectionCards("facilities_preview"),
  ]);

  const facilityImages = [
    // First 4 reuse home page facilities_preview slots
    mediaUrl(homeMedia, "facilities_preview_1", "/images/news/n1.jpg"),
    mediaUrl(homeMedia, "facilities_preview_2", "/images/news/n2.jpg"),
    mediaUrl(homeMedia, "facilities_preview_3", "/images/news/n4.jpg"),
    mediaUrl(homeMedia, "facilities_preview_4", "/images/news/n6.jpg"),
    // Remaining 4 use facilities-page-specific slots
    mediaUrl(facilitiesMedia, "facilities_sports", "/images/news/n7.jpg"),
    mediaUrl(facilitiesMedia, "facilities_auditorium", "/images/news/n3.jpg"),
    mediaUrl(facilitiesMedia, "facilities_indoor_games", "/images/news/n5.jpg"),
    mediaUrl(facilitiesMedia, "facilities_transport", "/images/gallery/g10.jpg"),
  ];

  const heroImage = mediaUrl(facilitiesMedia, "facilities_hero", "/images/hero/campus-1.jpg");

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Facilities", path: "/facilities" },
        ])}
      />
      <FacilitiesContent facilityImages={facilityImages} heroImage={heroImage} cards={facilityCards} />
    </>
  );
}
