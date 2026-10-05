-- Migration 136 — close four RLS gaps found by the role-cycle audit (2026-10-05).
--
-- The audit walked every path where one role writes and another must read:
-- teacher → student/parent, admin → teacher (timetable), admin → covering
-- teacher (substitutions). Four of the gaps are policy, not code:
--
-- 1. timetable_periods was readable with `USING (true)` — i.e. by the anon
--    key shipped in every page. Every reader is a signed-in user (teacher,
--    student, parent, admin), so the policy becomes `TO authenticated`.
--    The website never reads it (grep: no reference in apps/website).
--
-- 2. substitutions / teacher_absences were admin-only. The covering teacher
--    never saw the period they were asked to take, and the absent teacher's
--    grid still showed them teaching. Teachers may now read the rows that
--    name them — either side of the swap. Writes stay admin/service-role.
--
-- 3. student_remarks had no publish gate: a student could read the class
--    teacher's remark for an exam whose marks were not yet published. A
--    remark is visible once any result for that (student, exam) is published,
--    which is the same switch the report card itself uses.
--
-- 4. supplementary_attempts had a parent SELECT policy but no student one, so
--    a final result computed on a student's own session ignored their passed
--    re-test while the parent's included it.
--
-- Safe to re-run. ERP tier only.

-- ── 1. timetable_periods: signed-in users only ──────────────────────────────
DROP POLICY IF EXISTS "Public can read timetable periods" ON public.timetable_periods;
DROP POLICY IF EXISTS "Signed-in users can read timetable periods" ON public.timetable_periods;
CREATE POLICY "Signed-in users can read timetable periods"
  ON public.timetable_periods FOR SELECT
  TO authenticated
  USING (true);

-- ── 2. substitutions / teacher_absences: the teachers named on them ────────
-- The two policies below look at each other's tables. Written as plain
-- sub-selects they would each re-enter the other's RLS and Postgres would
-- refuse with "infinite recursion detected in policy". The absence → teacher
-- lookup therefore goes through a SECURITY DEFINER function, which reads the
-- table as its owner (no RLS) and returns one id. Not callable by anon.
CREATE OR REPLACE FUNCTION public.absence_teacher_id(p_absence_id uuid)
RETURNS uuid AS $$
  SELECT teacher_id FROM public.teacher_absences WHERE id = p_absence_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.absence_teacher_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.absence_teacher_id(uuid) TO authenticated;

DROP POLICY IF EXISTS "Teachers read own substitutions" ON public.substitutions;
CREATE POLICY "Teachers read own substitutions"
  ON public.substitutions FOR SELECT
  TO authenticated
  USING (
    substitute_teacher_id = public.get_my_teacher_id()
    OR public.absence_teacher_id(absence_id) = public.get_my_teacher_id()
  );

DROP POLICY IF EXISTS "Teachers read own absences" ON public.teacher_absences;
CREATE POLICY "Teachers read own absences"
  ON public.teacher_absences FOR SELECT
  TO authenticated
  USING (
    teacher_id = public.get_my_teacher_id()
    OR EXISTS (
      SELECT 1 FROM public.substitutions s
      WHERE s.absence_id = teacher_absences.id
        AND s.substitute_teacher_id = public.get_my_teacher_id()
    )
  );

-- ── 3. student_remarks: visible once the exam's marks are published ────────
DROP POLICY IF EXISTS "Students read own remarks" ON public.student_remarks;
CREATE POLICY "Students read own remarks"
  ON public.student_remarks FOR SELECT
  TO authenticated
  USING (
    student_id = public.get_my_student_id()
    AND EXISTS (
      SELECT 1 FROM public.results r
      WHERE r.student_id = student_remarks.student_id
        AND r.exam_type_id = student_remarks.exam_type_id
        AND r.is_published = true
    )
  );

DROP POLICY IF EXISTS "Parents read linked children remarks" ON public.student_remarks;
CREATE POLICY "Parents read linked children remarks"
  ON public.student_remarks FOR SELECT
  TO authenticated
  USING (
    student_id IN (SELECT public.get_my_children_ids())
    AND EXISTS (
      SELECT 1 FROM public.results r
      WHERE r.student_id = student_remarks.student_id
        AND r.exam_type_id = student_remarks.exam_type_id
        AND r.is_published = true
    )
  );

-- ── 4. supplementary_attempts: students read their own ─────────────────────
DROP POLICY IF EXISTS "Students read own supplementary_attempts" ON public.supplementary_attempts;
CREATE POLICY "Students read own supplementary_attempts"
  ON public.supplementary_attempts FOR SELECT
  TO authenticated
  USING (student_id = public.get_my_student_id());
