import { Metadata } from "next";
import { FacilitiesContent } from "./FacilitiesContent";
import { getPageMedia, mediaUrl } from "@/lib/site-media";

export const metadata: Metadata = {
  title: "Our Facilities",
};

export const revalidate = 60;

export default async function FacilitiesPage() {
  const homeMedia = await getPageMedia("home");
  const facilitiesMedia = await getPageMedia("facilities");

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

  return <FacilitiesContent facilityImages={facilityImages} heroImage={heroImage} />;
}
