-- Migration 133 — clear the Supabase advisor's function and view findings.
--
-- ── What ────────────────────────────────────────────────────────────────────
--
-- 1. `function_search_path_mutable` — pin search_path = public on 25 functions.
--    A function without a pinned search_path resolves unqualified names against
--    whatever the CALLER's search_path is. For a SECURITY DEFINER function that
--    is a privilege-escalation path (a caller who can create objects in a
--    schema earlier on their path shadows `profiles` or `classes` with their
--    own). For the rest it is a correctness hazard. Every body below was read
--    against supabase-schema.sql: unqualified names are all tables in `public`
--    (student_parents, classes, class_subjects, marksheet_publications,
--    student_enrollments, students) or built-ins in pg_catalog (now(),
--    array_agg, jsonb_build_object), which is always searched first. auth.uid()
--    and auth.role() are schema-qualified. Nothing references `extensions`.
--
--    bump_rate_limit() is deliberately absent — migration 132 owns it.
--
-- 2. `anon_security_definer_function_executable` — who may call the RLS
--    helpers. Only has_editor_feature(text) is revoked from anon. The other
--    seven are SKIPPED, on purpose:
--
--      get_user_role, get_my_student_id, get_my_teacher_id, get_my_parent_id,
--      get_my_children_ids, get_my_class_ids, has_editor_capability(text)
--
--    Each is called by policies that carry no `TO` clause and so apply to
--    PUBLIC, anon included — 119 policies for get_user_role alone, among them
--    "admins full access to gallery events" and the calendar_events write
--    policies, on tables the public website reads with the anon key.
--    PostgreSQL checks EXECUTE on every function in every applicable policy
--    when the query starts, short-circuit or not, so revoking any of these
--    from anon turns an anonymous SELECT on those tables from "zero rows" (or
--    the public rows) into "permission denied for function". The fix for them
--    is to scope those policies `TO authenticated` first; that is a separate,
--    larger migration. has_editor_capability's own comment in the schema
--    already records the same decision.
--
--    has_editor_feature(text) is referenced only by the three staff_* SELECT
--    policies from migration 131, all `TO authenticated`, and by no RPC call
--    in the apps. Even so, the revoke below re-checks pg_policies on the live
--    database first and skips with a NOTICE if any anon-applicable policy
--    there calls it — both production databases have drifted from this repo.
--
--    Note the REVOKE has to name PUBLIC as well as anon: every function is
--    executable by PUBLIC by default, and anon inherits from PUBLIC, so a
--    REVOKE … FROM anon alone changes nothing.
--
-- 3. Two diagnostic timetable views stop being readable by `authenticated`.
--    Both run with their owner's rights and are keyed on a teacher, so any
--    signed-in parent or student could read every teacher's double bookings.
--    timetable_assignment_drift has no reader in the apps.
--    timetable_teacher_clashes was read from the browser by /timetable/clashes
--    and /timetable/setup; both now go through GET /api/timetable/clashes
--    (verifyAdminOrEditor("timetable") + service role), shipped in the same
--    change. DEPLOY THAT CODE BEFORE APPLYING THIS, or the Clash Check screen
--    reports "Failed to load".
--
-- 4. Two functions that exist only on one of the production databases,
--    drop_temp_credential_on_password_set() and rls_auto_enable(), lose
--    EXECUTE for every API role. Trigger and event-trigger functions are not
--    permission-checked when they fire, so this only removes them as RPC
--    endpoints.
--
-- ── Safety ──────────────────────────────────────────────────────────────────
-- Re-runnable: ALTER … SET, REVOKE and GRANT are idempotent. Every statement
-- is guarded by to_regprocedure / to_regclass so a database missing an object
-- skips it instead of failing.
--
-- Before applying to a drifted database, compare the live bodies with the
-- schema — a body that calls an unqualified function from `extensions` (e.g.
-- uuid_generate_v4) would stop resolving once search_path is pinned:
--
--   SELECT p.oid::regprocedure, p.prosrc ~* 'uuid_generate|crypt\(|gen_salt|digest\(|unaccent|similarity'
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proconfig IS NULL;
--
-- Mirrored at the end of supabase-schema.sql.

-- ── 1. Pin search_path ──────────────────────────────────────────────────────
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.get_user_role()',
    'public.get_my_student_id()',
    'public.get_my_teacher_id()',
    'public.get_my_parent_id()',
    'public.get_my_children_ids()',
    'public.get_my_class_ids()',
    'public.has_editor_feature(text)',
    'public.handle_new_user()',
    'public.guard_profile_privileged_cols()',
    'public.enforce_profile_role_link()',
    'public.set_updated_at()',
    'public.finalize_marksheet_one(uuid, uuid, uuid, jsonb, text, uuid, text)',
    'public.finalize_year_final_one(uuid, uuid, uuid, jsonb, text, uuid, text)',
    'public.recompute_roll_numbers(uuid, text)',
    'public.apply_roll_numbers(uuid, uuid[])',
    'public.trg_enrollment_insert_recompute()',
    'public.trg_enrollment_delete_recompute()',
    'public.trg_enrollment_update_recompute()',
    'public.trg_student_name_recompute()',
    'public.ptm_notes_touch_updated_at()',
    'public.ptm_formats_touch_updated_at()',
    'public.supplementary_attempts_touch_updated_at()',
    'public.teacher_absences_touch_updated_at()',
    'public.substitutions_touch_updated_at()',
    'public.trg_learn_teacher_subject()'
  ] LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public', fn);
    ELSE
      RAISE NOTICE 'migration 133: % not found, search_path left alone', fn;
    END IF;
  END LOOP;
END $$;

-- ── 2. has_editor_feature: authenticated only ───────────────────────────────
DO $$
DECLARE
  callers text;
BEGIN
  IF to_regprocedure('public.has_editor_feature(text)') IS NULL THEN
    RAISE NOTICE 'migration 133: has_editor_feature(text) not found, skipped';
    RETURN;
  END IF;

  SELECT string_agg(format('%I.%I "%s"', schemaname, tablename, policyname), ', ')
    INTO callers
    FROM pg_policies
   WHERE roles && ARRAY['public', 'anon']::name[]
     AND (coalesce(qual, '') ~ '\mhas_editor_feature\s*\('
          OR coalesce(with_check, '') ~ '\mhas_editor_feature\s*\(');

  IF callers IS NOT NULL THEN
    RAISE NOTICE 'migration 133: has_editor_feature left executable by anon; anon-applicable policies call it: %', callers;
    RETURN;
  END IF;

  REVOKE EXECUTE ON FUNCTION public.has_editor_feature(text) FROM PUBLIC, anon;
  GRANT  EXECUTE ON FUNCTION public.has_editor_feature(text) TO authenticated, service_role;
END $$;

-- ── 3. Diagnostic timetable views: service role only ────────────────────────
DO $$
DECLARE
  v text;
BEGIN
  FOREACH v IN ARRAY ARRAY['public.timetable_teacher_clashes', 'public.timetable_assignment_drift'] LOOP
    IF to_regclass(v) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON %s FROM PUBLIC, anon, authenticated', v);
      EXECUTE format('GRANT SELECT ON %s TO service_role', v);
    ELSE
      RAISE NOTICE 'migration 133: view % not found, skipped', v;
    END IF;
  END LOOP;
END $$;

-- ── 4. Not RPC endpoints ────────────────────────────────────────────────────
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.drop_temp_credential_on_password_set()',
    'public.rls_auto_enable()'
  ] LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    END IF;
  END LOOP;
END $$;
