"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { staggerContainer, fadeUp } from "@/lib/animations";
import { SectionHeading } from "@/components/shared/SectionHeading";
import type { SectionCard } from "@/types";

const defaultUpdates = [
  {
    date: "March 2026",
    title: "Admissions Open 2026-27",
    description:
      "Applications are now being accepted for all classes. Secure your child's future with quality education at NKPS.",
    image: "/images/news/n2.jpg",
  },
  {
    date: "February 2026",
    title: "Annual Sports Meet",
    description:
      "Chakravyuh 2025-26 — celebrating athletic excellence and sportsmanship across all age groups.",
    image: "/images/news/n4.jpg",
  },
  {
    date: "January 2026",
    title: "Board Exam Preparation",
    description:
      "Special coaching sessions for Class X and XII students with expert guidance and practice tests.",
    image: "/images/news/n6.jpg",
  },
];

interface LatestUpdatesProps {
  images?: string[];
  cards?: SectionCard[];
}

export function LatestUpdates({ images, cards }: LatestUpdatesProps = {}) {
  // Default updates with optional image overrides + DB cards appended
  const baseUpdates = defaultUpdates.map((u, i) => ({
    ...u,
    image: images?.[i] || u.image,
    link: null as string | null,
  }));
  const dbUpdates = (cards ?? []).map((c) => ({
    date: c.date || "",
    title: c.title || "",
    description: c.description || "",
    image: c.image_url || "",
    link: c.link || null,
  }));
  const updates = [...baseUpdates, ...dbUpdates];
  return (
    <section className="section-padding relative overflow-hidden">
      <div className="page-container relative z-10">
        <SectionHeading
          label="News & Announcements"
          title="Latest Updates"
          subtitle="Stay informed with school news and announcements"
        />

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7 mt-12"
        >
          {updates.map((item) => (
            <motion.div key={item.title} variants={fadeUp} whileHover={{ y: -6 }} transition={{ type: "spring", stiffness: 300, damping: 25 }}>
              <div className="group rounded-3xl overflow-hidden bg-white border border-gray-100/80 shadow-sm cursor-pointer hover:shadow-xl hover:shadow-gold-500/8 hover:border-gold-500/20 transition-all duration-500">
                {/* Image */}
                <div className="relative h-52 w-full overflow-hidden">
                  <Image
                    src={item.image}
                    alt={item.title}
                    fill
                    className="object-cover transition-transform duration-[800ms] ease-out group-hover:scale-[1.08]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-navy-950/20 to-transparent group-hover:from-navy-950/30 transition-all duration-500" />
                </div>

                {/* Content */}
                <div className="p-6">
                  {/* Date badge — animated border */}
                  <span className="inline-block bg-gold-500/8 text-gold-600 text-xs font-semibold px-3.5 py-1.5 rounded-full border border-gold-500/15 group-hover:bg-gold-500/15 group-hover:border-gold-500/25 transition-all duration-300">
                    {item.date}
                  </span>

                  <h3 className="font-heading text-lg font-semibold text-navy-900 mt-3 line-clamp-2 leading-snug">
                    {item.title}
                  </h3>

                  <p className="text-gray-500 text-sm mt-2 leading-relaxed line-clamp-2">
                    {item.description}
                  </p>

                  <div className="mt-4 flex items-center gap-1.5 text-navy-900 text-sm font-medium group-hover:text-gold-600 transition-colors duration-300">
                    Read more
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1.5 transition-transform duration-300" />
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
