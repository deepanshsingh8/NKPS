import { HeroSlider } from "@/components/home/HeroSlider";
import { QuickLinks } from "@/components/home/QuickLinks";
import { FacilitiesPreview } from "@/components/home/FacilitiesPreview";
import { StatsCounter } from "@/components/home/StatsCounter";
import { LatestUpdates } from "@/components/home/LatestUpdates";
import { Testimonials } from "@/components/home/Testimonials";
import { SectionDivider } from "@/components/shared/SectionDivider";
import { MarqueeStrip } from "@/components/shared/MarqueeStrip";
import { PageTransition } from "@/components/shared/PageTransition";
import { getPageMedia, mediaUrl } from "@/lib/site-media";

export default async function HomePage() {
  const media = await getPageMedia("home");

  const heroImages = [
    mediaUrl(media, "hero_slide_1", "/images/hero/campus-1.jpg"),
    mediaUrl(media, "hero_slide_2", "/images/hero/campus-2.avif"),
    mediaUrl(media, "hero_slide_3", "/images/news/n5.jpg"),
  ];

  const facilityImages = [
    mediaUrl(media, "facilities_preview_1", "/images/news/n1.jpg"),
    mediaUrl(media, "facilities_preview_2", "/images/news/n2.jpg"),
    mediaUrl(media, "facilities_preview_3", "/images/news/n4.jpg"),
    mediaUrl(media, "facilities_preview_4", "/images/news/n6.jpg"),
  ];

  const statsBackground = mediaUrl(media, "stats_background", "/images/gallery/g10.jpg");

  const updateImages = [
    mediaUrl(media, "latest_update_1", "/images/news/n2.jpg"),
    mediaUrl(media, "latest_update_2", "/images/news/n4.jpg"),
    mediaUrl(media, "latest_update_3", "/images/news/n6.jpg"),
  ];

  return (
    <PageTransition>
      <HeroSlider images={heroImages} />

      <MarqueeStrip
        className="bg-navy-900 text-white/70 py-3"
        items={[
          "CBSE Affiliated",
          "Established 1985",
          "10000+ Students",
          "Holistic Education",
          "Sports Excellence",
          "Smart Classrooms",
          "Digital Learning",
          "Character Building",
        ]}
      />

      <QuickLinks />

      <SectionDivider color="fill-white" />

      <FacilitiesPreview images={facilityImages} />

      <StatsCounter backgroundImage={statsBackground} />

      <SectionDivider flip color="fill-cream-50" />

      <LatestUpdates images={updateImages} />

      <Testimonials />
    </PageTransition>
  );
}
