-- Migration 132 — a rate limiter the database owns, for every public endpoint.
--
-- The shared rateLimit() helper (packages/shared/src/lib/rate-limit.ts) kept
-- its counters in a Map inside the serverless instance. On Vercel every warm
-- instance has its own Map and a cold start has an empty one, so the effective
-- limit on the contact form, TC lookup, registration and forgot-password was
-- `max x instances`, reset on every deploy. This gives rateLimit() a counter
-- that every instance shares. The in-memory Map stays as the fallback when this
-- RPC fails, so a database blip cannot lock everyone out of login.
--
-- ── Why a new `rate_limits` table, not ai_rate_limits ──────────────────────
-- ai_rate_limits (migration 113) records only window_start. A sweep of it has
-- to guess the longest window anyone ever used; here each row carries its own
-- expires_at, so the cleanup is exact whatever window a caller picks. It also
-- keeps the high-churn, IP-keyed public buckets (one row per visitor per
-- window) out of the table that bounds the WhatsApp bill, whose semantics —
-- bump_rate_limit, fail CLOSED — are left exactly as they are.
--
-- ── Window shape ────────────────────────────────────────────────────────────
-- Fixed windows aligned to the epoch (same as bump_rate_limit): one upsert, no
-- read-modify-write race. The known cost is up to 2x max across a window
-- boundary, which is fine for abuse throttling.
--
-- ── Cleanup ─────────────────────────────────────────────────────────────────
-- Opportunistic: about 1 call in 100 deletes rows that expired over an hour
-- ago, using the expires_at index. No pg_cron needed. If traffic is ever so
-- low that rows pile up between sweeps, they are a few bytes each; if it is so
-- high that the sweep matters, schedule instead:
--   SELECT cron.schedule('rate-limits-sweep', '17 * * * *',
--     $$DELETE FROM public.rate_limits WHERE expires_at < now() - interval '1 hour'$$);
--
-- ── Who may call it ─────────────────────────────────────────────────────────
-- service_role only. SECURITY INVOKER (service_role bypasses RLS), so the
-- function grants nothing its caller does not already have, and EXECUTE is
-- revoked from PUBLIC/anon/authenticated — otherwise anyone with the anon key
-- could burn another visitor's bucket by name.
--
-- Also pins search_path on bump_rate_limit (Supabase lint 0011,
-- function_search_path_mutable): a SECURITY DEFINER function resolving
-- unqualified names through the caller's search_path can be pointed at a
-- look-alike table.
--
-- SAFE TO RE-RUN.

BEGIN;

-- ─── 1. Table ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.rate_limits (
  bucket       text        NOT NULL,
  window_start timestamptz NOT NULL,
  expires_at   timestamptz NOT NULL,
  count        integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);

CREATE INDEX IF NOT EXISTS rate_limits_expires_at_idx
  ON public.rate_limits (expires_at);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limits FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_limits TO service_role;

COMMENT ON TABLE public.rate_limits IS
  'RLS enabled with NO policies, intentionally: service-role only. Written by '
  'rate_limit_hit() from the shared rateLimit() helper (migration 132).';

-- ─── 2. rate_limit_hit() ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rate_limit_hit(
  p_bucket text,
  p_window_seconds integer,
  p_max integer
) RETURNS TABLE (allowed boolean, hits integer, reset_seconds integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_window  timestamptz;
  v_expires timestamptz;
  v_count   integer;
BEGIN
  IF p_bucket IS NULL OR length(p_bucket) = 0 OR length(p_bucket) > 512 THEN
    RAISE EXCEPTION 'rate_limit_hit: bucket must be 1..512 chars';
  END IF;
  IF p_window_seconds IS NULL OR p_window_seconds <= 0 OR p_max IS NULL OR p_max < 0 THEN
    RAISE EXCEPTION 'rate_limit_hit: window must be > 0 and max >= 0';
  END IF;

  v_window  := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);
  v_expires := v_window + make_interval(secs => p_window_seconds);

  INSERT INTO public.rate_limits AS r (bucket, window_start, expires_at, count)
  VALUES (p_bucket, v_window, v_expires, 1)
  ON CONFLICT (bucket, window_start)
  DO UPDATE SET count = r.count + 1
  RETURNING r.count INTO v_count;

  IF random() < 0.01 THEN
    DELETE FROM public.rate_limits WHERE expires_at < now() - interval '1 hour';
  END IF;

  allowed       := v_count <= p_max;
  hits          := v_count;
  reset_seconds := GREATEST(0, ceil(extract(epoch FROM v_expires - now())))::integer;
  RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rate_limit_hit(text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_hit(text, integer, integer)
  TO service_role;

-- ─── 3. Pin bump_rate_limit's search_path ───────────────────────────────────

-- Guarded: bump_rate_limit arrives with the AI feature block (migration 113),
-- which an install may not have applied.
DO $$
BEGIN
  IF to_regprocedure('public.bump_rate_limit(text, integer, integer)') IS NOT NULL THEN
    ALTER FUNCTION public.bump_rate_limit(text, integer, integer)
      SET search_path = public;
  END IF;
END $$;

COMMIT;
