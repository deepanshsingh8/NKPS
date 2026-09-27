-- Migration 129 — attendance_totals(): count in the database, not the browser.
--
-- ── Why ─────────────────────────────────────────────────────────────────────
-- The admin dashboard's attendance chart and the Attendance page's class table
-- both wanted a handful of numbers — present / absent / late per day, or per
-- class — and both got them by downloading every attendance row in the range
-- (tens of thousands for a month of the whole school) in 1,000-row pages,
-- one after another, and counting in JavaScript. On every dashboard view.
--
-- This returns the counts instead: one row per (day or class, status). A month
-- by day is ~31 × 4 rows; a term by class is ~32 × 4. Both sit well under
-- PostgREST's 1,000-row response cap, so no paging either.
--
-- SECURITY INVOKER on purpose: the Attendance page calls it with the user's
-- own JWT, and the attendance RLS policies (admin, attendance-granted staff,
-- teachers for their classes) must keep deciding which rows are counted.
--
-- Safe to re-run.

CREATE OR REPLACE FUNCTION public.attendance_totals(
  p_from date,
  p_to date,
  p_group_by text,             -- 'date' | 'class'
  p_class_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (bucket text, status text, n bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT CASE WHEN p_group_by = 'class' THEN a.class_id::text ELSE a.date::text END,
         a.status,
         count(*)
    FROM public.attendance a
   WHERE a.date BETWEEN p_from AND p_to
     AND (p_class_ids IS NULL OR a.class_id = ANY (p_class_ids))
   GROUP BY 1, 2;
$$;

REVOKE EXECUTE ON FUNCTION public.attendance_totals(date, date, text, uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.attendance_totals(date, date, text, uuid[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.attendance_totals(date, date, text, uuid[]) IS
  'Attendance counts per (date or class, status) in a date range. SECURITY '
  'INVOKER: RLS on attendance decides which rows are counted.';
