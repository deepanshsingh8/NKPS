"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  Music,
  Palette,
  MessageSquare,
  Brain,
  BookOpen,
  Cpu,
  Star,
  ZoomIn,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageTransition } from "@nkps/shared/components/PageTransition";
import { AnimatedSection } from "@nkps/shared/components/AnimatedSection";
import { SectionHeading } from "@nkps/shared/components/SectionHeading";
import { FloatingDoodles } from "@nkps/shared/components/FloatingDoodles";
import { staggerContainer, fadeUp } from "@nkps/shared/lib/animations";
import { cn } from "@nkps/shared/lib/utils";
import type { SectionCard } from "@nkps/shared/types";

// Span layout pattern from the original masonry grid: index 1 and 2 spanned
// two rows on md+. Preserved as a positional rule so the visual rhythm of the
// section doesn't collapse when admins re-order or add cards.
const ACTIVITY_SPAN_INDEXES = new Set([1, 2]);

const activityIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Music,
  Palette,
  MessageSquare,
  Brain,
  BookOpen,
  Cpu,
};

interface StudentLifePageProps {
  activityCards?: SectionCard[];
  eventCards?: SectionCard[];
  sportsIndoorCards?: SectionCard[];
  sportsOutdoorCards?: SectionCard[];
}

export function StudentLifeContent({
  activityCards,
  eventCards,
  sportsIndoorCards,
  sportsOutdoorCards,
}: StudentLifePageProps = {}) {
  // Single source of truth: section_cards. Defaults are seeded as is_default
  // rows (migration 057) for both `activities` and `annual_events`.
  const activities = (activityCards ?? []).map((c, i) => ({
    id: c.id,
    icon: activityIconMap[c.icon || ""] || Cpu,
    title: c.title || "",
    description: c.description || "",
    image: c.image_url || "/images/gallery/st1.jpg",
    span: ACTIVITY_SPAN_INDEXES.has(i),
  }));

  const allEvents = (eventCards ?? []).map((c) => ({
    id: c.id,
    season: c.season || "",
    title: c.title || "",
    description: c.description || "",
    image: c.image_url || null,
  }));

  // Sports & Athletics — CMS-managed games split into Indoor / Outdoor. Each
  // card is a single game: a name (title) plus an optional uploaded image that
  // expands in the lightbox when clicked.
  const toGame = (c: SectionCard) => ({
    id: c.id,
    name: c.title || "",
    image: c.image_url || null,
  });
  const sportGroups = [
    { key: "indoor", label: "Indoor", games: (sportsIndoorCards ?? []).map(toGame) },
    { key: "outdoor", label: "Outdoor", games: (sportsOutdoorCards ?? []).map(toGame) },
  ].filter((group) => group.games.length > 0);

  // Lightbox: click an activity image to view it full-size.
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
      <PageHeader title="Student Life" subtitle="Beyond the Classroom" />

      {/* Activities — Masonry-like Grid */}
      {activities.length > 0 && (
      <section className="py-20 px-6">
        <div className="mx-auto max-w-6xl">
          <AnimatedSection>
            <SectionHeading
              title="Activities & Clubs"
              subtitle="Discover your passion through our diverse range of extracurricular activities"
            />
          </AnimatedSection>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            className="mt-14 grid auto-rows-[250px] sm:auto-rows-[200px] grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3"
          >
            {activities.map((activity) => (
              <motion.div
                key={activity.id}
                variants={fadeUp}
                role="button"
                tabIndex={0}
                aria-label={`View larger image of ${activity.title}`}
                onClick={() => setLightbox({ src: activity.image, title: activity.title })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setLightbox({ src: activity.image, title: activity.title });
                  }
                }}
                className={cn(
                  "group relative cursor-pointer overflow-hidden rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-500",
                  activity.span && "md:row-span-2"
                )}
              >
                <Image
                  src={activity.image}
                  alt={activity.title}
                  fill
                  className="object-cover transition-transform duration-700 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-navy-950/90 via-navy-950/40 to-transparent transition-all duration-500 group-hover:from-navy-950/95" />

                {/* Icon circle */}
                <div className="absolute left-5 top-5 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 backdrop-blur-md transition-all duration-300 group-hover:bg-white/20">
                  <activity.icon className="h-5 w-5 text-white" />
                </div>

                {/* Zoom affordance */}
                <div className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white opacity-0 backdrop-blur-md transition-opacity duration-300 group-hover:opacity-100">
                  <ZoomIn className="h-4 w-4" />
                </div>

                {/* Content at bottom */}
                <div className="absolute inset-x-0 bottom-0 p-6">
                  <h3 className="font-heading text-xl font-bold text-white">
                    {activity.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-gray-200 opacity-0 transition-all duration-500 group-hover:opacity-100">
                    {activity.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>
      )}

      {/* Sports & Athletics — Indoor / Outdoor game galleries (CMS-managed) */}
      {sportGroups.length > 0 && (
      <section className="bg-cream-50 py-20 px-6">
        <div className="mx-auto max-w-6xl">
          <AnimatedSection>
            <SectionHeading
              title="Sports & Athletics"
              subtitle="Building teamwork, discipline and physical fitness through sports"
            />
          </AnimatedSection>

          <AnimatedSection delay={0.15}>
            <p className="mx-auto mt-6 max-w-2xl text-center leading-relaxed text-gray-600">
              Our school provides excellent sports facilities and professional
              coaching across a wide range of indoor and outdoor disciplines.
              Regular inter-house and inter-school competitions encourage healthy
              competition and sportsmanship.
            </p>
          </AnimatedSection>

          {sportGroups.map((group) => (
            <div key={group.key} className="mt-12">
              <h3 className="mb-6 text-center font-heading text-2xl font-bold text-navy-900">
                {group.label}
              </h3>

              <motion.div
                variants={staggerContainer}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-60px" }}
                className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
              >
                {group.games.map((game) => {
                  const clickable = Boolean(game.image);
                  return (
                    <motion.div
                      key={game.id}
                      variants={fadeUp}
                      role={clickable ? "button" : undefined}
                      tabIndex={clickable ? 0 : undefined}
                      aria-label={
                        clickable
                          ? `View larger image of ${game.name}`
                          : undefined
                      }
                      onClick={
                        clickable
                          ? () =>
                              setLightbox({
                                src: game.image as string,
                                title: game.name,
                              })
                          : undefined
                      }
                      onKeyDown={
                        clickable
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setLightbox({
                                  src: game.image as string,
                                  title: game.name,
                                });
                              }
                            }
                          : undefined
                      }
                      className={cn(
                        "group relative aspect-square overflow-hidden rounded-2xl shadow-sm",
                        clickable &&
                          "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-500"
                      )}
                    >
                      {game.image ? (
                        <Image
                          src={game.image}
                          alt={game.name}
                          fill
                          className="object-cover transition-transform duration-700 group-hover:scale-110"
                        />
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-navy-700 to-navy-900" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-navy-950/85 via-navy-950/25 to-transparent" />

                      {clickable && (
                        <div className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white opacity-0 backdrop-blur-md transition-opacity duration-300 group-hover:opacity-100">
                          <ZoomIn className="h-4 w-4" />
                        </div>
                      )}

                      <div className="absolute inset-x-0 bottom-0 p-4">
                        <h4 className="font-heading text-base font-bold text-white">
                          {game.name}
                        </h4>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            </div>
          ))}
        </div>
      </section>
      )}

      {/* Annual Events — Timeline Style */}
      {allEvents.length > 0 && (
      <section className="relative overflow-hidden py-20 px-6">
        <FloatingDoodles tone="dark" />
        <div className="relative z-10 mx-auto max-w-4xl">
          <AnimatedSection>
            <SectionHeading
              title="Annual Events"
              subtitle="Memorable celebrations that bring our school community together"
            />
          </AnimatedSection>

          <div className="mt-14 space-y-6">
            {allEvents.map((event, index) => (
              <AnimatedSection key={event.id} delay={index * 0.12}>
                <div className="group flex flex-col gap-5 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-all duration-300 hover:border-gold-300 hover:shadow-lg sm:flex-row sm:items-center">
                  {/* Season Badge */}
                  <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-gold-400 to-gold-600 shadow-md transition-transform duration-300 group-hover:scale-105">
                    <Star className="h-5 w-5 text-white" />
                    <span className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-white/90">
                      {event.season}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="flex-1">
                    <h3 className="font-heading text-lg font-bold text-navy-900">
                      {event.title}
                    </h3>
                    <p className="mt-1.5 leading-relaxed text-gray-600">
                      {event.description}
                    </p>
                  </div>

                  {/* Event photo — click to expand (CMS-managed) */}
                  {event.image && (
                    <button
                      type="button"
                      onClick={() =>
                        setLightbox({
                          src: event.image as string,
                          title: event.title,
                        })
                      }
                      aria-label={`View larger image of ${event.title}`}
                      className="group/img relative h-36 w-full shrink-0 overflow-hidden rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 sm:h-24 sm:w-44"
                    >
                      <Image
                        src={event.image}
                        alt={event.title}
                        fill
                        className="object-cover transition-transform duration-500 group-hover/img:scale-110"
                      />
                      <div className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-white opacity-0 backdrop-blur-md transition-opacity duration-300 group-hover/img:opacity-100">
                        <ZoomIn className="h-3.5 w-3.5" />
                      </div>
                    </button>
                  )}
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>
      )}

      {/* Lightbox — full-size activity image */}
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
