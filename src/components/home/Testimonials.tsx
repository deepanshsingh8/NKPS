"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Quote, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionHeading } from "@/components/shared/SectionHeading";

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
      <div className="page-container relative z-10">
        <SectionHeading
          label="Testimonials"
          title="What Parents Say"
          subtitle="Hear from our school community"
        />

        <div className="mt-12 md:mt-16 max-w-3xl mx-auto">
          {/* Quote card */}
          <div className="relative bg-cream-50 rounded-3xl p-8 md:p-12 border border-gold-500/10">
            {/* Quote icon */}
            <div className="absolute -top-5 left-8 md:left-12 w-10 h-10 rounded-full bg-gradient-to-br from-gold-500 to-gold-400 flex items-center justify-center shadow-lg shadow-gold-500/25">
              <Quote className="w-5 h-5 text-navy-900" />
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.4, ease: "easeInOut" }}
              >
                {/* Stars */}
                <div className="flex items-center gap-1 mb-5">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-gold-500 text-gold-500" />
                  ))}
                </div>

                <p className="text-lg md:text-xl text-navy-800 leading-relaxed">
                  &ldquo;{testimonials[active].quote}&rdquo;
                </p>

                <div className="mt-6 flex items-center gap-4">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-navy-900 to-navy-700 flex items-center justify-center text-white font-semibold">
                    {testimonials[active].initials}
                  </div>
                  <div>
                    <p className="font-semibold text-navy-900">
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

          {/* Indicators */}
          <div className="flex items-center justify-center gap-3 mt-8">
            {testimonials.map((t, i) => (
              <button
                key={t.name}
                onClick={() => setActive(i)}
                className="relative focus:outline-none cursor-pointer"
                aria-label={`View testimonial from ${t.name}`}
              >
                <div
                  className={cn(
                    "w-2.5 h-2.5 rounded-full transition-all duration-300",
                    i === active
                      ? "bg-gold-500 scale-125"
                      : "bg-gray-300 hover:bg-gray-400"
                  )}
                />
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
