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

export default function GalleryPage() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [lightboxImage, setLightboxImage] = useState<GalleryImage | null>(null);
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>(staticImages);

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
        // DB images first, then static fallbacks
        setGalleryImages([...dbImages, ...staticImages]);
      }
    }
    fetchImages();
  }, []);

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

          {/* Filter Tabs */}
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
