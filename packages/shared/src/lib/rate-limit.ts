// Rate limiter for public and privileged endpoints.
//
// Durable path: `rate_limit_hit()` (migration 132) on the service-role client.
// One upsert per hit, shared by every serverless instance, so the limit is the
// limit — not `max x warm instances`, reset on every deploy, which is what a
// per-process Map amounts to on Vercel.
//
// Fallback: if the RPC errors or is slow (no service-role env in local dev, a
// database blip, migration 132 not yet applied), use the in-memory Map below
// and log it. Failing OPEN to a weaker limiter is deliberate: failing closed
// would turn a database outage into nobody being able to log in or reset a
// password. The WhatsApp ingress, where the trade-off goes the other way
// because every message costs money, keeps its own fail-closed limiter
// (apps/erp/src/lib/ai/rate-limit-db.ts).
//
// The in-memory Map's memory grows with unique keys but is bounded: keys are
// evicted lazily on access and proactively when a sweep finds the cache over
// MAX_ENTRIES.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { createAdminClient } from "./supabase/admin";

type Bucket = { hits: number; resetAt: number };

const MAX_ENTRIES = 10_000;
const buckets = new Map<string, Bucket>();
let lastSweepAt = 0;

function sweepIfNeeded(now: number) {
  // Sweep at most once a minute; cheap.
  if (now - lastSweepAt < 60_000 && buckets.size < MAX_ENTRIES) return;
  lastSweepAt = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  // Hard cap: if still over, drop the oldest entries (Map iterates in
  // insertion order so the head is the oldest).
  if (buckets.size > MAX_ENTRIES) {
    const overflow = buckets.size - MAX_ENTRIES;
    let i = 0;
    for (const key of buckets.keys()) {
      if (i++ >= overflow) break;
      buckets.delete(key);
    }
  }
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetSeconds: number;
}

export interface RateLimitOptions {
  /** Logical name of the limit, e.g. "forgot-password". */
  name: string;
  /** Stable identifier for the caller (IP, email, parent_id, etc.). */
  key: string;
  /** Max hits in the window. */
  max: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

function memoryRateLimit({
  name,
  key,
  max,
  windowSeconds,
}: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  sweepIfNeeded(now);

  const bucketKey = `${name}:${key}`;
  const existing = buckets.get(bucketKey);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowSeconds * 1000;
    buckets.set(bucketKey, { hits: 1, resetAt });
    return { ok: true, remaining: max - 1, resetSeconds: windowSeconds };
  }

  existing.hits += 1;
  const resetSeconds = Math.max(0, Math.ceil((existing.resetAt - now) / 1000));
  if (existing.hits > max) {
    return { ok: false, remaining: 0, resetSeconds };
  }
  return { ok: true, remaining: Math.max(0, max - existing.hits), resetSeconds };
}

// A slow limiter must not become a slow login. Past this, use the fallback.
const RPC_TIMEOUT_MS = 1500;
// Log the fallback at most once a minute per instance, not once per request.
const LOG_INTERVAL_MS = 60_000;
// rate_limit_hit() rejects buckets over 512 chars. Keys are IPs, emails and
// uuids, so this only trims something pathological.
const MAX_BUCKET_LENGTH = 512;

let adminClient: SupabaseClient | null = null;
let lastFallbackLogAt = 0;

function limiterClient(): SupabaseClient | null {
  if (adminClient) return adminClient;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  adminClient = createAdminClient();
  return adminClient;
}

function logFallback(reason: string) {
  const now = Date.now();
  if (now - lastFallbackLogAt < LOG_INTERVAL_MS) return;
  lastFallbackLogAt = now;
  console.error(`[rate-limit] durable limiter unavailable, using in-memory fallback: ${reason}`);
}

interface RateLimitRow {
  allowed: boolean;
  hits: number;
  reset_seconds: number;
}

export async function rateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  const client = limiterClient();
  if (!client) {
    logFallback("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
    return memoryRateLimit(options);
  }

  const { name, key, max, windowSeconds } = options;
  try {
    const { data, error } = await client
      .rpc("rate_limit_hit", {
        p_bucket: `${name}:${key}`.slice(0, MAX_BUCKET_LENGTH),
        p_window_seconds: windowSeconds,
        p_max: max,
      })
      .abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));

    // RETURNS TABLE comes back as an array of one row.
    const row = (Array.isArray(data) ? data[0] : data) as RateLimitRow | null | undefined;
    if (error || !row) {
      logFallback(error?.message ?? "rate_limit_hit returned no row");
      return memoryRateLimit(options);
    }

    return {
      ok: row.allowed === true,
      remaining: Math.max(0, max - row.hits),
      resetSeconds: row.reset_seconds,
    };
  } catch (err) {
    logFallback(err instanceof Error ? err.message : String(err));
    return memoryRateLimit(options);
  }
}

/**
 * Best-effort client IP, falling back to a constant string so callers never
 * have to handle nullable.
 *
 * SECURITY: a rate limit keyed on IP is only as good as the header it reads.
 * `x-forwarded-for` is client-spoofable when nothing in front of the app
 * overwrites it — an attacker rotates the value and gets a fresh bucket per
 * request. Resolution order:
 *
 *  1. `TRUSTED_IP_HEADER`, when set, is the sole source of truth (e.g.
 *     "cf-connecting-ip" if Cloudflare is ever switched from DNS-only to
 *     proxied in front of Vercel — every header below would then carry a
 *     Cloudflare edge address).
 *  2. On Vercel (`process.env.VERCEL` is set in every Vercel build and
 *     function): `x-vercel-forwarded-for`, then `x-real-ip`, then
 *     `x-forwarded-for`. Vercel's edge overwrites all three with the address
 *     that connected to it and does not forward client-supplied values
 *     (vercel.com/docs/headers/request-headers); `x-vercel-forwarded-for` is
 *     the one a proxy in front of Vercel cannot overwrite.
 *  3. Elsewhere (local dev, self-hosting): the first `x-forwarded-for` hop,
 *     then `x-real-ip` — trustworthy only behind a proxy that sets them.
 */
export function clientIp(request: Request | NextRequest): string {
  const first = (name: string): string | null => {
    const value = request.headers.get(name);
    if (!value) return null;
    const ip = value.split(",")[0]!.trim();
    return ip || null;
  };

  const trustedHeader = process.env.TRUSTED_IP_HEADER;
  if (trustedHeader) {
    const trusted = first(trustedHeader);
    if (trusted) return trusted;
  }

  if (process.env.VERCEL) {
    return (
      first("x-vercel-forwarded-for") ??
      first("x-real-ip") ??
      first("x-forwarded-for") ??
      "unknown"
    );
  }

  return first("x-forwarded-for") ?? first("x-real-ip") ?? "unknown";
}
