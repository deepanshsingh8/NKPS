"use client";

// Cloudflare Turnstile widget (bot check) for public forms and logins.
//
// Usage:
//   const captcha = useTurnstile();
//   ...
//   fetch(url, { headers: { ...captcha.headers } })      // our API routes
//   supabase.auth.signInWithPassword({ ..., options: { captchaToken: captcha.token ?? undefined } })
//   ...finally { captcha.reset(); }                       // tokens are single-use
//   ...
//   <Turnstile {...captcha.widgetProps} />
//   <Button disabled={loading || !captcha.ready}>
//
// With NEXT_PUBLIC_TURNSTILE_SITE_KEY unset this renders nothing, `ready` is
// always true and `headers` is empty, so a form behaves exactly as it did
// before Turnstile existed.
//
// CSP: needs https://challenges.cloudflare.com in script-src and frame-src.

import Script from "next/script";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@nkps/shared/components/providers/ThemeProvider";
import {
  TURNSTILE_ENABLED,
  TURNSTILE_HEADER,
  TURNSTILE_SITE_KEY,
} from "@nkps/shared/lib/turnstile";
import { cn } from "@nkps/shared/lib/utils";

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
// "flexible" fills the container but will not shrink below this; under it the
// widget would overflow a phone-width card, so drop to "compact" (150px wide).
const FLEXIBLE_MIN_WIDTH = 300;

interface TurnstileRenderOptions {
  sitekey: string;
  action?: string;
  theme?: "light" | "dark" | "auto";
  size?: "normal" | "flexible" | "compact";
  callback?: (token: string) => void;
  "error-callback"?: (code: string) => void;
  "expired-callback"?: () => void;
  "timeout-callback"?: () => void;
}

interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileRenderOptions): string | undefined;
  reset(widgetId?: string): void;
  remove(widgetId?: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export interface TurnstileProps {
  /** Receives a fresh token, or null when it expires / errors / resets. */
  onToken: (token: string | null) => void;
  /** Bump to reset the widget (useTurnstile().reset does this). */
  resetSignal?: number;
  /** Analytics label shown in the Cloudflare dashboard, e.g. "contact". */
  action?: string;
  /** Force a theme for a surface that is dark or light regardless of the app
   *  theme (the lock screen is always navy). Defaults to the app theme. */
  theme?: "light" | "dark";
  className?: string;
}

export function Turnstile({
  onToken,
  resetSignal = 0,
  action,
  theme,
  className,
}: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const lastResetRef = useRef(resetSignal);
  const [scriptReady, setScriptReady] = useState(
    () => typeof window !== "undefined" && Boolean(window.turnstile)
  );
  // Apps without the ThemeProvider (the public website, which has no dark
  // mode) get the context default, "light".
  const { resolvedTheme } = useTheme();
  const widgetTheme = theme ?? resolvedTheme;

  useEffect(() => {
    onTokenRef.current = onToken;
  });

  useEffect(() => {
    const container = containerRef.current;
    const api = window.turnstile;
    if (!TURNSTILE_ENABLED || !scriptReady || !container || !api) return;

    const id = api.render(container, {
      sitekey: TURNSTILE_SITE_KEY,
      action,
      theme: widgetTheme,
      size: container.clientWidth >= FLEXIBLE_MIN_WIDTH ? "flexible" : "compact",
      callback: (token) => onTokenRef.current(token),
      "error-callback": () => onTokenRef.current(null),
      "expired-callback": () => onTokenRef.current(null),
      "timeout-callback": () => onTokenRef.current(null),
    });
    widgetIdRef.current = id ?? null;

    return () => {
      if (id) api.remove(id);
      widgetIdRef.current = null;
      onTokenRef.current(null);
    };
  }, [scriptReady, widgetTheme, action]);

  useEffect(() => {
    if (lastResetRef.current === resetSignal) return;
    lastResetRef.current = resetSignal;
    if (widgetIdRef.current) window.turnstile?.reset(widgetIdRef.current);
  }, [resetSignal]);

  if (!TURNSTILE_ENABLED) return null;

  return (
    <>
      <Script
        id="cf-turnstile-api"
        src={SCRIPT_SRC}
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
      />
      <div ref={containerRef} className={cn("min-h-[65px] w-full", className)} />
    </>
  );
}

export interface TurnstileState {
  /** Whether a widget is configured at all. */
  enabled: boolean;
  /** Current token, or null. */
  token: string | null;
  /** True when the form may submit: no widget configured, or a token in hand. */
  ready: boolean;
  /** Spread into fetch headers for our own API routes. Empty when disabled. */
  headers: Record<string, string>;
  /** Clear the token and get a fresh one. Call after every submit attempt. */
  reset: () => void;
  /** Spread onto <Turnstile />. */
  widgetProps: Pick<TurnstileProps, "onToken" | "resetSignal">;
}

export function useTurnstile(): TurnstileState {
  const [token, setToken] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);

  const reset = useCallback(() => {
    setToken(null);
    setResetSignal((n) => n + 1);
  }, []);

  return useMemo(
    (): TurnstileState => ({
      enabled: TURNSTILE_ENABLED,
      token,
      ready: !TURNSTILE_ENABLED || token !== null,
      headers: token ? { [TURNSTILE_HEADER]: token } : ({} as Record<string, string>),
      reset,
      widgetProps: { onToken: setToken, resetSignal },
    }),
    [token, reset, resetSignal]
  );
}
