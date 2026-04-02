import { Metadata } from "next";
import Image from "next/image";
import { PageHeader } from "@/components/layout/PageHeader";
import { LegacyTimeline } from "@/components/about/LegacyTimeline";
import { FounderTribute } from "@/components/about/FounderTribute";
import { LeadershipGrid } from "@/components/about/LeadershipGrid";
import { WhyChooseUs } from "@/components/about/WhyChooseUs";
import { AchievementsCounter } from "@/components/about/AchievementsCounter";
import { PageTransition } from "@/components/shared/PageTransition";
import { SectionDivider } from "@/components/shared/SectionDivider";

export const metadata: Metadata = {
  title: "About Us",
};

export default function AboutPage() {
  return (
    <PageTransition>
      <PageHeader
        title="About NK Public School"
        subtitle="Shaping Futures, Building Character"
      />

      {/* Hero Image Section */}
      <div className="relative h-[50vh] w-full overflow-hidden">
        <Image
          src="/images/gallery/g10.jpg"
          alt="NK Public School Campus"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-navy-950/70 via-navy-900/50 to-navy-950/80" />
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <h2 className="font-heading text-4xl font-bold text-white md:text-5xl">
            Our Story
          </h2>
          <p className="mt-4 max-w-2xl text-lg text-gray-200 md:text-xl">
            Four decades of nurturing young minds with discipline, knowledge, and
            values rooted in the vision of our founder.
          </p>
        </div>
      </div>

      <SectionDivider color="fill-white" />

      <LegacyTimeline />
      <FounderTribute />

      <SectionDivider color="fill-cream-50" />

      <LeadershipGrid />
      <WhyChooseUs />

      <SectionDivider flip color="fill-navy-900" />

      <AchievementsCounter />
    </PageTransition>
  );
}
