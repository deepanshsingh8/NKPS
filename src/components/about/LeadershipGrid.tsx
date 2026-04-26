"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { GlassCard } from "@/components/shared/GlassCard";
import { SCHOOL } from "@/shared/lib/constants";
import { staggerContainer, fadeUp } from "@/shared/lib/animations";
import type { SectionCard } from "@/shared/types";

const defaultLeaderPhotos: Record<string, string> = {
  "Dr. N.C. Lunayach": "/images/staff/managing-director.jpg",
  "Mr. Kuldeep Singh": "/images/staff/director.jpg",
  "Mrs. Prema Kavia": "/images/staff/principal.jpg",
};

interface LeadershipGridProps {
  photos?: Record<string, string>;
  cards?: SectionCard[];
}

function getInitials(name: string): string {
  return name
    .replace(/^(Dr\.|Mr\.|Mrs\.|Ms\.)\s*/i, "")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function LeadershipGrid({ photos, cards }: LeadershipGridProps = {}) {
  const leaderPhotos = { ...defaultLeaderPhotos, ...photos };

  // Default leaders + DB cards appended
  const baseLeaders = SCHOOL.leadership.map((l) => ({
    name: l.name,
    designation: l.designation,
    message: l.message,
    photo: leaderPhotos[l.name] || null,
  }));
  const dbLeaders = (cards ?? []).map((c) => ({
    name: c.name || "",
    designation: c.designation || "",
    message: c.message || "",
    photo: c.image_url || null,
  }));
  const allLeaders = [...baseLeaders, ...dbLeaders];

  return (
    <section className="section-padding">
      <div className="page-container">
        <SectionHeading title="Our Leadership" />

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12"
        >
          {allLeaders.map((leader) => {
            const photo = leader.photo;
            return (
              <motion.div key={leader.name} variants={fadeUp}>
                <GlassCard className="p-8 text-center" hover>
                  {/* Avatar */}
                  <div className="w-28 h-28 rounded-full mx-auto mb-4 overflow-hidden border-3 border-gold-500/20">
                    {photo ? (
                      <Image
                        src={photo}
                        alt={leader.name}
                        width={112}
                        height={112}
                        className="object-cover w-full h-full"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-navy-800 to-navy-900 flex items-center justify-center">
                        <span className="font-heading text-2xl font-bold text-white">
                          {getInitials(leader.name)}
                        </span>
                      </div>
                    )}
                  </div>

                  <h3 className="font-heading text-xl font-semibold text-navy-900">
                    {leader.name}
                  </h3>
                  <p className="text-gold-600 text-sm uppercase tracking-wider mt-1">
                    {leader.designation}
                  </p>
                  {leader.message && (
                    <p className="text-gray-600 italic mt-4 text-sm">
                      &ldquo;{leader.message}&rdquo;
                    </p>
                  )}
                </GlassCard>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
