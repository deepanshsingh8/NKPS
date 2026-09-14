"use client";

import { cn } from "@nkps/shared/lib/utils";

// One ratio against a limit — attendance this month, fees settled against fees
// due. Deliberately a linear meter and not a ring or a donut: a donut showing
// one value is a two-slice pie, and the eye reads arc length far worse than it
// reads a bar. The ring looks more "app-like" and tells you less.
//
// The unfilled track is a lighter step of the fill's own ramp rather than grey,
// so the whole bar reads as one measure at two intensities instead of a
// coloured thing sitting on an unrelated grey thing.

export type MeterTone = "accent" | "good" | "warning" | "danger";

const TONES: Record<MeterTone, { fill: string; track: string; text: string }> = {
  accent: {
    fill: "bg-blue-600 dark:bg-blue-500",
    track: "bg-blue-600/15 dark:bg-blue-500/20",
    text: "text-blue-700 dark:text-blue-400",
  },
  good: {
    fill: "bg-emerald-600 dark:bg-emerald-500",
    track: "bg-emerald-600/15 dark:bg-emerald-500/20",
    text: "text-emerald-700 dark:text-emerald-400",
  },
  warning: {
    fill: "bg-amber-500 dark:bg-amber-400",
    track: "bg-amber-500/20 dark:bg-amber-400/20",
    text: "text-amber-700 dark:text-amber-400",
  },
  danger: {
    fill: "bg-rose-600 dark:bg-rose-500",
    track: "bg-rose-600/15 dark:bg-rose-500/20",
    text: "text-rose-700 dark:text-rose-400",
  },
};

/**
 * Severity from a percentage, for the common "higher is better" measure
 * (attendance, collection). Passed explicitly by callers where that is not
 * true, so the meaning of the colour is never guessed from the number alone.
 */
export function toneForPercent(percent: number): MeterTone {
  if (percent >= 90) return "good";
  if (percent >= 75) return "accent";
  if (percent >= 50) return "warning";
  return "danger";
}

export function Meter({
  percent,
  tone = "accent",
  className,
  ariaLabel,
}: {
  percent: number;
  tone?: MeterTone;
  className?: string;
  ariaLabel?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  const t = TONES[tone];

  return (
    <div
      role="meter"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
      className={cn("h-1.5 w-full overflow-hidden rounded-full", t.track, className)}
    >
      <div
        // rounded-full on the fill gives the 4px rounded data-end the mark spec
        // asks for; at 0% it collapses to nothing rather than leaving a dot.
        className={cn("h-full rounded-full transition-[width] duration-700", t.fill)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function meterTextClass(tone: MeterTone): string {
  return TONES[tone].text;
}
