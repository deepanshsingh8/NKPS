"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { staggerContainer, fadeUp } from "@/lib/animations";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { MouseParallax } from "@/components/shared/MouseParallax";

const updates = [
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

export function LatestUpdates() {
  return (
    <section className="section-padding relative overflow-hidden">
      {/* Mouse parallax decorative shapes */}
      <MouseParallax strength={18} className="absolute top-20 left-[8%] pointer-events-none">
        <div className="w-40 h-40 rounded-full border-2 border-gold-400/35 opacity-40" />
      </MouseParallax>
      <MouseParallax strength={25} invert className="absolute bottom-16 right-[12%] pointer-events-none">
        <div className="w-20 h-20 rounded-full bg-gold-400/25 opacity-40" />
      </MouseParallax>

      <div className="page-container relative z-10">
        <SectionHeading
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
            <motion.div key={item.title} variants={fadeUp}>
              <div className="group rounded-3xl overflow-hidden bg-white border border-gray-100 shadow-sm cursor-pointer hover:shadow-xl hover:border-gold-500/20 transition-all duration-300">
                {/* Image */}
                <div className="relative h-52 w-full overflow-hidden">
                  <Image
                    src={item.image}
                    alt={item.title}
                    fill
                    className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                  />
                  {/* Subtle overlay on hover */}
                  <div className="absolute inset-0 bg-navy-900/0 group-hover:bg-navy-900/10 transition-all duration-500" />
                </div>

                {/* Content */}
                <div className="p-6">
                  {/* Date badge */}
                  <span className="inline-block bg-gold-500/10 text-gold-600 text-xs font-semibold px-3 py-1.5 rounded-full">
                    {item.date}
                  </span>

                  {/* Title */}
                  <h3 className="font-heading text-lg font-semibold text-navy-900 mt-3 line-clamp-2 leading-snug">
                    {item.title}
                  </h3>

                  {/* Description */}
                  <p className="text-gray-500 text-sm mt-2 leading-relaxed line-clamp-2">
                    {item.description}
                  </p>

                  {/* Read more link */}
                  <div className="mt-4 flex items-center gap-1.5 text-navy-900 text-sm font-medium group-hover:text-gold-600 transition-colors duration-300">
                    Read more
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform duration-300" />
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
