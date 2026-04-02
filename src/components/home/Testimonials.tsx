"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { MouseParallax } from "@/components/shared/MouseParallax";

const testimonials = [
  {
    quote:
      "NK Public School has provided my child with an excellent foundation in academics and extracurricular activities. The teachers are dedicated and the facilities are top-notch.",
    name: "Mrs. Sharma",
    role: "Parent of Class VIII student",
    initials: "S",
  },
  {
    quote:
      "The school's focus on discipline and holistic development has truly shaped my son's character. We are grateful for the nurturing environment.",
    name: "Mr. Patel",
    role: "Parent of Class X student",
    initials: "P",
  },
  {
    quote:
      "From sports to arts, the school ensures every child discovers their talent. The COVID-19 response was also commendable — classes never stopped.",
    name: "Mrs. Gupta",
    role: "Parent of Class V student",
    initials: "G",
  },
];

export function Testimonials() {
  const [active, setActive] = useState(0);

  const next = useCallback(() => {
    setActive((prev) => (prev + 1) % testimonials.length);
  }, []);

  useEffect(() => {
    const timer = setInterval(next, 5000);
    return () => clearInterval(timer);
  }, [next]);

  return (
    <section className="bg-white section-padding relative overflow-hidden">
      {/* Mouse parallax decorative shapes */}
      <MouseParallax strength={20} className="absolute top-16 right-[15%] pointer-events-none">
        <div className="w-36 h-36 rounded-full border-2 border-gold-400/15 opacity-20" />
      </MouseParallax>
      <MouseParallax strength={12} invert className="absolute bottom-20 left-[10%] pointer-events-none">
        <div className="w-16 h-16 rounded-lg border-2 border-navy-900/8 opacity-15" />
      </MouseParallax>

      <div className="page-container relative z-10">
        <SectionHeading
          title="What Parents Say"
          subtitle="Hear from our school community"
        />

        <div className="mt-12 md:mt-16 max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-8 md:gap-12 items-center min-h-[280px]">
            {/* Left: Decorative quote mark */}
            <div className="hidden md:flex items-center justify-center">
              <span className="text-[12rem] leading-none text-gold-500/10 font-serif select-none">
                &ldquo;
              </span>
            </div>

            {/* Right: Quote content */}
            <div className="relative">
              <AnimatePresence mode="wait">
                <motion.div
                  key={active}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.5, ease: "easeInOut" }}
                >
                  {/* Mobile quote mark */}
                  <span className="md:hidden text-7xl leading-none text-gold-500/15 font-serif select-none block -mb-6">
                    &ldquo;
                  </span>

                  <p className="text-xl md:text-2xl italic text-navy-800 font-medium leading-relaxed">
                    {testimonials[active].quote}
                  </p>

                  <div className="mt-8 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-navy-900 to-navy-700 flex items-center justify-center text-white font-semibold text-lg">
                      {testimonials[active].initials}
                    </div>
                    <div>
                      <p className="font-semibold text-navy-900 text-lg">
                        {testimonials[active].name}
                      </p>
                      <p className="text-gray-500 text-sm">
                        {testimonials[active].role}
                      </p>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Indicators */}
          <div className="flex items-center justify-center gap-4 mt-12">
            {testimonials.map((t, i) => (
              <button
                key={t.name}
                onClick={() => setActive(i)}
                className="relative focus:outline-none"
                aria-label={`View testimonial from ${t.name}`}
              >
                <motion.div
                  animate={{
                    scale: i === active ? 1.1 : 1,
                  }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className={cn(
                    "w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 cursor-pointer",
                    i === active
                      ? "bg-gradient-to-br from-navy-900 to-navy-700 text-white ring-2 ring-gold-500 ring-offset-2"
                      : "bg-gray-100 text-navy-700 hover:bg-gray-200"
                  )}
                >
                  {t.initials}
                </motion.div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
