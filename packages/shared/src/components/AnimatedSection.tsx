"use client";

import { motion, type Variants } from "framer-motion";
import { cn } from "@nkps/shared/lib/utils";

interface AnimatedSectionProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

// Transform-only reveal. The hidden state is what the server renders, and an
// `opacity: 0` there kept every section invisible until framer-motion had
// hydrated. Sections in the first screen (the heading under a page header on
// a phone) were then painted ~4s late and became the page's Largest
// Contentful Paint. Sliding in from a small offset keeps the entrance while
// the content is painted with the HTML; transforms don't count as layout shift.
const slideUp: Variants = {
  hidden: { y: 24 },
  visible: {
    y: 0,
    transition: { duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

export function AnimatedSection({ children, className, delay }: AnimatedSectionProps) {
  return (
    <motion.div
      variants={slideUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-100px" }}
      transition={delay ? { delay } : undefined}
      className={cn(className)}
    >
      {children}
    </motion.div>
  );
}
