import type { Metadata } from "next";
import { GalleryPageClient } from "./GalleryPageClient";
import { JsonLd } from "@/components/seo/JsonLd";
import { buildMetadata, breadcrumbJsonLd } from "@/shared/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Photo Gallery — Life at NK Public School Jaipur",
  description:
    "Glimpses of campus life at NK Public School, Jaipur — annual events, sports meets, cultural programs, academics and everyday moments from our Rajawas campus.",
  path: "/gallery",
});

export default function GalleryPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Gallery", path: "/gallery" },
        ])}
      />
      <GalleryPageClient />
    </>
  );
}
