-- Migration 127 — close what the public (anon) key could reach, and stop
-- parents and students reading staff PII.
--
-- ── Why ─────────────────────────────────────────────────────────────────────
-- The anon key ships in every page's JavaScript; anyone can call PostgREST
-- with it. Tables were safe — RLS filtered every anon read to zero rows — but
-- views are not tables:
--
--   * A view runs as its OWNER (postgres) unless it says security_invoker, so
--     it bypasses the RLS of the tables underneath.
--   * Supabase's default privileges GRANT ALL on every new object in `public`
--     to anon and authenticated, views included.
--   * A single-table view with no aggregates is AUTO-UPDATABLE.
--
-- Put together, as of 2026-09-27 on production, with nothing but the anon key:
--
--   teachers_needing_review   SELECT: teacher name, email, phone
--                             UPDATE/INSERT/DELETE on `teachers` (auto-updatable)
--   profile_link_health       SELECT: every user's name/email + link anomaly
--   public_staff_directory    UPDATE/INSERT/DELETE on `staff_members`
--                             (SELECT is intended — the website reads it)
--
-- Both admin views are only ever read server-side with the service role
-- (/api/admin/link-health, /api/teachers?scope=review), which needs no grant.
--
-- Also closed here:
--
--   school_meeting_counts     "Teachers manage … for own classes" was granted to
--                             PUBLIC with `class_id IS NULL OR …`, so anon could
--                             insert/update/delete every school-wide row. The
--                             API already forbids teachers the NULL scope; the
--                             policy now agrees. Editors holding ptm_notes keep
--                             the NULL scope via has_editor_capability().
--   contact_submissions,      a public INSERT policy let anyone write rows
--   registration_requests     straight through PostgREST, skipping the routes'
--                             validation and rate limits. Both routes insert with
--                             the service role, which ignores RLS — the
--                             policies admitted nobody legitimate.
--   bump_rate_limit()         SECURITY DEFINER and executable by anon, so anyone
--                             could exhaust the WhatsApp assistant's global
--                             bucket. Only the service role calls it.
--   trigger functions         handle_new_user, guard_profile_privileged_cols,
--                             rls_auto_enable: exposed as /rpc endpoints for no
--                             reason. Triggers do not need EXECUTE grants.
--   teachers, staff_members   "Authenticated can read …" USING (true): any
--                             parent or student could read every teacher's and
--                             staff member's phone, address and date of birth.
--                             This migration adds teacher_display_names() /
--                             staff_display_names() (id + name, nothing else)
--                             for the two portal screens that show a name;
--                             migration 128 then narrows the policies. 128 is
--                             separate because it must be applied only AFTER
--                             the portal code calling these functions is live.
--
-- Plus two cheap performance items from the Supabase advisor: covering indexes
-- for eight unindexed foreign keys, and two exact-duplicate indexes dropped.
--
-- Safe to re-run.

BEGIN;

-- ── 1. Views ────────────────────────────────────────────────────────────────
REVOKE ALL ON public.teachers_needing_review FROM anon, authenticated;
REVOKE ALL ON public.profile_link_health     FROM anon, authenticated;
ALTER VIEW public.teachers_needing_review SET (security_invoker = true);
ALTER VIEW public.profile_link_health     SET (security_invoker = true);

-- Stays owner-rights on purpose (anon cannot read staff_members), but read-only.
REVOKE ALL ON public.public_staff_directory FROM anon, authenticated;
GRANT SELECT ON public.public_staff_directory TO anon, authenticated;

-- The two diagnostic timetable views were already revoked from anon; make the
-- same true of authenticated. Both are read with the service role.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.timetable_teacher_clashes, public.timetable_assignment_drift
  FROM anon, authenticated;

-- ── 2. school_meeting_counts ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Teachers manage school_meeting_counts for own classes"
  ON public.school_meeting_counts;
CREATE POLICY "Teachers manage school_meeting_counts for own classes"
  ON public.school_meeting_counts FOR ALL TO authenticated
  USING (
    (SELECT public.get_user_role()) = 'teacher'
    AND class_id IN (SELECT public.get_my_class_ids())
  )
  WITH CHECK (
    (SELECT public.get_user_role()) = 'teacher'
    AND class_id IN (SELECT public.get_my_class_ids())
  );

DROP POLICY IF EXISTS "PTM editors manage school_meeting_counts"
  ON public.school_meeting_counts;
CREATE POLICY "PTM editors manage school_meeting_counts"
  ON public.school_meeting_counts FOR ALL TO authenticated
  USING ((SELECT public.has_editor_capability('ptm_notes')))
  WITH CHECK ((SELECT public.has_editor_capability('ptm_notes')));

-- ── 3. Public insert policies nobody legitimate uses ────────────────────────
DROP POLICY IF EXISTS "Service role can insert contact submissions"
  ON public.contact_submissions;
DROP POLICY IF EXISTS "registration_requests_insert_public"
  ON public.registration_requests;
DROP POLICY IF EXISTS "Anyone can submit registration requests"
  ON public.registration_requests;

-- ── 4. Functions that should not be RPC endpoints ───────────────────────────
REVOKE EXECUTE ON FUNCTION public.bump_rate_limit(text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_rate_limit(text, integer, integer)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.handle_new_user()             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_profile_privileged_cols() FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated';
  END IF;
END $$;

-- ── 5. Name-only lookups for the portals (policy change is migration 128) ──
-- Names only, for the portal screens that label a period or a bus.
CREATE OR REPLACE FUNCTION public.teacher_display_names(p_ids uuid[])
RETURNS TABLE (id uuid, full_name text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT t.id, t.full_name FROM public.teachers t WHERE t.id = ANY (p_ids);
$$;

CREATE OR REPLACE FUNCTION public.staff_display_names(p_ids uuid[])
RETURNS TABLE (id uuid, name text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT s.id, s.name FROM public.staff_members s WHERE s.id = ANY (p_ids);
$$;

REVOKE EXECUTE ON FUNCTION public.teacher_display_names(uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.staff_display_names(uuid[])   FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.teacher_display_names(uuid[]) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.staff_display_names(uuid[])   TO authenticated;

-- ── 6. Indexes (Supabase performance advisor) ───────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ai_conversations_academic_year_id ON public.ai_conversations(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_deleted_by       ON public.ai_conversations(deleted_by);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_teacher_id       ON public.ai_conversations(teacher_id);
CREATE INDEX IF NOT EXISTS idx_ai_query_runs_academic_year_id    ON public.ai_query_runs(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_export_events_ai_run_id           ON public.export_events(ai_run_id);
CREATE INDEX IF NOT EXISTS idx_parent_phone_otps_parent_id       ON public.parent_phone_otps(parent_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conversation_id ON public.whatsapp_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_parent_id       ON public.whatsapp_sessions(parent_id);

DROP INDEX IF EXISTS public.idx_class_tests_class_id;               -- = idx_class_tests_class
DROP INDEX IF EXISTS public.idx_student_enrollments_stream_id;      -- = idx_student_enrollments_stream

COMMIT;
