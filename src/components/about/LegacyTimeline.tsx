"use client";

import { AnimatedSection } from "@/components/shared/AnimatedSection";
import { SectionHeading } from "@/components/shared/SectionHeading";
import type { SectionCard } from "@/types";

const milestones = [
  {
    year: "1985",
    title: "Foundation",
    description:
      "NK Public School established by Late Shri R.K. Choudhary with just 10 students.",
  },
  {
    year: "1990",
    title: "CBSE Affiliation",
    description:
      "Received affiliation from CBSE, marking a new chapter in academic excellence.",
  },
  {
    year: "2000",
    title: "Campus Expansion",
    description:
      "New buildings, laboratories, and sports facilities added to serve growing student body.",
  },
  {
    year: "2010",
    title: "Digital Era",
    description:
      "Smart classrooms and computer labs introduced for technology-integrated learning.",
  },
  {
    year: "2024",
    title: "20000+ Students",
    description:
      "Grown into one of Jaipur's leading institutions with 6 educational institutes.",
  },
];

interface LegacyTimelineProps {
  cards?: SectionCard[];
}

export function LegacyTimeline({ cards }: LegacyTimelineProps = {}) {
  // Default milestones + DB cards appended
  const dbMilestones = (cards ?? []).map((c) => ({
    year: c.year || "",
    title: c.title || "",
    description: c.description || "",
  }));
  const allMilestones = [...milestones, ...dbMilestones];
  return (
    <section className="section-padding bg-cream-50">
      <div className="page-container">
        <SectionHeading title="Our Legacy" />

        <div className="relative mt-12 max-w-3xl mx-auto">
          {/* Vertical line */}
          <div className="absolute left-4 md:left-6 top-0 bottom-0 w-0.5 bg-gold-500/30" />

          {allMilestones.map((milestone, index) => (
            <AnimatedSection key={milestone.year}>
              <div
                className="relative pl-14 md:pl-20 pb-12 last:pb-0"
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                {/* Dot */}
                <div className="absolute left-2 md:left-4 top-1 w-5 h-5 rounded-full bg-gold-500 border-4 border-cream-50 z-10" />

                {/* Year badge */}
                <span className="inline-block bg-navy-900 text-white text-sm font-semibold px-3 py-1 rounded-full mb-2">
                  {milestone.year}
                </span>

                <h3 className="font-heading text-xl font-bold text-navy-900 mt-1">
                  {milestone.title}
                </h3>
                <p className="text-gray-600 mt-1">{milestone.description}</p>
              </div>
            </AnimatedSection>
          ))}
        </div>
      </div>
    </section>
  );
}
