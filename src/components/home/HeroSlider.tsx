"use client";

import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion, useTransform } from "framer-motion";
import { ArrowRight, Users, CalendarDays, GraduationCap, Building2 } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { useMouseMotion } from "@/hooks/useMousePosition";

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
      "CBSE affiliated institution nurturing 20,000+ students across Jaipur",
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
  { number: "20,000+", label: "Students", icon: Users },
  { number: "40+", label: "Years", icon: CalendarDays },
  { number: "300+", label: "Faculty", icon: GraduationCap },
  { number: "6", label: "Institutes", icon: Building2 },
];

const INTERVAL = 7000;
const CHAR_DELAY = 28;

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

  /* Mouse parallax — multiple depth layers */
  const { x: mouseX, y: mouseY } = useMouseMotion(40, 18);

  // Background image layer — subtle, slow movement (depth: far)
  const bgX = useTransform(mouseX, (v) => v * -15);
  const bgY = useTransform(mouseY, (v) => v * -10);

  // Floating orb layer — moderate movement (depth: mid)
  const orbX = useTransform(mouseX, (v) => v * 25);
  const orbY = useTransform(mouseY, (v) => v * 20);

  // Text content layer — slight counter-movement (depth: near)
  const contentX = useTransform(mouseX, (v) => v * 5);
  const contentY = useTransform(mouseY, (v) => v * 3);

  // Floating accent — inverted, fast (depth: foreground)
  const accentX = useTransform(mouseX, (v) => v * -35);
  const accentY = useTransform(mouseY, (v) => v * -25);

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

  /* Per-slide animation delays */
  const titleCharCount = slides[current].title.replace(/\n/g, "").length;
  const subtitleDelay = 200 + titleCharCount * CHAR_DELAY + 200;
  const ctaDelay = subtitleDelay + 400;
  const tagDelay = ctaDelay + 200;

  return (
    <section className="relative h-screen w-full overflow-hidden bg-navy-950">
      {/* ═══ LAYER 1: Background image with mouse parallax ═══ */}
      <AnimatePresence mode="wait">
        <motion.div
          key={current}
          className="absolute -inset-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, scale: [1, 1.06] }}
          exit={{ opacity: 0 }}
          transition={{
            opacity: { duration: 1.2, ease: "easeInOut" },
            scale: { duration: INTERVAL / 1000, ease: "linear" },
          }}
          style={{ x: bgX, y: bgY }}
        >
          <Image
            src={slides[current].image}
            alt={slides[current].title.replace("\n", " ")}
            fill
            className="object-cover scale-110"
            priority={current === 0}
            sizes="100vw"
          />
        </motion.div>
      </AnimatePresence>

      {/* ═══ LAYER 2: Translucent overlay for readability ═══ */}
      <div className="absolute inset-0 bg-gradient-to-t from-navy-950/80 via-navy-950/40 to-navy-950/50" />
      <div className="absolute inset-0 bg-gradient-to-r from-navy-950/50 via-transparent to-transparent" />

      {/* ═══ LAYER 3: Floating parallax orbs (mid-depth) ═══ */}
      <motion.div
        className="absolute inset-0 pointer-events-none z-[2]"
        style={{ x: orbX, y: orbY }}
      >
        {/* Large ring — top right */}
        <motion.div
          className="absolute top-[12%] right-[15%] w-52 h-52 rounded-full border border-gold-400/20"
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
        />
        {/* Small filled orb — bottom left */}
        <div className="absolute bottom-[30%] left-[10%] w-4 h-4 rounded-full bg-gold-400/30" />
        {/* Medium ring — center right */}
        <div className="absolute top-[45%] right-[8%] w-20 h-20 rounded-full border border-white/10" />
      </motion.div>

      {/* ═══ LAYER 4: Inverted parallax accent (foreground depth) ═══ */}
      <motion.div
        className="absolute inset-0 pointer-events-none z-[3]"
        style={{ x: accentX, y: accentY }}
      >
        {/* Soft gold glow — top left */}
        <div className="absolute top-[20%] left-[20%] w-72 h-72 rounded-full bg-gold-500/5 blur-3xl" />
        {/* Small square accent — bottom right */}
        <motion.div
          className="absolute bottom-[25%] right-[20%] w-12 h-12 rounded-lg border border-gold-400/15 rotate-12"
          animate={{ rotate: [12, -12, 12] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.div>

      {/* ═══ LAYER 5: Dot pattern texture ═══ */}
      <div
        className="absolute inset-0 opacity-[0.025] z-[4]"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* ═══ LAYER 6: Content with subtle parallax ═══ */}
      <motion.div
        className="relative z-10 flex h-full flex-col px-6 md:px-12 lg:px-16"
        style={{ x: contentX, y: contentY }}
      >
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
                    CBSE Affiliated&ensp;&middot;&ensp;Est. 1985&ensp;&middot;&ensp;6 Campuses
                  </p>
                </div>
              </FadeIn>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ═══ Stats bar — liquid glass ═══ */}
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

      {/* ═══ Slide indicators ═══ */}
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

      {/* ═══ Progress bar ═══ */}
      <div className="absolute bottom-0 left-0 right-0 z-30 h-[2px] bg-white/10">
        <motion.div
          className="h-full bg-gold-400"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </section>
  );
}
