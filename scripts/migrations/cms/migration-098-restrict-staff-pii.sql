-- migration-098-restrict-staff-pii.sql
--
-- URGENT. Closes an unauthenticated read of staff personal data.
--
-- `teachers` and `staff_members` each carried a policy of the form
--
--     CREATE POLICY "Public can read teachers" ON teachers
--       FOR SELECT USING (true);
--
-- A policy with no TO clause applies to PUBLIC, which includes the `anon`
-- role. The anon key is public by design — it ships inside the marketing
-- site's JavaScript bundle — so anyone on the internet could issue
-- `GET /rest/v1/teachers?select=*` and read, for every member of staff:
--
--   teachers       — aadhar_number, date_of_birth, address, phone, email
--   staff_members  — date_of_birth, address, phone, email, license_number
--
-- Aadhaar numbers and home addresses of employees, readable without logging
-- in. Under India's DPDP Act 2023 this is a reportable class of breach.
--
-- Why it went unnoticed: the policies read as though they exist to serve the
-- public staff directory on the marketing site. That page does need staff
-- data — but only names, subjects, photos and qualifications, and only for
-- teaching categories. It was selecting `*`, so the PII was travelling to
-- every visitor's browser as well as being available to direct API calls.
--
-- The fix separates the two needs:
--   1. The base tables become authenticated-only. Every ERP screen that reads
--      them from the browser is behind a login, so nothing in the admin app
--      changes. Nothing in the marketing site reads `teachers` at all.
--   2. A view, `public_staff_directory`, exposes ONLY the safe columns to
--      anon. It is the single public surface, so widening it is a deliberate
--      act rather than an accident of `select("*")`.
--
-- Deploy order does not matter. The directory component falls back to its
-- bundled static staff list whenever the query errors, so neither
-- "migration first" nor "code first" breaks the public page.

begin;

-- ── teachers ────────────────────────────────────────────────────────────────
-- No public consumer exists; this table is read only by ERP screens (classes,
-- subjects, timetable, substitutions, staff) and by server routes.
DROP POLICY IF EXISTS "Public can read teachers" ON teachers;

CREATE POLICY "Authenticated can read teachers"
  ON teachers FOR SELECT
  TO authenticated
  USING (true);

-- ── staff_members ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public can view staff members" ON staff_members;

CREATE POLICY "Authenticated can read staff members"
  ON staff_members FOR SELECT
  TO authenticated
  USING (true);

-- ── public directory ────────────────────────────────────────────────────────
-- security_invoker = false (the default, stated explicitly): the view runs as
-- its owner and so is not blocked by the authenticated-only policy above.
-- That is the point — this view IS the curated public projection, and it can
-- only ever return the columns named here.
--
-- The category filter is applied here as well as in the component: the public
-- directory lists teaching and management staff, never bus drivers or peons,
-- and that should not depend on a client-side filter being remembered.
CREATE OR REPLACE VIEW public_staff_directory
WITH (security_invoker = false) AS
  SELECT
    id,
    name,
    subject,
    category,
    photo_url,
    qualifications,
    sort_order
  FROM staff_members
  WHERE is_active = true
    AND category IN (
      'management', 'pgt', 'tgt', 'prt', 'motherTeachers', 'admin'
    );

GRANT SELECT ON public_staff_directory TO anon, authenticated;

COMMENT ON VIEW public_staff_directory IS
  'The only staff data readable without logging in. Columns are deliberately '
  'limited: staff_members also holds date_of_birth, address, phone, email and '
  'license_number, none of which may ever be added here. See migration 098.';

-- ── student roster enumeration ──────────────────────────────────────────────
-- `student_subjects` and `student_elective_picks` are both keyed on
-- student_id and were also readable by anon. Joined against the (legitimately
-- public) classes and subjects tables, that hands an unauthenticated caller
-- the complete student UUID keyspace plus each student's stream and subject
-- choices — the input to every other student_id-parameterised probe.
--
-- Neither table has a single browser-side reader: every consumer is a server
-- route on the service-role client, which bypasses RLS entirely. Restricting
-- them to authenticated therefore changes no working behaviour.
DROP POLICY IF EXISTS "Public can read student_subjects" ON student_subjects;

CREATE POLICY "Authenticated can read student_subjects"
  ON student_subjects FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Public can read student_elective_picks" ON student_elective_picks;

CREATE POLICY "Authenticated can read student_elective_picks"
  ON student_elective_picks FOR SELECT
  TO authenticated
  USING (true);

commit;
