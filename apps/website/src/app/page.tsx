import type { Metadata } from "next";
import { HeroSlider } from "@/components/home/HeroSlider";
import { QuickLinks } from "@/components/home/QuickLinks";
import { FacilitiesPreview } from "@/components/home/FacilitiesPreview";
import { NewsAchievements } from "@/components/home/NewsAchievements";
import { StatsCounter } from "@/components/home/StatsCounter";
import { Testimonials } from "@/components/home/Testimonials";
import { SchoolEvents } from "@/components/home/SchoolEvents";
import { SectionDivider } from "@nkps/shared/components/SectionDivider";
import { MarqueeStrip } from "@nkps/shared/components/MarqueeStrip";
import { PageTransition } from "@nkps/shared/components/PageTransition";
import { getPageMedia, mediaUrl, getSectionCards } from "@/lib/site-media";
import { getLatestArticles } from "@nkps/shared/lib/articles";
import { getUpcomingPublicEvents } from "@/lib/public-data";
import { buildMetadata } from "@nkps/shared/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Best CBSE School in Jaipur — NK Public School Since 1985",
  description:
    "NK Public School, Rajawas: a CBSE co-ed school in Jaipur for Nursery to Class XII on Grand Sikar Road. 40+ years; part of the 4,000-student NKPS family.",
  path: "/",
});

// ISR: revalidate every 60s, plus on-demand via revalidatePath from admin
export const revalidate = 60;

export default async function HomePage() {
  const [media, heroCards, testimonialCards, facilityCards, accoladeCards, studentAchievementCards, latestArticles, upcomingEvents] = await Promise.all([
    getPageMedia("home"),
    getSectionCards("hero_slider"),
    getSectionCards("testimonials"),
    getSectionCards("facilities_preview"),
    getSectionCards("accolades"),
    getSectionCards("student_achievements"),
    getLatestArticles(9),
    getUpcomingPublicEvents(6),
  ]);

  const statsBackground = mediaUrl(media, "stats_background", "/images/gallery/g10.jpg");

  return (
    <PageTransition>
      <HeroSlider cards={heroCards} />

      <MarqueeStrip
        className="bg-navy-900 text-white/70 py-3"
        items={[
          "CBSE Affiliated",
          "Established 1985",
          "4,000+ Students Across NKPS",
          "Holistic Education",
          "Sports Excellence",
          "Smart Classrooms",
          "Digital Learning",
          "Character Building",
        ]}
      />

      <section className="bg-cream-50/60 py-12 md:py-16 px-6">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="font-heading text-3xl md:text-4xl font-bold text-navy-900">
            Best CBSE School in Jaipur — Since 1985
          </h2>
          <div className="mx-auto mt-4 h-1 w-16 rounded-full bg-gold-500" />
          <p className="mt-6 text-base md:text-lg leading-relaxed text-gray-700">
            NK Public School (NKPS), located on Grand Sikar Road in Rajawas, is a
            CBSE-affiliated co-educational institution in North Jaipur. For over
            40 years we have taught children from Nursery to Class XII —
            part of an NKPS family of more than 4,000 students across four
            campuses and 20,000+ alumni — combining rigorous academics with
            sports, arts and character education. Our campus on the outskirts of Jaipur offers
            smart classrooms, modern science and computer labs, a 10,000-volume
            library, expansive sports grounds, an auditorium, and safe bus
            transport across the city — everything a modern CBSE school in
            Jaipur should be, backed by four decades of legacy.
          </p>
          <p className="mt-4 text-sm text-gray-500">
            CBSE Affiliation No. 1730406 · Grand Sikar Road, Rajawas, Jaipur 302013
          </p>
        </div>
      </section>

      <QuickLinks />

      <FacilitiesPreview cards={facilityCards} />

      <NewsAchievements
        articles={latestArticles}
        studentAchievements={studentAchievementCards}
        accolades={accoladeCards}
      />

      <StatsCounter backgroundImage={statsBackground} />

      <SchoolEvents events={upcomingEvents} />

      <Testimonials cards={testimonialCards} />
    </PageTransition>
  );
}
