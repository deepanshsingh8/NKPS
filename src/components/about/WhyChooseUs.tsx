"use client";

import { motion } from "framer-motion";
import { Award, BookOpen, Monitor, Trophy } from "lucide-react";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { GlassCard } from "@/components/shared/GlassCard";
import { staggerContainer, fadeUp } from "@/shared/lib/animations";
import type { SectionCard } from "@/shared/types";

const features = [
  {
    icon: Award,
    title: "Experienced Faculty",
    desc: "Our faculty brings years of experience in delivering quality education across all subjects.",
  },
  {
    icon: BookOpen,
    title: "Holistic Curriculum",
    desc: "Balanced approach combining academics with sports, arts, and character development.",
  },
  {
    icon: Monitor,
    title: "Smart Classrooms",
    desc: "Equipped with modern teaching technologies for interactive and engaging learning.",
  },
  {
    icon: Trophy,
    title: "100% Board Results",
    desc: "We are proud of our consistent academic performance in CBSE board examinations.",
  },
];

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Award,
  BookOpen,
  Monitor,
  Trophy,
};

interface WhyChooseUsProps {
  cards?: SectionCard[];
}

export function WhyChooseUs({ cards }: WhyChooseUsProps = {}) {
  // Default features + DB cards appended
  const baseFeatures = features.map((f) => ({
    icon: f.icon,
    title: f.title,
    desc: f.desc,
  }));
  const dbFeatures = (cards ?? []).map((c) => ({
    icon: iconMap[c.icon || ""] || Award,
    title: c.title || "",
    desc: c.description || "",
  }));
  const allFeatures = [...baseFeatures, ...dbFeatures];
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
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mt-12"
        >
          {allFeatures.map((feature) => (
            <motion.div key={feature.title} variants={fadeUp}>
              <GlassCard className="p-8 text-center" hover>
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
