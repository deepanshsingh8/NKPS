"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { X } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageTransition } from "@/components/shared/PageTransition";
import { SectionDivider } from "@/components/shared/SectionDivider";
import { AnimatedSection } from "@/components/shared/AnimatedSection";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { staggerContainer, fadeUp } from "@/lib/animations";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const categories = ["All", "Academics", "Sports", "Cultural", "Campus", "Events"];

const staticImages = [
  { id: "static-1", category: "campus", alt: "School Campus", src: "/images/gallery/g10.jpg" },
  { id: "static-2", category: "events", alt: "School Event", src: "/images/news/n1.jpg" },
  { id: "static-3", category: "sports", alt: "Sports Activities", src: "/images/news/n3.jpg" },
  { id: "static-4", category: "cultural", alt: "Cultural Programme", src: "/images/news/n5.jpg" },
  { id: "static-5", category: "events", alt: "Annual Function", src: "/images/news/n2.jpg" },
  { id: "static-6", category: "academics", alt: "Academic Excellence", src: "/images/news/n4.jpg" },
  { id: "static-7", category: "cultural", alt: "Performance", src: "/images/news/n6.jpg" },
  { id: "static-8", category: "campus", alt: "School Life", src: "/images/news/n7.jpg" },
  { id: "static-9", category: "academics", alt: "Student Achievement", src: "/images/gallery/st1.jpg" },
  { id: "static-10", category: "academics", alt: "Shining Star", src: "/images/gallery/st2.jpg" },
  { id: "static-11", category: "academics", alt: "Student Success", src: "/images/gallery/st3.jpg" },
  { id: "static-12", category: "events", alt: "School Assembly", src: "/images/gallery/st4.jpg" },
];

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
  const [viewMode, setViewMode] = useState<"categories" | "events">("categories");
  const [lightboxImage, setLightboxImage] = useState<GalleryImage | null>(null);
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>(staticImages);
  const [galleryEvents, setGalleryEvents] = useState<GalleryEventWithImages[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<GalleryEventWithImages | null>(null);
  const [eventImages, setEventImages] = useState<GalleryImage[]>([]);

  useEffect(() => {
    async function fetchImages() {
      const supabase = createClient();
      const { data } = await supabase
        .from("gallery_images")
        .select("id, src, alt, category")
        .order("sort_order", { ascending: true });

      if (data && data.length > 0) {
        const dbImages: GalleryImage[] = data.map((img) => ({
          id: String(img.id),
          src: img.src,
          alt: img.alt,
          category: img.category,
        }));
        setGalleryImages([...dbImages, ...staticImages]);
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
      }
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
          {galleryEvents.length > 0 && (
            <AnimatedSection delay={0.08}>
              <div className="mt-10 flex justify-center gap-2">
                <button
                  onClick={() => { setViewMode("categories"); setSelectedEvent(null); }}
                  className={cn(
                    "px-5 py-2 rounded-lg text-sm font-medium transition-all",
                    viewMode === "categories"
                      ? "bg-navy-900 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  )}
                >
                  By Category
                </button>
                <button
                  onClick={() => setViewMode("events")}
                  className={cn(
                    "px-5 py-2 rounded-lg text-sm font-medium transition-all",
                    viewMode === "events"
                      ? "bg-navy-900 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  )}
                >
                  By Event
                </button>
              </div>
            </AnimatedSection>
          )}

          {/* Filter Tabs — category mode */}
          {viewMode === "categories" && (<>
          <AnimatedSection delay={0.1}>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              {categories.map((category) => (
                <button
                  key={category}
                  onClick={() => setActiveCategory(category)}
                  className={cn(
                    "rounded-full px-6 py-2.5 text-sm font-semibold transition-all duration-300 flex items-center gap-2",
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
                    <div className="p-4 w-full">
                      <span className="text-white font-semibold text-sm">
                        {image.alt}
                      </span>
                      <span className="block text-gold-400 text-xs mt-0.5 capitalize">
                        {image.category}
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
          </>)}

          {/* Events View */}
          {viewMode === "events" && !selectedEvent && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              {galleryEvents.map((evt) => (
                <motion.div
                  key={evt.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="group cursor-pointer bg-white rounded-2xl border border-navy-900/5 overflow-hidden shadow-sm hover:shadow-lg hover:border-gold-500/20 transition-all duration-300 hover:-translate-y-1"
                  onClick={() => fetchEventImages(evt)}
                >
                  <div className="aspect-[16/9] bg-navy-100 relative">
                    {evt.cover_url ? (
                      <Image
                        src={evt.cover_url}
                        alt={evt.title}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <span className="text-4xl">📷</span>
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
                      <span className="text-white text-xs font-medium">
                        {evt.image_count} photo{evt.image_count !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="font-bold text-navy-900">{evt.title}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-gray-500">
                        {new Date(evt.event_date + "T00:00:00").toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                      {evt.academic_year && (
                        <span className="text-xs bg-cream-100 text-navy-800 px-2 py-0.5 rounded-full font-medium">
                          {evt.academic_year}
                        </span>
                      )}
                    </div>
                    {evt.description && (
                      <p className="text-xs text-gray-500 mt-2 line-clamp-2">
                        {evt.description}
                      </p>
                    )}
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}

          {/* Selected Event Images */}
          {viewMode === "events" && selectedEvent && (
            <div className="mt-10">
              <button
                onClick={() => { setSelectedEvent(null); setEventImages([]); }}
                className="text-sm text-gold-500 hover:underline mb-4 inline-block"
              >
                ← Back to events
              </button>
              <h3 className="font-heading text-xl font-bold text-navy-900 mb-2">
                {selectedEvent.title}
              </h3>
              {selectedEvent.description && (
                <p className="text-sm text-gray-500 mb-6">{selectedEvent.description}</p>
              )}
              {eventImages.length === 0 ? (
                <p className="text-center py-12 text-gray-400 text-sm">
                  No photos uploaded for this event yet.
                </p>
              ) : (
                <motion.div
                  layout
                  className="columns-1 gap-4 md:columns-2 lg:columns-3"
                >
                  <AnimatePresence mode="popLayout">
                    {eventImages.map((image, index) => (
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
                          <div className="p-4 w-full">
                            <span className="text-white font-semibold text-sm">
                              {image.alt}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>
              )}
            </div>
          )}

          {/* Note */}
          <p className="mt-12 text-center text-sm text-gray-400">
            Gallery images will be managed by the school administration.
          </p>
        </div>
      </section>

      {/* Lightbox */}
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
            {/* Close Button */}
            <button
              onClick={closeLightbox}
              className="absolute top-4 right-4 z-10 rounded-full bg-white/10 p-2 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
              aria-label="Close lightbox"
            >
              <X className="h-6 w-6" />
            </button>

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
