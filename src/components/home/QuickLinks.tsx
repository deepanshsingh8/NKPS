"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  GraduationCap,
  Users,
  Download,
  Calendar,
  ArrowRight,
} from "lucide-react";
import { staggerContainer, fadeUp } from "@/lib/animations";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { MouseParallax } from "@/components/shared/MouseParallax";

const links = [
  {
    icon: GraduationCap,
    title: "Student Portal",
    description: "Access academic records, results, and assignments online",
    href: "/portal/login",
    span: "md:col-span-2",
  },
  {
    icon: Users,
    title: "Staff Portal",
    description: "Teacher & admin login",
    href: "/portal/login",
    span: "",
  },
  {
    icon: Download,
    title: "Downloads",
    description: "Forms, circulars & more",
    href: "/transfer-certificates",
    span: "",
  },
  {
    icon: Calendar,
    title: "Academic Calendar",
    description: "View important dates, holidays, and exam schedules",
    href: "/academics",
    span: "md:col-span-2",
  },
];

export function QuickLinks() {
  return (
    <section className="bg-cream-50 section-padding relative overflow-hidden">
      {/* Mouse parallax decorative shapes */}
      <MouseParallax strength={20} className="absolute top-10 right-[10%] pointer-events-none">
        <div className="w-32 h-32 rounded-full border-2 border-gold-400/40 opacity-40" />
      </MouseParallax>
      <MouseParallax strength={15} invert className="absolute bottom-10 left-[5%] pointer-events-none">
        <div className="w-24 h-24 rounded-lg border-2 border-navy-900/25 opacity-35" />
      </MouseParallax>

      <div className="page-container relative z-10">
        <SectionHeading
          title="Quick Links"
          subtitle="Access important resources quickly"
        />

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="grid grid-cols-2 md:grid-cols-4 gap-5 mt-12"
        >
          {links.map((link) => (
            <motion.div
              key={link.title}
              variants={fadeUp}
              className={link.span}
            >
              <Link href={link.href} className="block h-full">
                <motion.div
                  whileHover={{ y: -4 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  className="group relative bg-white rounded-3xl border border-gray-100 overflow-hidden p-7 h-full cursor-pointer transition-shadow duration-300 hover:shadow-xl hover:border-gold-500/20"
                >
                  {/* Subtle gradient accent on hover */}
                  <div className="absolute inset-0 bg-gradient-to-br from-gold-500/0 to-gold-500/0 group-hover:from-gold-500/[0.02] group-hover:to-gold-500/[0.06] transition-all duration-500" />

                  <div className="relative flex items-start gap-5">
                    {/* Icon */}
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-navy-900 to-navy-700 flex items-center justify-center shrink-0 shadow-lg shadow-navy-900/20 group-hover:shadow-navy-900/30 transition-shadow duration-300">
                      <link.icon className="w-6 h-6 text-white" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-heading text-lg font-semibold text-navy-900">
                          {link.title}
                        </h3>
                        <ArrowRight className="w-4 h-4 text-gray-400 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
                      </div>
                      <p className="text-gray-500 text-sm mt-1 leading-relaxed">
                        {link.description}
                      </p>
                    </div>
                  </div>
                </motion.div>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
