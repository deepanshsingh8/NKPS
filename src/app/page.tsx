import { HeroSlider } from "@/components/home/HeroSlider";
import { QuickLinks } from "@/components/home/QuickLinks";
import { FacilitiesPreview } from "@/components/home/FacilitiesPreview";
import { StatsCounter } from "@/components/home/StatsCounter";
import { LatestUpdates } from "@/components/home/LatestUpdates";
import { Testimonials } from "@/components/home/Testimonials";
import { SchoolEvents } from "@/components/home/SchoolEvents";
import { SectionDivider } from "@/components/shared/SectionDivider";
import { MarqueeStrip } from "@/components/shared/MarqueeStrip";
import { PageTransition } from "@/components/shared/PageTransition";
import { getPageMedia, mediaUrl, getSectionCards } from "@/lib/site-media";
import { getLatestArticles } from "@/lib/articles";

// ISR: revalidate every 60s, plus on-demand via revalidatePath from admin
export const revalidate = 60;

export default async function HomePage() {
  const [media, heroCards, testimonialCards, updateCards, facilityCards, latestArticles] = await Promise.all([
    getPageMedia("home"),
    getSectionCards("hero_slider"),
    getSectionCards("testimonials"),
    getSectionCards("latest_updates"),
    getSectionCards("facilities_preview"),
    getLatestArticles(3),
  ]);

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
      <HeroSlider images={heroImages} cards={heroCards} />

      <MarqueeStrip
        className="bg-navy-900 text-white/70 py-3"
        items={[
          "CBSE Affiliated",
          "Established 1985",
          "20000+ Students",
          "Holistic Education",
          "Sports Excellence",
          "Smart Classrooms",
          "Digital Learning",
          "Character Building",
        ]}
      />

      <QuickLinks />

      <FacilitiesPreview images={facilityImages} cards={facilityCards} />

      <StatsCounter backgroundImage={statsBackground} />

      <LatestUpdates images={updateImages} cards={updateCards} articles={latestArticles} />

      <SchoolEvents />

      <Testimonials cards={testimonialCards} />
    </PageTransition>
  );
}
