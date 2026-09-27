-- Migration 128 — teachers and staff_members: staff roles only.
--
-- "Authenticated can read teachers" / "Authenticated can read staff members"
-- were USING (true), so any parent or student session could read every
-- teacher's and staff member's phone, address and date of birth from the
-- browser console. The only non-staff screens that read these tables wanted a
-- name — the timetable's teacher and the bus driver — and since migration 127
-- they get it from teacher_display_names() / staff_display_names().
--
-- ORDER MATTERS: apply only after the portal code that calls those functions
-- (student/parent timetable, parent transport) is deployed; before that, those
-- screens would show a blank teacher/driver name.
--
-- Safe to re-run.

BEGIN;

DROP POLICY IF EXISTS "Authenticated can read teachers" ON public.teachers;
DROP POLICY IF EXISTS "teachers_select_authenticated"   ON public.teachers;
DROP POLICY IF EXISTS "teachers_select_staff"           ON public.teachers;
CREATE POLICY "teachers_select_staff"
  ON public.teachers FOR SELECT TO authenticated
  USING ((SELECT public.get_user_role()) IN ('admin', 'editor', 'staff', 'teacher'));

DROP POLICY IF EXISTS "Authenticated can read staff members" ON public.staff_members;
DROP POLICY IF EXISTS "staff_members_select_staff"          ON public.staff_members;
CREATE POLICY "staff_members_select_staff"
  ON public.staff_members FOR SELECT TO authenticated
  USING ((SELECT public.get_user_role()) IN ('admin', 'editor', 'staff', 'teacher'));

COMMIT;
