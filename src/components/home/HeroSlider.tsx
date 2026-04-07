"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Users, CalendarDays, GraduationCap, Building2 } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

/* ─── Slide data ─── */
const defaultSlides = [
  {
    title: "Where Futures\nBegin",
    subtitle: "Empowering young minds with holistic education since 1985",
    cta: "Explore Admissions",
    href: "/admissions",
    image: "/images/hero/campus-1.jpg",
  },
  {
    title: "Excellence in\nEducation",
    subtitle:
      "CBSE affiliated institution nurturing 10,000+ students across Jaipur",
    cta: "Learn More",
    href: "/about",
    image: "/images/hero/campus-2.avif",
  },
  {
    title: "Leaders Are\nMade Here",
    subtitle:
      "Building character through discipline, education and human values",
    cta: "Discover More",
    href: "/academics",
    image: "/images/news/n5.jpg",
  },
];

const stats = [
  { number: "10,000+", label: "Students", icon: Users },
  { number: "40+", label: "Years", icon: CalendarDays },
  { number: "200+", label: "Faculty", icon: GraduationCap },
  { number: "6", label: "Institutes", icon: Building2 },
];

const INTERVAL = 7000;
const CHAR_DELAY = 28; // ms between each character

/* ─── FadeIn wrapper ─── */
function FadeIn({
  delay = 0,
  duration = 800,
  children,
  className,
}: {
  delay?: number;
  duration?: number;
  children: React.ReactNode;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  return (
    <span
      className={cn("transition-opacity inline-block", className)}
      style={{
        opacity: visible ? 1 : 0,
        transitionDuration: `${duration}ms`,
      }}
    >
      {children}
    </span>
  );
}

/* ─── AnimatedHeading — character-by-character reveal ─── */
function AnimatedHeading({
  text,
  slideKey,
}: {
  text: string;
  slideKey: number;
}) {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    setAnimate(false);
    const t = setTimeout(() => setAnimate(true), 150);
    return () => clearTimeout(t);
  }, [slideKey]);

  const lines = text.split("\n");

  return (
    <h1
      className="font-heading text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold leading-[1.08] text-white"
      style={{ letterSpacing: "-0.03em" }}
    >
      {lines.map((line, lineIdx) => {
        const prevChars = lines
          .slice(0, lineIdx)
          .reduce((sum, l) => sum + l.length, 0);
        return (
          <span key={lineIdx} className="block">
            {line.split("").map((char, charIdx) => {
              const globalIdx = prevChars + charIdx;
              const isGoldLine = lineIdx === lines.length - 1;
              return (
                <span
                  key={`${slideKey}-${lineIdx}-${charIdx}`}
                  className={cn(
                    "inline-block transition-all",
                    isGoldLine ? "text-gold-400" : "text-white"
                  )}
                  style={{
                    opacity: animate ? 1 : 0,
                    transform: animate
                      ? "translateX(0)"
                      : "translateX(-18px)",
                    transitionDuration: "500ms",
                    transitionDelay: `${200 + globalIdx * CHAR_DELAY}ms`,
                    transitionTimingFunction: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
                  }}
                >
                  {char === " " ? "\u00A0" : char}
                </span>
              );
            })}
          </span>
        );
      })}
    </h1>
  );
}

/* ─── Main Hero Component ─── */
interface HeroSliderProps {
  images?: string[];
}

export function HeroSlider({ images }: HeroSliderProps = {}) {
  const slides = defaultSlides.map((slide, i) => ({
    ...slide,
    image: images?.[i] || slide.image,
  }));

  const [current, setCurrent] = useState(0);
  const [progress, setProgress] = useState(0);

  const goTo = useCallback((index: number) => {
    setCurrent(index);
    setProgress(0);
  }, []);

  /* Auto-advance with progress bar */
  useEffect(() => {
    const start = performance.now();
    let raf: number;

    function tick(now: number) {
      const elapsed = now - start;
      const pct = Math.min(elapsed / INTERVAL, 1);
      setProgress(pct);

      if (pct < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setCurrent((prev) => (prev + 1) % slides.length);
        setProgress(0);
      }
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [current, slides.length]);

  /* Derive per-slide animation delays */
  const titleCharCount = slides[current].title.replace(/\n/g, "").length;
  const subtitleDelay = 200 + titleCharCount * CHAR_DELAY + 200;
  const ctaDelay = subtitleDelay + 400;
  const tagDelay = ctaDelay + 200;

  return (
    <section className="relative h-screen w-full overflow-hidden">
      {/* ─── Background images with slow Ken Burns zoom ─── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={current}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, scale: [1, 1.08] }}
          exit={{ opacity: 0 }}
          transition={{
            opacity: { duration: 1.2, ease: "easeInOut" },
            scale: { duration: INTERVAL / 1000, ease: "linear" },
          }}
        >
          <Image
            src={slides[current].image}
            alt={slides[current].title.replace("\n", " ")}
            fill
            className="object-cover"
            priority={current === 0}
            sizes="100vw"
          />
        </motion.div>
      </AnimatePresence>

      {/* ─── Minimal vignette — NO heavy dark overlay ─── */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-black/40" />

      {/* ─── Hero content — pinned to bottom ─── */}
      <div className="relative z-10 flex h-full flex-col px-6 md:px-12 lg:px-16">
        {/* Spacer pushes content down */}
        <div className="flex-1" />

        {/* Bottom content area */}
        <div className="pb-32 md:pb-36 lg:pb-28">
          <div className="lg:grid lg:grid-cols-2 lg:items-end lg:gap-12">
            {/* Left column — Main content */}
            <div>
              <AnimatedHeading
                text={slides[current].title}
                slideKey={current}
              />

              <FadeIn
                key={`sub-${current}`}
                delay={subtitleDelay}
                duration={800}
                className="block"
              >
                <p className="mt-5 text-base md:text-lg text-gray-300 max-w-xl">
                  {slides[current].subtitle}
                </p>
              </FadeIn>

              <FadeIn
                key={`cta-${current}`}
                delay={ctaDelay}
                duration={800}
                className="block"
              >
                <div className="mt-6 flex flex-wrap items-center gap-4">
                  <Link
                    href={slides[current].href}
                    className="group liquid-glass border border-white/20 text-white px-8 py-3 rounded-lg font-medium transition-all duration-300 hover:bg-white hover:text-black inline-flex items-center gap-2"
                  >
                    {slides[current].cta}
                    <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </Link>
                  <Link
                    href="/contact"
                    className="text-sm text-gray-400 hover:text-white transition-colors duration-300 font-medium"
                  >
                    Contact Us &rarr;
                  </Link>
                </div>
              </FadeIn>
            </div>

            {/* Right column — Tag card */}
            <div className="hidden lg:flex items-end justify-end mt-8 lg:mt-0">
              <FadeIn
                key={`tag-${current}`}
                delay={tagDelay}
                duration={800}
              >
                <div className="liquid-glass border border-white/20 px-6 py-3 rounded-xl">
                  <p className="text-lg md:text-xl lg:text-2xl font-light text-white tracking-tight">
                    CBSE Affiliated&ensp;·&ensp;Est. 1985&ensp;·&ensp;6 Campuses
                  </p>
                </div>
              </FadeIn>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Stats bar — liquid glass floating at bottom ─── */}
      <div className="absolute bottom-6 left-0 right-0 z-20 px-4 md:px-12 lg:px-16">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1.5 }}
          className="mx-auto max-w-5xl liquid-glass border border-white/15 rounded-2xl px-4 py-4 md:px-6 md:py-5"
        >
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-0 md:divide-x md:divide-white/15">
            {stats.map((stat, i) => {
              const Icon = stat.icon;
              return (
                <div
                  key={i}
                  className="flex items-center justify-center gap-3 md:px-4"
                >
                  <div className="hidden md:flex w-9 h-9 rounded-lg bg-white/10 items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-gold-400" />
                  </div>
                  <div className="text-center md:text-left">
                    <span className="block text-lg md:text-2xl font-semibold text-white leading-tight">
                      {stat.number}
                    </span>
                    <span className="block text-[10px] md:text-xs uppercase tracking-wider text-gray-400">
                      {stat.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>

      {/* ─── Slide indicators — vertical pills right side ─── */}
      <div className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-2.5">
        {slides.map((_, index) => (
          <button
            key={index}
            onClick={() => goTo(index)}
            className="group relative flex items-center justify-center cursor-pointer"
            aria-label={`Go to slide ${index + 1}`}
          >
            <span
              className={cn(
                "block w-1 rounded-full transition-all duration-500",
                index === current
                  ? "h-8 bg-gold-400"
                  : "h-3 bg-white/30 group-hover:bg-white/60"
              )}
            />
          </button>
        ))}
      </div>

      {/* ─── Progress bar — very bottom ─── */}
      <div className="absolute bottom-0 left-0 right-0 z-30 h-[2px] bg-white/10">
        <motion.div
          className="h-full bg-gold-400"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </section>
  );
}
