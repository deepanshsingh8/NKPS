"use client";

import { motion } from "framer-motion";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
}

export function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <section className="relative w-full bg-navy-900 bg-gradient-to-br from-navy-900 via-navy-800 to-navy-900 py-28 pt-36">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="mx-auto max-w-4xl px-6 text-center"
      >
        <h1 className="font-heading text-4xl font-bold text-white md:text-5xl">
          {title}
        </h1>
        <div className="mx-auto mt-4 h-1 w-16 rounded bg-gold-500" />
        {subtitle && (
          <p className="mt-4 text-lg text-gray-300">{subtitle}</p>
        )}
      </motion.div>
    </section>
  );
}
