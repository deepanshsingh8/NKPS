"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Persistent client-side state that mirrors a single key in the page's URL
 * search string. Lets list pages survive browser back-navigation without
 * resetting filters.
 *
 * Why `window.history.replaceState` instead of `router.replace`:
 *   The Next.js App Router treats `router.replace` as a navigation — it
 *   re-renders the route tree, re-runs server components, can scroll to
 *   the top, and fires loading states. For purely-cosmetic URL updates
 *   (filter changes that should NOT trigger a re-fetch), we want to bypass
 *   the router entirely. `history.replaceState` updates the address bar
 *   silently; the bookmarkable URL is correct, and the cross-page back
 *   button still restores the previous URL because each `useState`
 *   initializer reads `window.location.search` at mount time.
 *
 * Trade-off: filter changes within the SAME page do NOT push new history
 * entries. The browser back button thus skips past intermediate filter
 * states straight to the previous page. This is intentional — pushing
 * history per keystroke would clutter the back stack and feel broken in
 * different ways. If we ever need filter-undo, do it with a dedicated
 * Cmd-Z handler, not the browser back button.
 *
 * Caveat: `useSearchParams()` from `next/navigation` will NOT observe the
 * silent updates. Don't pair this hook with code that reads the same key
 * via `useSearchParams()` — read the returned `value` instead.
 */
export function useUrlState(
  key: string,
  defaultValue = ""
): [string, (next: string) => void] {
  const defaultRef = useRef(defaultValue);
  defaultRef.current = defaultValue;

  const [value, setValueLocal] = useState<string>(() => {
    if (typeof window === "undefined") return defaultValue;
    const params = new URLSearchParams(window.location.search);
    return params.get(key) ?? defaultValue;
  });

  // Re-sync from the URL on the back button. Next.js fires popstate too.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPop = () => {
      const params = new URLSearchParams(window.location.search);
      setValueLocal(params.get(key) ?? defaultRef.current);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [key]);

  const setValue = useCallback(
    (next: string) => {
      setValueLocal(next);
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      if (next === "" || next === defaultRef.current) {
        params.delete(key);
      } else {
        params.set(key, next);
      }
      const qs = params.toString();
      const url = qs
        ? `${window.location.pathname}?${qs}`
        : window.location.pathname;
      window.history.replaceState(window.history.state, "", url);
    },
    [key]
  );

  return [value, setValue];
}

/**
 * Like `useUrlState` but coerces to/from a number. Empty string represents
 * "no value" and writes the param-empty form (key dropped from URL).
 */
export function useUrlNumberState(
  key: string,
  defaultValue: number | null = null
): [number | null, (next: number | null) => void] {
  const [raw, setRaw] = useUrlState(
    key,
    defaultValue === null ? "" : String(defaultValue)
  );
  const value = raw === "" ? null : Number.isFinite(Number(raw)) ? Number(raw) : null;
  const set = useCallback(
    (next: number | null) => {
      setRaw(next === null ? "" : String(next));
    },
    [setRaw]
  );
  return [value, set];
}
