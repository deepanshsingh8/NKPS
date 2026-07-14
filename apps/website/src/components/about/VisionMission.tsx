"use client";

import { motion } from "framer-motion";
import { Eye, Target } from "lucide-react";
import { SectionHeading } from "@nkps/shared/components/SectionHeading";
import { GlassCard } from "@nkps/shared/components/GlassCard";
import { FloatingDoodles } from "@nkps/shared/components/FloatingDoodles";
import { staggerContainer, fadeUp } from "@nkps/shared/lib/animations";
import { SCHOOL } from "@nkps/shared/lib/constants";

export function VisionMission() {
  return (
    <section className="section-padding bg-cream-50 relative overflow-hidden">
      <FloatingDoodles tone="dark" />
      <div className="page-container relative z-10">
        <SectionHeading
          label="What Drives Us"
          title="Our Vision & Mission"
        />

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-12 max-w-5xl mx-auto"
        >
          {/* Vision */}
          <motion.div variants={fadeUp}>
            <GlassCard className="p-8 h-full" hover>
              <div className="flex items-center gap-4 mb-5">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gold-500/10 text-gold-600">
                  <Eye className="h-7 w-7" />
                </div>
                <h3 className="font-heading text-2xl font-bold text-navy-900">
                  Our Vision
                </h3>
              </div>
              <p className="text-gray-600 leading-relaxed">{SCHOOL.vision}</p>
            </GlassCard>
          </motion.div>

          {/* Mission */}
          <motion.div variants={fadeUp}>
            <GlassCard className="p-8 h-full" hover>
              <div className="flex items-center gap-4 mb-5">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-navy-900/5 text-navy-900">
                  <Target className="h-7 w-7" />
                </div>
                <h3 className="font-heading text-2xl font-bold text-navy-900">
                  Our Mission
                </h3>
              </div>
              <p className="text-gray-600 leading-relaxed">{SCHOOL.mission}</p>
            </GlassCard>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
