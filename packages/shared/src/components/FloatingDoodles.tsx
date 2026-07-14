"use client";

import { motion, useReducedMotion, useTransform } from "framer-motion";
import {
  Atom,
  BookOpen,
  Calculator,
  Compass,
  Dna,
  FlaskConical,
  Globe,
  GraduationCap,
  Lightbulb,
  Microscope,
  Music,
  NotebookPen,
  PenTool,
  Pencil,
  Rocket,
  Ruler,
  Send,
  Sigma,
  Star,
  Telescope,
  type LucideIcon,
} from "lucide-react";
import { useMouseMotion } from "@nkps/shared/hooks/useMousePosition";
import { cn } from "@nkps/shared/lib/utils";

interface Doodle {
  Icon: LucideIcon;
  /** Position as % of the container. */
  top: number;
  left: number;
  /** Icon size in px (desktop). */
  size: number;
  /** Initial rotation (deg). */
  rotate: number;
  /** Parallax depth 0..1 — larger = moves more (closer to viewer). */
  depth: number;
  /** Idle float duration (s). */
  duration: number;
  /** Hide on small screens to avoid clutter. */
  hideOnMobile?: boolean;
}

// A hand-tuned scatter that favours the edges/corners so doodles sit in the
// empty margins around centred content rather than behind text.
const DOODLES: Doodle[] = [
  { Icon: FlaskConical, top: 12, left: 5, size: 46, rotate: -12, depth: 0.9, duration: 7 },
  { Icon: GraduationCap, top: 8, left: 88, size: 52, rotate: 10, depth: 1, duration: 8 },
  { Icon: BookOpen, top: 52, left: 7, size: 48, rotate: -6, depth: 0.75, duration: 9, hideOnMobile: true },
  { Icon: Compass, top: 30, left: 93, size: 40, rotate: 18, depth: 0.6, duration: 10, hideOnMobile: true },
  { Icon: Lightbulb, top: 74, left: 12, size: 38, rotate: 8, depth: 0.85, duration: 7.5 },
  { Icon: Atom, top: 18, left: 68, size: 34, rotate: 0, depth: 0.5, duration: 11, hideOnMobile: true },
  { Icon: Pencil, top: 40, left: 40, size: 30, rotate: 45, depth: 0.4, duration: 12, hideOnMobile: true },
  { Icon: Sigma, top: 82, left: 82, size: 36, rotate: -8, depth: 0.7, duration: 8.5 },
  { Icon: Ruler, top: 88, left: 45, size: 40, rotate: 24, depth: 0.55, duration: 10.5, hideOnMobile: true },
  { Icon: Send, top: 62, left: 90, size: 38, rotate: -18, depth: 0.95, duration: 7, hideOnMobile: true },
  { Icon: Globe, top: 66, left: 55, size: 32, rotate: 6, depth: 0.35, duration: 13, hideOnMobile: true },
  { Icon: Star, top: 24, left: 22, size: 26, rotate: -20, depth: 0.65, duration: 9.5 },
  { Icon: Microscope, top: 46, left: 78, size: 42, rotate: 12, depth: 0.8, duration: 8, hideOnMobile: true },
  { Icon: Calculator, top: 92, left: 24, size: 34, rotate: -10, depth: 0.5, duration: 11.5, hideOnMobile: true },
  { Icon: Telescope, top: 6, left: 46, size: 34, rotate: 14, depth: 0.6, duration: 10, hideOnMobile: true },
  { Icon: Music, top: 34, left: 14, size: 28, rotate: 16, depth: 0.45, duration: 12.5, hideOnMobile: true },
  { Icon: Rocket, top: 70, left: 34, size: 34, rotate: -24, depth: 0.7, duration: 9, hideOnMobile: true },
  { Icon: PenTool, top: 14, left: 34, size: 28, rotate: 30, depth: 0.4, duration: 13.5, hideOnMobile: true },
  { Icon: Dna, top: 56, left: 24, size: 30, rotate: -14, depth: 0.55, duration: 11, hideOnMobile: true },
  { Icon: NotebookPen, top: 80, left: 66, size: 34, rotate: 8, depth: 0.85, duration: 8.5, hideOnMobile: true },
];

interface FloatingDoodlesProps {
  /**
   * "light" tints for dark backgrounds (lighter blue), "dark" tints for light
   * backgrounds (deeper blue). Default "dark".
   */
  tone?: "light" | "dark";
  /** Number of doodles to render (from the curated list). Default 12. */
  count?: number;
  /** Base opacity of the layer (0..1). Default 1 (icons carry their own low alpha). */
  className?: string;
}

function ParallaxDoodle({
  doodle,
  tone,
  reduced,
}: {
  doodle: Doodle;
  tone: "light" | "dark";
  reduced: boolean;
}) {
  const { x: mouseX, y: mouseY } = useMouseMotion();
  // Closer (higher depth) doodles travel further with the cursor.
  const shift = doodle.depth * 26;
  const x = useTransform(mouseX, (v) => (reduced ? 0 : -v * shift));
  const y = useTransform(mouseY, (v) => (reduced ? 0 : -v * shift));

  const colorClass =
    tone === "light" ? "text-blue-300/25" : "text-blue-600/[0.13]";

  return (
    <motion.div
      className={cn(
        "absolute will-change-transform",
        doodle.hideOnMobile && "hidden md:block"
      )}
      style={{ top: `${doodle.top}%`, left: `${doodle.left}%`, x, y }}
    >
      <motion.div
        initial={false}
        animate={
          reduced
            ? undefined
            : { y: [0, -12, 0], rotate: [doodle.rotate, doodle.rotate + 6, doodle.rotate] }
        }
        transition={
          reduced
            ? undefined
            : { duration: doodle.duration, repeat: Infinity, ease: "easeInOut" }
        }
        style={{ rotate: doodle.rotate }}
      >
        <doodle.Icon
          className={colorClass}
          style={{ width: doodle.size, height: doodle.size }}
          strokeWidth={1.25}
        />
      </motion.div>
    </motion.div>
  );
}

/**
 * A decorative, non-interactive layer of school/study line-art icons scattered
 * across empty background space. Each icon drifts with the cursor at a slightly
 * different rate (depth parallax) and gently floats on its own.
 *
 * Drop it as the first child of a `relative overflow-hidden` section and keep the
 * real content above it (e.g. wrap content in `relative z-10`).
 */
export function FloatingDoodles({
  tone = "dark",
  count = 12,
  className,
}: FloatingDoodlesProps) {
  const reduced = useReducedMotion() ?? false;
  const doodles = DOODLES.slice(0, Math.min(count, DOODLES.length));

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 z-0 overflow-hidden",
        className
      )}
    >
      {doodles.map((doodle, i) => (
        <ParallaxDoodle key={i} doodle={doodle} tone={tone} reduced={reduced} />
      ))}
    </div>
  );
}
