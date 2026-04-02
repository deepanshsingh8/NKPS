"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { MouseParallax } from "@/components/shared/MouseParallax";

const slides = [
  {
    title: "Where Futures",
    titleHighlight: "Begin",
    subtitle: "Empowering young minds with holistic education since 1985",
    cta: "Explore Admissions",
    href: "/admissions",
    image: "/images/hero/campus-1.jpg",
  },
  {
    title: "Excellence in",
    titleHighlight: "Education",
    subtitle:
      "CBSE affiliated institution nurturing 10000+ students across Jaipur",
    cta: "Learn More",
    href: "/about",
    image: "/images/hero/campus-2.avif",
  },
  {
    title: "Leaders Are",
    titleHighlight: "Made Here",
    subtitle:
      "Building character through discipline, education and human values",
    cta: "Discover More",
    href: "/academics",
    image: "/images/news/n5.jpg",
  },
];

const stats = [
  { number: "10000+", label: "Students" },
  { number: "40+", label: "Years" },
  { number: "200+", label: "Faculty" },
  { number: "6", label: "Institutes" },
];

const INTERVAL = 6000;

export function HeroSlider() {
  const [current, setCurrent] = useState(0);
  const [progress, setProgress] = useState(0);

  const goTo = useCallback((index: number) => {
    setCurrent(index);
    setProgress(0);
  }, []);

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
  }, [current]);

  return (
    <section className="relative h-screen w-full overflow-hidden">
      {/* Background Images with Ken Burns */}
      <AnimatePresence mode="wait">
        <motion.div
          key={current}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, scale: [1, 1.1] }}
          exit={{ opacity: 0 }}
          transition={{
            opacity: { duration: 1, ease: "easeInOut" },
            scale: { duration: INTERVAL / 1000, ease: "linear" },
          }}
        >
          <Image
            src={slides[current].image}
            alt={slides[current].title}
            fill
            className="object-cover"
            priority={current === 0}
            sizes="100vw"
          />
        </motion.div>
      </AnimatePresence>

      {/* Dark gradient overlay — stronger for white/bright building images */}
      <div className="absolute inset-0 bg-gradient-to-b from-navy-950/95 via-navy-900/70 to-navy-950/90" />

      {/* Radial vignette — heavier to ensure text contrast */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(6,14,26,0.2)_0%,rgba(6,14,26,0.55)_60%,rgba(6,14,26,0.8)_100%)]" />

      {/* Subtle dot pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* Mouse-reactive floating geometric shapes */}
      <MouseParallax strength={30} className="absolute top-[15%] right-[20%] pointer-events-none z-[5]">
        <motion.div
          className="w-48 h-48 rounded-full border-2 border-gold-400/50 opacity-50"
          animate={{ rotate: [0, 90, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
      </MouseParallax>
      <MouseParallax strength={20} invert className="absolute bottom-[30%] left-[8%] pointer-events-none z-[5]">
        <motion.div
          className="w-32 h-32 rounded-lg border-2 border-gold-400/45 opacity-45"
          animate={{ rotate: [0, -45, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
      </MouseParallax>
      <MouseParallax strength={40} className="absolute top-[40%] left-[60%] pointer-events-none z-[5]">
        <div className="w-24 h-24 rounded-full border-2 border-gold-400/50 opacity-50" />
      </MouseParallax>
      <MouseParallax strength={15} invert className="absolute top-[60%] right-[10%] pointer-events-none z-[5]">
        <div className="w-16 h-16 rounded-full bg-gold-400/30 opacity-60" />
      </MouseParallax>
      <MouseParallax strength={25} className="absolute top-[25%] left-[35%] pointer-events-none z-[5]">
        <div className="w-8 h-8 rounded-full bg-gold-400/35 opacity-65" />
      </MouseParallax>

      {/* Content */}
      <div className="relative z-10 flex h-full items-center">
        <div className="w-full px-6 md:px-16 lg:px-24">
          <div className="max-w-3xl mx-auto text-center lg:mx-0 lg:text-left">
            <AnimatePresence mode="wait">
              <motion.div
                key={current}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="space-y-6"
              >
                {/* Title Line 1 */}
                <motion.h1
                  variants={{
                    hidden: {
                      clipPath: "inset(0 100% 0 0)",
                      opacity: 0,
                    },
                    visible: {
                      clipPath: "inset(0 0% 0 0)",
                      opacity: 1,
                      transition: { duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94], delay: 0 },
                    },
                    exit: {
                      y: -30,
                      opacity: 0,
                      transition: { duration: 0.3 },
                    },
                  }}
                  className="font-heading text-5xl md:text-6xl lg:text-7xl font-bold text-white leading-[1.1]"
                >
                  {slides[current].title}
                </motion.h1>

                {/* Title Line 2 - Highlight */}
                <motion.h1
                  variants={{
                    hidden: {
                      clipPath: "inset(0 100% 0 0)",
                      opacity: 0,
                    },
                    visible: {
                      clipPath: "inset(0 0% 0 0)",
                      opacity: 1,
                      transition: { duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.2 },
                    },
                    exit: {
                      y: -30,
                      opacity: 0,
                      transition: { duration: 0.3, delay: 0.05 },
                    },
                  }}
                  className="font-heading text-5xl md:text-6xl lg:text-7xl font-bold text-gold-400 leading-[1.1]"
                >
                  {slides[current].titleHighlight}
                </motion.h1>

                {/* Subtitle */}
                <motion.p
                  variants={{
                    hidden: { opacity: 0, y: 20 },
                    visible: {
                      opacity: 1,
                      y: 0,
                      transition: { duration: 0.6, ease: "easeOut", delay: 0.4 },
                    },
                    exit: {
                      y: -20,
                      opacity: 0,
                      transition: { duration: 0.3, delay: 0.1 },
                    },
                  }}
                  className="text-lg md:text-xl text-gray-300 max-w-xl mx-auto lg:mx-0"
                >
                  {slides[current].subtitle}
                </motion.p>

                {/* CTA Button */}
                <motion.div
                  variants={{
                    hidden: { opacity: 0, y: 20 },
                    visible: {
                      opacity: 1,
                      y: 0,
                      transition: { duration: 0.6, ease: "easeOut", delay: 0.6 },
                    },
                    exit: {
                      y: -20,
                      opacity: 0,
                      transition: { duration: 0.3, delay: 0.15 },
                    },
                  }}
                  className="pt-2"
                >
                  <Link
                    href={slides[current].href}
                    className="group inline-flex items-center gap-3 rounded-full bg-gold-500 px-8 py-4 text-base font-semibold text-navy-900 shadow-lg shadow-gold-500/25 transition-all duration-300 hover:bg-gold-400 hover:scale-[1.02] hover:shadow-xl hover:shadow-gold-500/30"
                  >
                    {slides[current].cta}
                    <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
                  </Link>
                </motion.div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Vertical dot navigation - bottom right */}
      <div className="absolute right-6 md:right-10 bottom-1/2 translate-y-1/2 z-20 flex flex-col items-center gap-3">
        {slides.map((_, index) => (
          <button
            key={index}
            onClick={() => goTo(index)}
            className="group relative flex items-center justify-center"
            aria-label={`Go to slide ${index + 1}`}
          >
            <span
              className={cn(
                "block w-1 rounded-full transition-all duration-500",
                index === current
                  ? "h-8 bg-gold-500"
                  : "h-4 bg-white/30 group-hover:bg-white/50"
              )}
            />
          </button>
        ))}
      </div>

      {/* Stats bar - floating at bottom */}
      <div className="absolute bottom-8 left-0 right-0 z-20 px-4">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1 }}
          className="mx-auto max-w-4xl rounded-2xl border border-white/10 bg-white/10 p-6 backdrop-blur-md"
        >
          <div className="flex items-center justify-center divide-x divide-white/20">
            {stats.map((stat, i) => (
              <div
                key={i}
                className="flex flex-1 flex-col items-center gap-1 px-4"
              >
                <span className="text-2xl md:text-3xl font-bold text-white">
                  {stat.number}
                </span>
                <span className="text-xs uppercase tracking-wider text-gray-400">
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Progress bar at very bottom */}
      <div className="absolute bottom-0 left-0 right-0 z-20 h-0.5 bg-white/10">
        <motion.div
          className="h-full bg-gold-500"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </section>
  );
}
