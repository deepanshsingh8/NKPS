"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Download, Share, X } from "lucide-react";
import { Button } from "@nkps/shared/components/ui/button";

// Minimal captured shape of the non-standard beforeinstallprompt event.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "pwa-install-dismissed";

// Auth screens: a user who isn't logged in yet has no reason to install.
const HIDDEN_PATH_PARTS = [
  "login",
  "register",
  "forgot-password",
  "reset-password",
  "change-password",
];

interface InstallPromptProps {
  appName: string;
}

// A dismissible bottom banner that invites the user to install the PWA.
//
// - Android / Chromium: uses the captured `beforeinstallprompt` event to show a
//   real one-tap Install button.
// - iOS / Safari: there is no `beforeinstallprompt` (Apple doesn't support it),
//   so we show the manual Share -> "Add to Home Screen" instruction instead.
// - Renders nothing when already installed (standalone), on auth routes, or
//   after the user dismisses it (remembered in localStorage).
export function InstallPrompt({ appName }: InstallPromptProps) {
  const pathname = usePathname();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [isIOS, setIsIOS] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari exposes this instead of display-mode: standalone.
      (window.navigator as unknown as { standalone?: boolean }).standalone ===
        true;
    if (standalone) return;

    if (localStorage.getItem(DISMISS_KEY) === "1") return;

    const ios =
      /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase()) &&
      !(window as unknown as { MSStream?: unknown }).MSStream;
    setIsIOS(ios);

    // iOS can't fire beforeinstallprompt, so show its instruction immediately.
    if (ios) {
      setVisible(true);
      return;
    }

    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // Once installed, hide and don't nag again.
    function onInstalled() {
      setVisible(false);
      localStorage.setItem(DISMISS_KEY, "1");
    }
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    setVisible(false);
    if (typeof window !== "undefined") {
      localStorage.setItem(DISMISS_KEY, "1");
    }
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setVisible(false);
  }

  const onAuthRoute = HIDDEN_PATH_PARTS.some((part) =>
    (pathname ?? "").includes(part),
  );
  if (!visible || onAuthRoute) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-4">
      <div className="flex w-full max-w-md items-start gap-3 rounded-xl border border-navy-900/10 bg-white p-4 shadow-lg dark:border-white/10 dark:bg-navy-900">
        <div className="mt-0.5 rounded-lg bg-navy-900 p-2 text-white">
          <Download className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-navy-900 dark:text-white">
            Install {appName}
          </p>
          {isIOS ? (
            <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-navy-900/70 dark:text-gray-300">
              Tap the Share
              <Share className="inline h-3.5 w-3.5" />
              button, then &ldquo;Add to Home Screen&rdquo;.
            </p>
          ) : (
            <p className="mt-1 text-xs text-navy-900/70 dark:text-gray-300">
              Add it to your home screen for quick, app-like access.
            </p>
          )}
          {!isIOS && (
            <Button size="sm" className="mt-3" onClick={install}>
              Install
            </Button>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="rounded-md p-1 text-navy-900/50 hover:bg-navy-900/5 dark:text-gray-400 dark:hover:bg-white/10"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
