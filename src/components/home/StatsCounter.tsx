"use client";

import Image from "next/image";
import { SCHOOL } from "@/lib/constants";
import { CounterAnimation } from "@/components/shared/CounterAnimation";

export function StatsCounter() {
  return (
    <section className="relative bg-navy-900 overflow-hidden">
      {/* Background image with dark overlay */}
      <div className="absolute inset-0">
        <Image
          src="/images/gallery/g10.jpg"
          alt=""
          fill
          className="object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-navy-950/85" />
      </div>

      <div className="page-container relative z-10 py-24">
        {/* Gold accent line */}
        <div className="w-24 h-0.5 bg-gold-500 mx-auto mb-12" />

        {/* Heading */}
        <h2 className="text-white font-heading text-3xl font-bold text-center">
          NK Public School in Numbers
        </h2>

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-y-12 gap-x-8 mt-16">
          {SCHOOL.stats.map((stat) => (
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
