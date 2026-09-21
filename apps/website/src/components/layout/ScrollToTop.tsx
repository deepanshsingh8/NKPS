"use client";

import { useState, useEffect } from "react";
import { ArrowUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => setVisible(window.scrollY > 400);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.5 }}
          transition={{ duration: 0.2 }}
          onClick={scrollToTop}
          // Stacked ABOVE the NKPS Agent launcher, not on top of it. At
          // bottom-8/right-8 this 44px button landed entirely inside the
          // 56px launcher's footprint (which paints later, so it won it) —
          // invisible and unclickable on every screen wider than a phone.
          // The offset below clears the launcher: 1rem inset + 3.5rem button
          // + a 0.75rem gap, with the same safe-area allowance the launcher
          // uses. z-40 keeps it behind the agent's chat panel, which covers
          // this spot when it is open.
          className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] right-[calc(1.375rem+env(safe-area-inset-right,0px))] sm:bottom-[calc(5.75rem+env(safe-area-inset-bottom,0px))] sm:right-[calc(1.875rem+env(safe-area-inset-right,0px))] z-40 rounded-full bg-navy-900 p-3 text-white shadow-lg ring-1 ring-white/15 transition-colors hover:bg-navy-800"
          aria-label="Scroll to top"
        >
          <ArrowUp className="h-5 w-5" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
