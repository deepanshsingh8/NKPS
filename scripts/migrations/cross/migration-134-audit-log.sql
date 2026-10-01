-- Migration 134 — general audit log.
--
-- Who created, deleted, re-roled or reset a login; who granted an editor which
-- features; who approved or rejected a registration; and every write through
-- the generic admin proxy (/api/admin, both apps). Until now the proxy only
-- printed a console.info line, which Vercel keeps for a few days.
--
-- ── Writes ─────────────────────────────────────────────────────────────────
-- Only the service role writes, through writeAuditLog()
-- (packages/shared/src/lib/audit-log.ts). There are no INSERT / UPDATE /
-- DELETE policies, and those privileges are revoked from `authenticated`, so
-- no browser session can forge or erase a row. `details` holds ids, column
-- NAMES, roles and feature keys — never passwords, tokens or field values.
--
-- ── Append-only ────────────────────────────────────────────────────────────
-- service_role bypasses RLS but NOT triggers. audit_log_append_only() refuses
-- every UPDATE, DELETE and TRUNCATE, with one exception: actor_id is
-- ON DELETE SET NULL, and removing a login must still work, so an UPDATE that
-- changes nothing but actor_id → NULL is let through. Only a role that can
-- disable triggers (the table owner, a superuser) can prune the log, which is
-- a deliberate, visible act: ALTER TABLE public.audit_log DISABLE TRIGGER …
--
-- ── Reads ──────────────────────────────────────────────────────────────────
-- Admins only, via RLS. Editors never: the log describes the admins' own
-- actions, including the grants editors hold.
--
-- Filed under cross/: both the CMS and the ERP admin proxies write to it. On a
-- deployment without this table, writeAuditLog() logs the failure and the
-- write it describes still succeeds.
--
-- SAFE TO RE-RUN.

BEGIN;

CREATE TABLE IF NOT EXISTS public.audit_log (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at            timestamptz NOT NULL DEFAULT now(),
  actor_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_role    text,
  action        text NOT NULL CHECK (action ~ '^[a-z_]+(\.[a-z_]+)+$'),
  target_table  text,
  target_id     text,
  details       jsonb,
  ip            text
);

COMMENT ON TABLE public.audit_log IS
  'Append-only record of privileged actions (migration 134). Written by the '
  'service role via writeAuditLog(); read by admins. Never holds passwords, '
  'tokens or field values.';

CREATE INDEX IF NOT EXISTS idx_audit_log_at
  ON public.audit_log (at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_at
  ON public.audit_log (actor_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_target
  ON public.audit_log (target_table, target_id);

-- ─── Append-only trigger ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.audit_log_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- The FK's ON DELETE SET NULL, when a login is removed. Nothing else about
  -- the row may change.
  IF TG_OP = 'UPDATE'
     AND OLD.actor_id IS NOT NULL
     AND NEW.actor_id IS NULL
     AND (NEW.id, NEW.at, NEW.actor_role, NEW.action, NEW.target_table,
          NEW.target_id, NEW.details, NEW.ip)
         IS NOT DISTINCT FROM
         (OLD.id, OLD.at, OLD.actor_role, OLD.action, OLD.target_table,
          OLD.target_id, OLD.details, OLD.ip)
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'audit_log is append-only (% refused)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.audit_log_append_only() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_audit_log_append_only ON public.audit_log;
CREATE TRIGGER trg_audit_log_append_only
  BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_append_only();

DROP TRIGGER IF EXISTS trg_audit_log_no_truncate ON public.audit_log;
CREATE TRIGGER trg_audit_log_no_truncate
  BEFORE TRUNCATE ON public.audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.audit_log_append_only();

-- ─── RLS: admins read, nobody writes from a client ──────────────────────────

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_select_admin" ON public.audit_log;
CREATE POLICY "audit_log_select_admin"
  ON public.audit_log FOR SELECT TO authenticated
  USING ((SELECT public.get_user_role()) = 'admin');

REVOKE ALL ON public.audit_log FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.audit_log FROM authenticated;
REVOKE ALL ON SEQUENCE public.audit_log_id_seq FROM anon, authenticated;

COMMIT;
