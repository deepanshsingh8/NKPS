"use client";

import { motion } from "framer-motion";
import { Award, BookOpen, Monitor, Trophy, Medal } from "lucide-react";
import { SectionHeading } from "@nkps/shared/components/SectionHeading";
import { GlassCard } from "@nkps/shared/components/GlassCard";
import { staggerContainer, fadeUp } from "@nkps/shared/lib/animations";
import type { SectionCard } from "@nkps/shared/types";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Award,
  BookOpen,
  Monitor,
  Trophy,
  Medal,
};

interface WhyChooseUsProps {
  cards?: SectionCard[];
}

export function WhyChooseUs({ cards }: WhyChooseUsProps = {}) {
  // Single source of truth: section_cards. Defaults are seeded as is_default
  // rows (migration 055).
  const allFeatures = (cards ?? []).map((c) => ({
    id: c.id,
    icon: iconMap[c.icon || ""] || Award,
    title: c.title || "",
    desc: c.description || "",
  }));

  if (allFeatures.length === 0) return null;

  // Fit all cards on a single row at lg by matching the column count to the
  // number of cards (capped at 5 so they don't get too narrow). Static class
  // strings so Tailwind keeps them through purge.
  const lgColsClass =
    {
      1: "lg:grid-cols-1",
      2: "lg:grid-cols-2",
      3: "lg:grid-cols-3",
      4: "lg:grid-cols-4",
      5: "lg:grid-cols-5",
    }[Math.min(allFeatures.length, 5)] ?? "lg:grid-cols-4";

  return (
    <section className="section-padding bg-cream-50">
      <div className="page-container">
        <SectionHeading
          title="Why Choose Us?"
          subtitle="What sets NK Public School apart from the rest"
        />

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className={`grid grid-cols-1 md:grid-cols-2 ${lgColsClass} gap-6 mt-12`}
        >
          {allFeatures.map((feature) => (
            <motion.div key={feature.id} variants={fadeUp} className="h-full">
              <GlassCard className="p-8 text-center h-full" hover>
                <div className="bg-blue-600/10 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto">
                  <feature.icon className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="font-heading text-lg font-semibold text-navy-900 mt-4">
                  {feature.title}
                </h3>
                <p className="text-gray-600 text-sm mt-2">{feature.desc}</p>
              </GlassCard>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
