"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { staggerContainer, fadeUp } from "@nkps/shared/lib/animations";
import { SectionHeading } from "@nkps/shared/components/SectionHeading";
import { cn } from "@nkps/shared/lib/utils";
import type { Article } from "@nkps/shared/types";

interface LatestUpdatesProps {
  articles?: Article[];
}

const AUTO_INTERVAL = 6000;

function formatMonthYear(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

// Responsive cards-per-page: 1 on mobile, 2 on tablet, 3 on desktop — mirrors
// the original grid-cols-1 / md:2 / lg:3 layout.
function usePerView(): number {
  const [perView, setPerView] = useState(3);
  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      setPerView(w >= 1024 ? 3 : w >= 768 ? 2 : 1);
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);
  return perView;
}

export function LatestUpdates({ articles }: LatestUpdatesProps = {}) {
  // Latest Updates is driven entirely by published articles (managed in the
  // CMS Articles area). There is no section_cards fallback — the school keeps
  // at least one published article (e.g. the evergreen "History of NKPS") so
  // this section is never empty.
  const updates = (articles ?? []).map((a) => ({
    key: a.id,
    date: formatMonthYear(a.published_at),
    title: a.title,
    description: a.excerpt || "",
    image: a.cover_image_url || "/images/news/n2.jpg",
    link: `/articles/${a.slug}`,
  }));

  const perView = usePerView();
  const pageCount = Math.max(1, Math.ceil(updates.length / perView));
  const isCarousel = updates.length > perView;

  const [page, setPage] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);

  // Clamp the page when perView changes (resize) or the dataset shrinks so we
  // never translate past the last page.
  const safePage = Math.min(page, pageCount - 1);

  const goTo = useCallback((index: number) => {
    setPage(((index % pageCount) + pageCount) % pageCount);
    setProgress(0);
  }, [pageCount]);

  const next = useCallback(() => goTo(safePage + 1), [goTo, safePage]);
  const prev = useCallback(() => goTo(safePage - 1), [goTo, safePage]);

  // Auto-advance with a rAF-driven progress bar (matches HeroSlider). Pauses on
  // hover/focus and when the section isn't a carousel.
  const startRef = useRef(0);
  useEffect(() => {
    if (!isCarousel || paused) return;
    let raf: number;
    startRef.current = 0;
    function tick(now: number) {
      if (startRef.current === 0) startRef.current = now;
      const pct = Math.min((now - startRef.current) / AUTO_INTERVAL, 1);
      setProgress(pct);
      if (pct < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setPage((p) => (p + 1) % pageCount);
        setProgress(0);
      }
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isCarousel, paused, safePage, pageCount]);

  if (updates.length === 0) return null;

  return (
    <section className="section-padding relative overflow-hidden">
      <div className="page-container relative z-10">
        <SectionHeading
          label="News & Announcements"
          title="Latest Updates"
          subtitle="Stay informed with school news and announcements"
        />

        <div
          className="relative mt-12"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocusCapture={() => setPaused(true)}
          onBlurCapture={() => setPaused(false)}
        >
          {/* Viewport */}
          <div className="overflow-hidden">
            {/* Track — each card occupies (100 / perView)% so one page == perView cards */}
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              className="flex -mx-3.5 transition-transform duration-700 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]"
              style={{ transform: `translateX(-${safePage * 100}%)` }}
            >
              {updates.map((item) => (
                <motion.div
                  key={item.key}
                  variants={fadeUp}
                  className="shrink-0 px-3.5 flex"
                  style={{ flexBasis: `${100 / perView}%`, maxWidth: `${100 / perView}%` }}
                >
                  <motion.div whileHover={{ y: -6 }} transition={{ type: "spring", stiffness: 300, damping: 25 }} className="w-full">
                    <Link
                      href={item.link}
                      className="group flex flex-col h-full rounded-3xl overflow-hidden bg-white border border-gray-100/80 shadow-sm hover:shadow-xl hover:shadow-gold-500/8 hover:border-gold-500/20 transition-all duration-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2"
                    >
                      {/* Image — fixed height so every card has an identical cover */}
                      <div className="relative h-52 w-full shrink-0 overflow-hidden">
                        <Image
                          src={item.image}
                          alt={item.title}
                          fill
                          sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                          className="object-cover transition-transform duration-[800ms] ease-out group-hover:scale-[1.08]"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-navy-950/20 to-transparent group-hover:from-navy-950/30 transition-all duration-500" />
                      </div>

                      {/* Content — flex column so the footer pins to the bottom
                          and every card ends up the same height */}
                      <div className="p-6 flex flex-1 flex-col">
                        {/* Date badge */}
                        <span className="inline-block self-start bg-gold-500/8 text-gold-600 text-xs font-semibold px-3.5 py-1.5 rounded-full border border-gold-500/15 group-hover:bg-gold-500/15 group-hover:border-gold-500/25 transition-all duration-300">
                          {item.date}
                        </span>

                        {/* min-h reserves two lines so single-line titles still
                            align the description across cards */}
                        <h3 className="font-heading text-lg font-semibold text-navy-900 mt-3 min-h-[3.5rem] line-clamp-2 leading-snug">
                          {item.title}
                        </h3>

                        <p className="text-gray-500 text-sm mt-2 leading-relaxed line-clamp-2">
                          {item.description}
                        </p>

                        <div className="mt-auto pt-4 flex items-center gap-1.5 text-navy-900 text-sm font-medium group-hover:text-gold-600 transition-colors duration-300">
                          Read more
                          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1.5 transition-transform duration-300" />
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                </motion.div>
              ))}
            </motion.div>
          </div>

          {/* Arrows */}
          {isCarousel && (
            <>
              <button
                type="button"
                onClick={prev}
                aria-label="Previous updates"
                className="absolute -left-2 md:-left-5 top-[6.5rem] -translate-y-1/2 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 backdrop-blur border border-gray-100 shadow-md text-navy-900 hover:bg-white hover:text-gold-600 hover:shadow-lg transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={next}
                aria-label="Next updates"
                className="absolute -right-2 md:-right-5 top-[6.5rem] -translate-y-1/2 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 backdrop-blur border border-gray-100 shadow-md text-navy-900 hover:bg-white hover:text-gold-600 hover:shadow-lg transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
        </div>

        {/* Dots + progress */}
        {isCarousel && (
          <div className="mt-8 flex flex-col items-center gap-4">
            <div className="flex items-center gap-2.5">
              {Array.from({ length: pageCount }).map((_, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => goTo(index)}
                  aria-label={`Go to updates page ${index + 1}`}
                  aria-current={index === safePage}
                  className="group relative flex items-center justify-center p-1.5"
                >
                  <span
                    className={cn(
                      "block h-1.5 rounded-full transition-all duration-500",
                      index === safePage
                        ? "w-8 bg-gold-500"
                        : "w-1.5 bg-gray-300 group-hover:bg-gray-400"
                    )}
                  />
                </button>
              ))}
            </div>
            {/* Auto-advance progress for the active page */}
            <div className="h-[2px] w-40 overflow-hidden rounded-full bg-gray-200/70">
              <div
                className="h-full bg-gradient-to-r from-gold-500 to-gold-400"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>
        )}

        <div className="mt-10 text-center">
          <Link
            href="/articles"
            className="group inline-flex items-center gap-2 text-navy-900 font-semibold hover:text-gold-600 transition-colors duration-300"
          >
            View All Articles
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
          </Link>
        </div>
      </div>
    </section>
  );
}
