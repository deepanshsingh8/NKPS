"use client";

import { cn } from "@/lib/utils";

interface MarqueeStripProps {
  items: string[];
  className?: string;
  reverse?: boolean;
}

export function MarqueeStrip({
  items,
  className,
  reverse = false,
}: MarqueeStripProps) {
  const content = items.map((item) => item).join(" \u2022 ") + " \u2022 ";

  return (
    <div className={cn("overflow-hidden whitespace-nowrap", className)}>
      <div
        className={cn(
          "inline-flex animate-marquee",
          reverse && "[animation-direction:reverse]"
        )}
      >
        <span className="inline-block text-sm font-medium uppercase tracking-[0.2em] px-4">
          {content}
        </span>
        <span className="inline-block text-sm font-medium uppercase tracking-[0.2em] px-4">
          {content}
        </span>
      </div>
    </div>
  );
}
