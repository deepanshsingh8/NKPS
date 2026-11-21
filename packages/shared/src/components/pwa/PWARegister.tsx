"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { BUILD_ID } from "@nkps/shared/lib/build-id";

// Registers the app's service worker and surfaces an update prompt when a new
// version has been deployed. Rendered once in each app's root layout.
//
// Installed PWAs don't hard-refresh the way browser tabs do, so without an
// explicit "reload" nudge users can sit on a stale build indefinitely. When a
// new worker reaches the `waiting` state we show a toast; clicking it tells the
// waiting worker to take over (it calls skipWaiting on that message) and
// reloads once it does.
// How often the page asks the server which build it is running. On every
// return to the tab, but not more than once in five minutes; and on a timer
// for a tab that is never left.
const VERSION_CHECK_MIN_GAP_MS = 5 * 60 * 1000;
const VERSION_CHECK_INTERVAL_MS = 30 * 60 * 1000;

export function PWARegister() {
  // A page that outlives its deployment. The service worker only notices a
  // new worker, and the worker changes when the icons do, not on every
  // deploy — so an office window left open on one screen kept the old bundle
  // for days while a fresh window beside it ran the new one. Ask the server
  // which build it is on, and offer the same Reload when the answer differs.
  useEffect(() => {
    if (typeof window === "undefined" || BUILD_ID === "dev") return;
    let lastCheck = 0;
    let prompted = false;
    let cancelled = false;

    const check = async () => {
      const now = Date.now();
      if (prompted || now - lastCheck < VERSION_CHECK_MIN_GAP_MS) return;
      lastCheck = now;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { build?: string };
        if (data.build && data.build !== BUILD_ID && !prompted) {
          prompted = true;
          toast("A new version is available.", {
            duration: Infinity,
            action: { label: "Reload", onClick: () => window.location.reload() },
          });
        }
      } catch {
        // Offline or a blip; the next check will try again.
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const timer = window.setInterval(() => void check(), VERSION_CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    let reloading = false;

    function promptUpdate(worker: ServiceWorker) {
      toast("A new version is available.", {
        duration: Infinity,
        action: {
          label: "Reload",
          onClick: () => worker.postMessage({ type: "SKIP_WAITING" }),
        },
      });
    }

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((registration) => {
        // A worker already waiting when the page loads (updated in a previous
        // visit but never activated).
        if (registration.waiting && navigator.serviceWorker.controller) {
          promptUpdate(registration.waiting);
        }

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            // Only prompt on an *update* (a controller already exists), not on
            // the very first install.
            if (
              installing.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              promptUpdate(installing);
            }
          });
        });
      })
      .catch((err) => {
        console.error("[pwa] service worker registration failed", err);
      });

    // Fired once the newly-activated worker takes control — reload so the page
    // is served by the fresh worker.
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
  }, []);

  return null;
}
