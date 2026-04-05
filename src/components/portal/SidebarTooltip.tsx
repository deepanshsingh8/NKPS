"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";

interface SidebarTooltipProps {
  label: string;
  children: React.ReactNode;
}

/**
 * A tooltip that renders via a portal so it escapes overflow:hidden/auto
 * ancestors (like scrollable nav containers). Uses fixed positioning
 * calculated from the trigger element's bounding rect.
 */
export function SidebarTooltip({ label, children }: SidebarTooltipProps) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const showTooltip = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({
        top: rect.top + rect.height / 2,
        left: rect.right + 12,
      });
    }
    setVisible(true);
  }, []);

  const hideTooltip = useCallback(() => {
    setVisible(false);
  }, []);

  return (
    <div
      ref={triggerRef}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
    >
      {children}
      {mounted && visible &&
        createPortal(
          <div
            className="fixed z-[9999] px-3 py-1.5 bg-navy-800 text-white text-xs font-medium rounded-lg shadow-xl border border-white/10 whitespace-nowrap pointer-events-none animate-in fade-in duration-100"
            style={{
              top: coords.top,
              left: coords.left,
              transform: "translateY(-50%)",
            }}
          >
            {label}
            <div className="absolute top-1/2 -translate-y-1/2 -left-1 w-2 h-2 bg-navy-800 border-l border-b border-white/10 rotate-45" />
          </div>,
          document.body
        )}
    </div>
  );
}
