"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  Monitor,
  FlaskConical,
  Laptop,
  BookOpen,
  Trophy,
  Theater,
  Gamepad2,
  Bus,
  CheckCircle,
  ZoomIn,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageTransition } from "@nkps/shared/components/PageTransition";
import { AnimatedSection } from "@nkps/shared/components/AnimatedSection";
import { SectionHeading } from "@nkps/shared/components/SectionHeading";
import { staggerContainer, fadeUp } from "@nkps/shared/lib/animations";
import { cn } from "@nkps/shared/lib/utils";
import type { SectionCard } from "@nkps/shared/types";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Monitor,
  FlaskConical,
  Laptop,
  BookOpen,
  Trophy,
  Theater,
  Gamepad2,
  Bus,
};

const highlights = [
  {
    title: "CCTV Surveillance",
    description: "24/7 monitoring across all campus areas for complete safety",
  },
  {
    title: "Fire Safety Systems",
    description: "Modern fire detection and suppression equipment installed",
  },
  {
    title: "Solar Power",
    description: "Sustainable energy powering our campus infrastructure",
  },
  {
    title: "RO Water Purifiers",
    description: "Clean and safe drinking water available at every floor",
  },
  {
    title: "First Aid Room",
    description: "Fully equipped medical room with trained staff on standby",
  },
  {
    title: "Spacious Parking",
    description: "Organized parking facility for staff and visitor vehicles",
  },
];

interface FacilitiesContentProps {
  heroImage: string;
  cards?: SectionCard[];
}

export function FacilitiesContent({ heroImage, cards }: FacilitiesContentProps) {
  // Single source of truth: section_cards. Defaults are seeded as is_default
  // rows (migration 058).
  const facilities = (cards ?? []).map((c) => ({
    id: c.id,
    title: c.title || "",
    description: c.description || "",
    icon: c.icon || "Monitor",
    image: c.image_url || "/images/news/n1.jpg",
  }));

  // Lightbox: click a facility image to view it full-size.
  const [lightbox, setLightbox] = useState<{ src: string; title: string } | null>(null);
  const closeLightbox = useCallback(() => setLightbox(null), []);

  // Close on Escape while the lightbox is open.
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, closeLightbox]);

  return (
    <PageTransition>
      <PageHeader
        title="Our Facilities"
        subtitle="World-Class Infrastructure for Holistic Development"
      />

      {/* Featured Hero Banner */}
      <section className="relative h-[40vh] w-full overflow-hidden">
        <Image
          src={heroImage}
          alt="NK Public School Campus Building"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-r from-navy-950/80 via-navy-900/60 to-navy-950/80" />
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <h2 className="font-heading text-3xl font-bold text-white md:text-4xl">
            Explore Our Campus
          </h2>
          <p className="mt-3 max-w-xl text-gray-200">
            A purpose-built environment where learning meets innovation
          </p>
        </div>
      </section>

      {/* Facilities Grid — Alternating Image Cards */}
      {facilities.length > 0 && (
      <section className="py-20 px-6">
        <div className="mx-auto max-w-6xl">
          <AnimatedSection>
            <SectionHeading
              title="Campus Facilities"
              subtitle="Modern amenities designed to enhance every aspect of student life"
            />
          </AnimatedSection>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            className="mt-14 grid grid-cols-1 gap-8 lg:grid-cols-2"
          >
            {facilities.map((facility, index) => {
              const Icon = iconMap[facility.icon] || Monitor;
              const image = facility.image;
              return (
                <motion.div
                  key={facility.id}
                  variants={fadeUp}
                  className="group"
                >
                  <div
                    className={cn(
                      "flex overflow-hidden rounded-3xl bg-white shadow-md transition-shadow duration-500 hover:shadow-xl",
                      "flex-col sm:flex-row",
                      index % 2 === 1 && "sm:flex-row-reverse"
                    )}
                  >
                    {/* Image — click to view full-size */}
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label={`View larger image of ${facility.title}`}
                      onClick={() => setLightbox({ src: image, title: facility.title })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setLightbox({ src: image, title: facility.title });
                        }
                      }}
                      className="relative h-56 w-full shrink-0 cursor-pointer overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-500 sm:h-auto sm:w-2/5"
                    >
                      <Image
                        src={image}
                        alt={facility.title}
                        fill
                        className="object-cover transition-transform duration-700 group-hover:scale-110"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-navy-950/20 transition-colors duration-500 group-hover:bg-navy-950/40">
                        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white opacity-0 backdrop-blur-sm transition-opacity duration-300 group-hover:opacity-100">
                          <ZoomIn className="h-6 w-6" />
                        </span>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex flex-1 flex-col justify-center p-8">
                      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600/10 transition-colors duration-300 group-hover:bg-blue-600/20">
                        {Icon && (
                          <Icon className="h-6 w-6 text-blue-600" />
                        )}
                      </div>
                      <h3 className="font-heading text-xl font-bold text-navy-900">
                        {facility.title}
                      </h3>
                      <p className="mt-2 leading-relaxed text-gray-600">
                        {facility.description}
                      </p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>
      )}

      {/* Infrastructure Highlights */}
      <section className="bg-navy-900 py-20 px-6">
        <div className="mx-auto max-w-5xl">
          <AnimatedSection>
            <SectionHeading
              title="Infrastructure Highlights"
              subtitle="Safety, sustainability and comfort at every corner"
              light
            />
          </AnimatedSection>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
          >
            {highlights.map((item) => (
              <motion.div
                key={item.title}
                variants={fadeUp}
                className="group flex items-start gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm transition-all duration-300 hover:border-gold-500/30 hover:bg-white/10"
              >
                <CheckCircle className="mt-0.5 h-6 w-6 shrink-0 text-gold-500" />
                <div>
                  <h4 className="font-heading font-semibold text-white">
                    {item.title}
                  </h4>
                  <p className="mt-1 text-sm leading-relaxed text-gray-400">
                    {item.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Lightbox — full-size facility image */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 md:p-8"
            onClick={closeLightbox}
            role="dialog"
            aria-modal="true"
            aria-label={lightbox.title}
          >
            <button
              onClick={closeLightbox}
              className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-2.5 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>

            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="relative max-h-[85vh] max-w-[92vw] md:max-w-[80vw]"
              onClick={(e) => e.stopPropagation()}
            >
              <Image
                src={lightbox.src}
                alt={lightbox.title}
                width={1600}
                height={1000}
                className="max-h-[85vh] w-auto rounded-lg object-contain"
              />
              <div className="absolute inset-x-0 bottom-0 rounded-b-lg bg-gradient-to-t from-black/80 to-transparent px-6 py-4">
                <p className="text-center font-medium text-white">
                  {lightbox.title}
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageTransition>
  );
}
