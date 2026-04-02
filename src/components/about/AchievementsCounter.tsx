"use client";

import { SectionHeading } from "@/components/shared/SectionHeading";
import { CounterAnimation } from "@/components/shared/CounterAnimation";
import { SCHOOL } from "@/lib/constants";

export function AchievementsCounter() {
  return (
    <section className="py-20 bg-navy-900">
      <div className="page-container">
        <SectionHeading title="Our Achievements at a Glance" light />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mt-12">
          {SCHOOL.achievementStats.map((stat) => (
            <CounterAnimation
              key={stat.label}
              end={stat.value}
              suffix={stat.suffix}
              label={stat.label}
              light
            />
          ))}
        </div>
      </div>
    </section>
  );
}
