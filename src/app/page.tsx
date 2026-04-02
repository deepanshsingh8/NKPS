import { HeroSlider } from "@/components/home/HeroSlider";
import { QuickLinks } from "@/components/home/QuickLinks";
import { FacilitiesPreview } from "@/components/home/FacilitiesPreview";
import { StatsCounter } from "@/components/home/StatsCounter";
import { LatestUpdates } from "@/components/home/LatestUpdates";
import { Testimonials } from "@/components/home/Testimonials";
import { SectionDivider } from "@/components/shared/SectionDivider";
import { MarqueeStrip } from "@/components/shared/MarqueeStrip";
import { PageTransition } from "@/components/shared/PageTransition";

export default function HomePage() {
  return (
    <PageTransition>
      <HeroSlider />

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

      <FacilitiesPreview />

      <StatsCounter />

      <SectionDivider flip color="fill-cream-50" />

      <LatestUpdates />

      <Testimonials />
    </PageTransition>
  );
}
