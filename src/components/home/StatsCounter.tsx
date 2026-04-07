"use client";

import Image from "next/image";
import { Users, CalendarDays, GraduationCap, Building2, Award, BookOpen } from "lucide-react";
import { SCHOOL } from "@/lib/constants";
import { CounterAnimation } from "@/components/shared/CounterAnimation";
import { SectionHeading } from "@/components/shared/SectionHeading";

const statIcons = [Users, CalendarDays, GraduationCap, Building2, Award, BookOpen];

interface StatsCounterProps {
  backgroundImage?: string;
}

export function StatsCounter({ backgroundImage }: StatsCounterProps = {}) {
  return (
    <section className="relative bg-navy-900 overflow-hidden">
      {/* Background image with dark overlay */}
      <div className="absolute inset-0">
        <Image
          src={backgroundImage || "/images/gallery/g10.jpg"}
          alt=""
          fill
          className="object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-navy-950/85" />
      </div>

      <div className="page-container relative z-10 py-24 px-4">
        <SectionHeading
          label="By the Numbers"
          title="NK Public School in Numbers"
          light
        />

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-y-12 gap-x-8 mt-16">
          {SCHOOL.stats.map((stat, i) => {
            const Icon = statIcons[i] || Users;
            return (
              <div key={stat.label} className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gold-500/15 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-gold-400" />
                </div>
                <CounterAnimation
                  end={stat.value}
                  suffix={stat.suffix}
                  label={stat.label}
                  light
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
