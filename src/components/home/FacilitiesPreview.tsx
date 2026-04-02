"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Monitor, FlaskConical, Laptop, BookOpen, ArrowRight } from "lucide-react";
import { FACILITIES } from "@/lib/constants";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { fadeUp, staggerContainer } from "@/lib/animations";

const facilityImages = [
  "/images/news/n1.jpg",
  "/images/news/n2.jpg",
  "/images/news/n4.jpg",
  "/images/news/n6.jpg",
];

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Monitor,
  FlaskConical,
  Laptop,
  BookOpen,
};

export function FacilitiesPreview() {
  const preview = FACILITIES.slice(0, 4);

  return (
    <section className="section-padding overflow-hidden">
      <div className="page-container">
        <SectionHeading
          title="Explore Our Facilities"
          subtitle="State-of-the-art infrastructure for holistic development"
        />

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="flex gap-6 overflow-x-auto snap-x snap-mandatory pb-4 mt-12 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        >
          {preview.map((facility, index) => {
            const Icon = iconMap[facility.icon] || Monitor;
            return (
              <motion.div
                key={facility.title}
                variants={fadeUp}
                className="min-w-[300px] md:min-w-[350px] snap-center shrink-0"
              >
                <div className="group relative aspect-[3/4] rounded-3xl overflow-hidden cursor-pointer">
                  {/* Background image */}
                  <Image
                    src={facilityImages[index]}
                    alt={facility.title}
                    fill
                    className="object-cover transition-transform duration-700 ease-out group-hover:scale-110"
                  />

                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent transition-all duration-500 group-hover:from-black/90 group-hover:via-black/30" />

                  {/* Icon badge top-right */}
                  <div className="absolute top-5 right-5 w-12 h-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20">
                    <Icon className="w-6 h-6 text-white" />
                  </div>

                  {/* Content at bottom */}
                  <div className="absolute bottom-0 left-0 right-0 p-7">
                    <h3 className="font-heading text-xl font-bold text-white">
                      {facility.title}
                    </h3>
                    <p className="text-gray-300 text-sm mt-2 leading-relaxed line-clamp-2 opacity-0 translate-y-3 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-500">
                      {facility.description}
                    </p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>

        {/* View All link */}
        <div className="mt-8 text-center">
          <Link
            href="/facilities"
            className="group inline-flex items-center gap-2 text-navy-900 font-semibold hover:text-gold-600 transition-colors duration-300"
          >
            View All Facilities
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
          </Link>
        </div>
      </div>
    </section>
  );
}
