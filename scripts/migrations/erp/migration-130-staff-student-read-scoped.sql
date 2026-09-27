-- Migration 130 — staff read students only when a granted feature needs them.
--
-- Migration 084 restored student reads for the 'staff' role with
--     USING (get_user_role() = 'staff')
-- so that a staff member granted fees, attendance, transport, … could see the
-- students those screens list. But the grant is to the ROLE, not the feature:
-- a staff account granted only Gallery — or nothing at all — could open the
-- browser console and read every student row, Aadhaar number and address
-- included. On production (2026-09-27) three of seven staff accounts were in
-- exactly that position.
--
-- Now: a staff member reads students / enrollments only if they hold at least
-- one feature outside the set below, which touch no student data — website
-- content, the calendar, and year / exam-type configuration. Everything else
-- keeps working exactly as 084 intended. An exclusion list rather than an
-- allowlist on purpose: a feature added to the catalog later fails open for
-- the people granted it, not shut for a screen nobody tested.
--
-- Safe to re-run.

BEGIN;

CREATE OR REPLACE FUNCTION public.staff_can_read_students()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.profiles p
      JOIN public.editor_permissions ep ON ep.editor_id = p.id
     WHERE p.id = auth.uid()
       AND p.role = 'staff'
       AND ep.feature_key NOT IN (
         'gallery', 'articles', 'contact', 'site_media', 'disclosure',
         'calendar', 'academic_years', 'exam_types', 'staff'
       )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.staff_can_read_students() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.staff_can_read_students() TO authenticated;

DROP POLICY IF EXISTS "students_select_staff" ON public.students;
CREATE POLICY "students_select_staff"
  ON public.students FOR SELECT TO authenticated
  USING ((SELECT public.staff_can_read_students()));

DROP POLICY IF EXISTS "student_enrollments_select_staff" ON public.student_enrollments;
CREATE POLICY "student_enrollments_select_staff"
  ON public.student_enrollments FOR SELECT TO authenticated
  USING ((SELECT public.staff_can_read_students()));

COMMIT;
