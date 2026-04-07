"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { X, Download, Calendar, Filter, ChevronLeft, ImageIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageTransition } from "@/components/shared/PageTransition";
import { SectionDivider } from "@/components/shared/SectionDivider";
import { AnimatedSection } from "@/components/shared/AnimatedSection";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const categories = ["All", "Academics", "Sports", "Cultural", "Campus", "Events"];

// Static images have been migrated to Supabase via /api/admin/migrate-gallery

const aspectPatterns = ["aspect-[4/3]", "aspect-[3/4]", "aspect-square"];

type GalleryImage = { id: string; category: string; alt: string; src: string };

interface GalleryEventWithImages {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  academic_year: string | null;
  image_count: number;
  cover_url: string | null;
}

export default function GalleryPage() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [viewMode, setViewMode] = useState<"categories" | "events">("events");
  const [lightboxImage, setLightboxImage] = useState<GalleryImage | null>(null);
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [galleryEvents, setGalleryEvents] = useState<GalleryEventWithImages[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<GalleryEventWithImages | null>(null);
  const [eventImages, setEventImages] = useState<GalleryImage[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchImages() {
      const supabase = createClient();
      const { data } = await supabase
        .from("gallery_images")
        .select("id, src, alt, category")
        .order("sort_order", { ascending: true });

      if (data) {
        const dbImages: GalleryImage[] = data.map((img) => ({
          id: String(img.id),
          src: img.src,
          alt: img.alt,
          category: img.category,
        }));
        setGalleryImages(dbImages);
      }

      // Fetch gallery events
      const { data: events } = await supabase
        .from("gallery_events")
        .select("id, title, description, event_date, academic_year, cover_image_url")
        .eq("is_public", true)
        .order("event_date", { ascending: false });

      if (events && events.length > 0) {
        // Get image counts per event
        const { data: eventImgs } = await supabase
          .from("gallery_images")
          .select("gallery_event_id")
          .not("gallery_event_id", "is", null);

        const counts: Record<string, number> = {};
        (eventImgs ?? []).forEach((img: { gallery_event_id: string | null }) => {
          if (img.gallery_event_id) {
            counts[img.gallery_event_id] = (counts[img.gallery_event_id] || 0) + 1;
          }
        });

        const eventsWithCounts: GalleryEventWithImages[] = events.map((e) => ({
          id: e.id,
          title: e.title,
          description: e.description,
          event_date: e.event_date,
          academic_year: e.academic_year,
          image_count: counts[e.id] || 0,
          cover_url: e.cover_image_url,
        }));

        setGalleryEvents(eventsWithCounts);

        // Extract unique academic years for the filter
        const years = new Set<string>();
        eventsWithCounts.forEach((evt) => {
          if (evt.academic_year) years.add(evt.academic_year);
        });
        setAvailableYears(Array.from(years).sort().reverse());
      }

      setLoading(false);
    }
    fetchImages();
  }, []);

  const fetchEventImages = async (event: GalleryEventWithImages) => {
    setSelectedEvent(event);
    const supabase = createClient();
    const { data } = await supabase
      .from("gallery_images")
      .select("id, src, alt, category")
      .eq("gallery_event_id", event.id)
      .order("sort_order", { ascending: true });

    setEventImages(
      (data ?? []).map((img) => ({
        id: String(img.id),
        src: img.src,
        alt: img.alt,
        category: img.category,
      }))
    );
  };

  const downloadImage = async (image: GalleryImage) => {
    try {
      const response = await fetch(image.src);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Extract extension from src, default to jpg
      const ext = image.src.split(".").pop()?.split("?")[0] || "jpg";
      a.download = `${image.alt.replace(/[^a-zA-Z0-9]/g, "_")}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch {
      // Fallback: open in new tab
      window.open(image.src, "_blank");
    }
  };

  function getCategoryCount(category: string) {
    if (category === "All") return galleryImages.length;
    return galleryImages.filter((img) => img.category === category.toLowerCase()).length;
  }

  const filteredImages =
    activeCategory === "All"
      ? galleryImages
      : galleryImages.filter(
          (img) => img.category === activeCategory.toLowerCase()
        );

  // Filter events by selected year
  const filteredEvents =
    selectedYear === "all"
      ? galleryEvents
      : galleryEvents.filter((evt) => evt.academic_year === selectedYear);

  const closeLightbox = useCallback(() => setLightboxImage(null), []);

  return (
    <PageTransition>
      <PageHeader title="Gallery" subtitle="Glimpses of Life at NK Public School" />

      <SectionDivider />

      <section className="py-20 px-6">
        <div className="mx-auto max-w-6xl">
          <AnimatedSection>
            <SectionHeading title="Photo Gallery" />
          </AnimatedSection>

          {/* View Mode Toggle */}
          <AnimatedSection delay={0.08}>
            <div className="mt-10 flex justify-center gap-2">
              <button
                onClick={() => { setViewMode("categories"); setSelectedEvent(null); }}
                className={cn(
                  "px-5 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
                  viewMode === "categories"
                    ? "bg-navy-900 text-white shadow-lg shadow-navy-900/20"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}
              >
                <Filter className="h-4 w-4" />
                By Category
              </button>
              <button
                onClick={() => setViewMode("events")}
                className={cn(
                  "px-5 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
                  viewMode === "events"
                    ? "bg-navy-900 text-white shadow-lg shadow-navy-900/20"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}
              >
                <Calendar className="h-4 w-4" />
                By Event
              </button>
            </div>
          </AnimatedSection>

          {/* ============================================================= */}
          {/* CATEGORY VIEW                                                  */}
          {/* ============================================================= */}
          {viewMode === "categories" && (<>
            {/* Filter Tabs */}
            <AnimatedSection delay={0.1}>
              <div className="mt-10 flex flex-wrap justify-center gap-3">
                {categories.map((category) => (
                  <button
                    key={category}
                    onClick={() => setActiveCategory(category)}
                    className={cn(
                      "rounded-full px-4 py-2 sm:px-6 sm:py-2.5 text-xs sm:text-sm font-semibold transition-all duration-300 flex items-center gap-2",
                      activeCategory === category
                        ? "bg-gradient-to-r from-navy-900 to-navy-800 text-white shadow-lg shadow-navy-900/25 scale-105"
                        : "border-2 border-navy-900/10 bg-white text-navy-900 hover:border-navy-900/30 hover:bg-cream-50 hover:shadow-md"
                    )}
                  >
                    {category}
                    <span
                      className={cn(
                        "inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold min-w-[1.5rem]",
                        activeCategory === category
                          ? "bg-gold-500 text-navy-900"
                          : "bg-cream-100 text-navy-800"
                      )}
                    >
                      {getCategoryCount(category)}
                    </span>
                  </button>
                ))}
              </div>
            </AnimatedSection>

            {/* Masonry Grid */}
            <motion.div
              layout
              className="mt-12 columns-1 gap-4 md:columns-2 lg:columns-3"
            >
              <AnimatePresence mode="popLayout">
                {filteredImages.map((image, index) => (
                  <motion.div
                    key={image.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.3 }}
                    className={cn(
                      "group relative mb-4 break-inside-avoid overflow-hidden rounded-2xl bg-navy-100 cursor-pointer",
                      aspectPatterns[index % 3]
                    )}
                    onClick={() => setLightboxImage(image)}
                  >
                    <Image
                      src={image.src}
                      alt={image.alt}
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-navy-900/70 via-navy-900/0 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end">
                      <div className="p-4 w-full flex items-end justify-between">
                        <div>
                          <span className="text-white font-semibold text-sm">
                            {image.alt}
                          </span>
                          <span className="block text-gold-400 text-xs mt-0.5 capitalize">
                            {image.category}
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadImage(image);
                          }}
                          className="flex-shrink-0 rounded-full bg-white/20 p-2 text-white backdrop-blur-sm hover:bg-white/30 transition-colors"
                          aria-label="Download image"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          </>)}

          {/* ============================================================= */}
          {/* EVENTS VIEW                                                    */}
          {/* ============================================================= */}
          {viewMode === "events" && !selectedEvent && (
            <div className="mt-10">
              {/* Year Filter */}
              {availableYears.length > 0 && (
                <AnimatedSection delay={0.1}>
                  <div className="flex flex-wrap justify-center gap-2 mb-8">
                    <button
                      onClick={() => setSelectedYear("all")}
                      className={cn(
                        "rounded-full px-5 py-2 text-sm font-medium transition-all duration-300",
                        selectedYear === "all"
                          ? "bg-gradient-to-r from-gold-500 to-gold-400 text-navy-900 shadow-md shadow-gold-500/20"
                          : "border-2 border-navy-900/10 bg-white text-navy-900 hover:border-gold-500/30 hover:bg-cream-50"
                      )}
                    >
                      All Years
                    </button>
                    {availableYears.map((year) => (
                      <button
                        key={year}
                        onClick={() => setSelectedYear(year)}
                        className={cn(
                          "rounded-full px-5 py-2 text-sm font-medium transition-all duration-300",
                          selectedYear === year
                            ? "bg-gradient-to-r from-gold-500 to-gold-400 text-navy-900 shadow-md shadow-gold-500/20"
                            : "border-2 border-navy-900/10 bg-white text-navy-900 hover:border-gold-500/30 hover:bg-cream-50"
                        )}
                      >
                        {year}
                      </button>
                    ))}
                  </div>
                </AnimatedSection>
              )}

              {/* Event Cards */}
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-navy-900/20 border-t-navy-900" />
                  <p className="mt-4 text-sm text-navy-800/50">Loading events...</p>
                </div>
              ) : filteredEvents.length > 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                >
                  {filteredEvents.map((evt, i) => (
                    <motion.div
                      key={evt.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="group cursor-pointer bg-white rounded-2xl border border-navy-900/5 overflow-hidden shadow-sm hover:shadow-xl hover:border-gold-500/20 transition-all duration-300 hover:-translate-y-1"
                      onClick={() => fetchEventImages(evt)}
                    >
                      <div className="aspect-[16/9] bg-navy-100 relative overflow-hidden">
                        {evt.cover_url ? (
                          <Image
                            src={evt.cover_url}
                            alt={evt.title}
                            fill
                            className="object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-navy-50 to-cream-100">
                            <ImageIcon className="h-12 w-12 text-navy-300" />
                          </div>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
                          <span className="text-white text-xs font-medium bg-white/20 backdrop-blur-sm rounded-full px-3 py-1">
                            {evt.image_count} photo{evt.image_count !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                      <div className="p-5">
                        <h3 className="font-heading font-bold text-navy-900 text-lg leading-tight">
                          {evt.title}
                        </h3>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(evt.event_date + "T00:00:00").toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                          {evt.academic_year && (
                            <span className="text-xs bg-cream-100 text-navy-800 px-2.5 py-0.5 rounded-full font-medium">
                              {evt.academic_year}
                            </span>
                          )}
                        </div>
                        {evt.description && (
                          <p className="text-sm text-gray-500 mt-3 line-clamp-2 leading-relaxed">
                            {evt.description}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="rounded-full bg-cream-100 p-6">
                    <ImageIcon className="h-10 w-10 text-navy-800/30" />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-navy-900">
                    No events found
                  </h3>
                  <p className="mt-2 text-sm text-navy-800/50 text-center max-w-sm">
                    {selectedYear !== "all"
                      ? `No gallery events for ${selectedYear}. Try selecting a different year.`
                      : "Gallery events will appear here once added by the school administration."}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ============================================================= */}
          {/* SELECTED EVENT — PHOTO BROWSER                                 */}
          {/* ============================================================= */}
          {viewMode === "events" && selectedEvent && (
            <div className="mt-10">
              {/* Back button + Event header */}
              <div className="mb-8">
                <button
                  onClick={() => { setSelectedEvent(null); setEventImages([]); }}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-900 hover:text-gold-600 transition-colors mb-4"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back to events
                </button>
                <h3 className="font-heading text-2xl font-bold text-navy-900">
                  {selectedEvent.title}
                </h3>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-sm text-gray-500 flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {new Date(selectedEvent.event_date + "T00:00:00").toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                  {selectedEvent.academic_year && (
                    <span className="text-xs bg-cream-100 text-navy-800 px-2.5 py-0.5 rounded-full font-medium">
                      {selectedEvent.academic_year}
                    </span>
                  )}
                  <span className="text-xs bg-navy-50 text-navy-700 px-2.5 py-0.5 rounded-full font-medium">
                    {eventImages.length} photo{eventImages.length !== 1 ? "s" : ""}
                  </span>
                </div>
                {selectedEvent.description && (
                  <p className="text-sm text-gray-500 mt-3 max-w-2xl leading-relaxed">
                    {selectedEvent.description}
                  </p>
                )}
              </div>

              {eventImages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="rounded-full bg-cream-100 p-6">
                    <ImageIcon className="h-10 w-10 text-navy-800/30" />
                  </div>
                  <p className="mt-4 text-sm text-gray-400">
                    No photos uploaded for this event yet.
                  </p>
                </div>
              ) : (
                <motion.div
                  layout
                  className="columns-1 gap-4 md:columns-2 lg:columns-3"
                >
                  {eventImages.map((image, index) => (
                    <motion.div
                      key={image.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3, delay: index * 0.03 }}
                      className={cn(
                        "group relative mb-4 break-inside-avoid overflow-hidden rounded-2xl bg-navy-100 cursor-pointer",
                        aspectPatterns[index % 3]
                      )}
                      onClick={() => setLightboxImage(image)}
                    >
                      <Image
                        src={image.src}
                        alt={image.alt}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-navy-900/70 via-navy-900/0 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end">
                        <div className="p-4 w-full flex items-end justify-between">
                          <span className="text-white font-semibold text-sm">
                            {image.alt}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              downloadImage(image);
                            }}
                            className="flex-shrink-0 rounded-full bg-white/20 p-2 text-white backdrop-blur-sm hover:bg-white/30 transition-colors"
                            aria-label="Download image"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </div>
          )}

          {/* Note */}
          <p className="mt-12 text-center text-sm text-gray-400">
            Gallery images are managed by the school administration.
          </p>
        </div>
      </section>

      {/* Lightbox with Download */}
      <AnimatePresence>
        {lightboxImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 md:p-8"
            onClick={closeLightbox}
          >
            {/* Top buttons */}
            <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  downloadImage(lightboxImage);
                }}
                className="rounded-full bg-white/10 p-2.5 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
                aria-label="Download image"
              >
                <Download className="h-5 w-5" />
              </button>
              <button
                onClick={closeLightbox}
                className="rounded-full bg-white/10 p-2.5 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
                aria-label="Close lightbox"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Image */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="relative max-h-[85vh] max-w-[90vw] md:max-w-[75vw]"
              onClick={(e) => e.stopPropagation()}
            >
              <Image
                src={lightboxImage.src}
                alt={lightboxImage.alt}
                width={1200}
                height={800}
                className="max-h-[85vh] w-auto rounded-lg object-contain"
              />
              {/* Caption */}
              <div className="absolute bottom-0 left-0 right-0 rounded-b-lg bg-gradient-to-t from-black/80 to-transparent px-6 py-4">
                <p className="text-center text-white font-medium">
                  {lightboxImage.alt}
                </p>
                <p className="text-center text-gold-400 text-sm capitalize mt-0.5">
                  {lightboxImage.category}
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageTransition>
  );
}
