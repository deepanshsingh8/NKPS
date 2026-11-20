-- Migration 140 — a student's bus arrangement over time, so the bus fee is
-- priced month by month.
--
-- ── Why ─────────────────────────────────────────────────────────────────────
-- The bus fee was always priced at the stop on the enrollment TODAY, for every
-- month of the session. A student who moved from stop A to stop B in August
-- was charged B's fee back to April; one taken off the bus in October lost the
-- whole year's bus fee, months ridden included, and what they had paid turned
-- into a "Paid Ahead" credit. Nothing recorded when an arrangement changed:
-- Transport → Changes stored an effective date, but Student Assignments
-- overwrote the enrollment with no date and no record.
--
-- ── What ────────────────────────────────────────────────────────────────────
-- student_transport_periods: one row per enrollment per date, "from this day
-- the arrangement is …" (on the bus or not, the stop, both ways or one side,
-- the one-side fee). The fee for a month is the arrangement in force in that
-- month — a change takes effect from the month it falls in, as the school
-- chose. Temporary changes (with an end date) are never recorded here: they
-- change the pickup, not the fee.
--
-- record_transport_period() records one, and keeps the enrollment carrying the
-- latest arrangement on record. The first time it runs for an enrollment it
-- also keeps the enrollment's previous arrangement as the one in force from
-- the start of the session, so history begins correctly without a backfill.
--
-- A trigger is the safety net: an arrangement changed any other way (the
-- admin proxy, an import, plain SQL) is recorded from the day it was made.
--
-- ── Safe to re-run ──────────────────────────────────────────────────────────
-- IF NOT EXISTS / CREATE OR REPLACE / DROP … IF EXISTS throughout. No
-- existing row is changed.

CREATE TABLE IF NOT EXISTS student_transport_periods (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  enrollment_id uuid NOT NULL REFERENCES student_enrollments(id) ON DELETE CASCADE,
  academic_year_id uuid REFERENCES academic_years(id) ON DELETE CASCADE,
  effective_from date NOT NULL,
  has_transport boolean NOT NULL,
  bus_stop_id uuid REFERENCES bus_stops(id) ON DELETE SET NULL,
  transport_direction text NOT NULL DEFAULT 'both'
    CHECK (transport_direction IN ('both', 'pickup_only', 'drop_only')),
  transport_fee_override numeric(10,2),
  source text NOT NULL
    CHECK (source IN ('baseline', 'assignment', 'change_request', 'correction', 'unrecorded')),
  change_request_id uuid REFERENCES transport_change_requests(id) ON DELETE SET NULL,
  note text,
  recorded_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_transport_periods_one_per_day UNIQUE (enrollment_id, effective_from),
  CONSTRAINT student_transport_periods_stop_required
    CHECK (has_transport = false OR bus_stop_id IS NOT NULL),
  CONSTRAINT student_transport_periods_one_side_fee
    CHECK (has_transport = false OR transport_direction = 'both' OR transport_fee_override IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_student_transport_periods_year
  ON student_transport_periods (academic_year_id);

COMMENT ON TABLE student_transport_periods IS
  'A student''s bus arrangement from a date (migration 140). The bus fee for a '
  'month is the arrangement in force that month. Written by '
  'record_transport_period() and, as a safety net, by the enrollment trigger.';

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Read: whoever can see the enrollment can see its history — the subquery runs
-- under the reader's own student_enrollments policies, so the office, the
-- student and their parents see exactly the enrollments they already can.
-- Write: nobody through the API; only the functions below (service role).
ALTER TABLE student_transport_periods ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON student_transport_periods FROM anon, authenticated;
GRANT SELECT ON student_transport_periods TO authenticated;
DROP POLICY IF EXISTS "Read the transport history of an enrollment you can see"
  ON student_transport_periods;
CREATE POLICY "Read the transport history of an enrollment you can see"
  ON student_transport_periods FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM student_enrollments e WHERE e.id = enrollment_id));

-- ── Bring the enrollment in line with its latest arrangement ────────────────
CREATE OR REPLACE FUNCTION public.sync_enrollment_transport(p_enrollment_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_latest student_transport_periods%ROWTYPE;
BEGIN
  SELECT * INTO v_latest
  FROM student_transport_periods
  WHERE enrollment_id = p_enrollment_id
  ORDER BY effective_from DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  -- Tell the safety-net trigger this change is already on record.
  PERFORM set_config('app.transport_period_recorded', 'on', true);
  UPDATE student_enrollments
  SET has_transport = v_latest.has_transport,
      bus_stop_id = CASE WHEN v_latest.has_transport THEN v_latest.bus_stop_id END,
      bus_id = CASE WHEN v_latest.has_transport THEN bus_id END,
      transport_direction = CASE WHEN v_latest.has_transport THEN v_latest.transport_direction ELSE 'both' END,
      transport_fee_override = CASE
        WHEN v_latest.has_transport AND v_latest.transport_direction <> 'both'
          THEN v_latest.transport_fee_override
      END
  WHERE id = p_enrollment_id
    AND (
      has_transport IS DISTINCT FROM v_latest.has_transport
      OR bus_stop_id IS DISTINCT FROM CASE WHEN v_latest.has_transport THEN v_latest.bus_stop_id END
      OR transport_direction IS DISTINCT FROM CASE WHEN v_latest.has_transport THEN v_latest.transport_direction ELSE 'both' END
      OR transport_fee_override IS DISTINCT FROM CASE
        WHEN v_latest.has_transport AND v_latest.transport_direction <> 'both'
          THEN v_latest.transport_fee_override
      END
    );
  PERFORM set_config('app.transport_period_recorded', 'off', true);
END;
$$;

-- ── Record an arrangement from a date ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_transport_period(
  p_enrollment_id uuid,
  p_effective_from date,
  p_has_transport boolean,
  p_bus_stop_id uuid,
  p_direction text,
  p_fee_override numeric,
  p_source text,
  p_note text DEFAULT NULL,
  p_actor uuid DEFAULT NULL,
  p_change_request_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_enr student_enrollments%ROWTYPE;
  v_start date;
BEGIN
  SELECT * INTO v_enr FROM student_enrollments WHERE id = p_enrollment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'enrollment % not found', p_enrollment_id;
  END IF;
  SELECT start_date INTO v_start FROM academic_years WHERE id = v_enr.academic_year_id;

  -- The first change on record keeps what the enrollment said until now as
  -- the arrangement from the start of the session.
  IF v_start IS NOT NULL
     AND p_effective_from > v_start
     AND NOT EXISTS (SELECT 1 FROM student_transport_periods WHERE enrollment_id = p_enrollment_id)
  THEN
    INSERT INTO student_transport_periods (
      enrollment_id, academic_year_id, effective_from, has_transport, bus_stop_id,
      transport_direction, transport_fee_override, source, recorded_by
    ) VALUES (
      p_enrollment_id, v_enr.academic_year_id, v_start,
      coalesce(v_enr.has_transport, false) AND v_enr.bus_stop_id IS NOT NULL,
      CASE WHEN coalesce(v_enr.has_transport, false) THEN v_enr.bus_stop_id END,
      coalesce(v_enr.transport_direction, 'both'),
      v_enr.transport_fee_override,
      'baseline', p_actor
    );
  END IF;

  INSERT INTO student_transport_periods (
    enrollment_id, academic_year_id, effective_from, has_transport, bus_stop_id,
    transport_direction, transport_fee_override, source, note, recorded_by, change_request_id
  ) VALUES (
    p_enrollment_id, v_enr.academic_year_id, p_effective_from, p_has_transport,
    CASE WHEN p_has_transport THEN p_bus_stop_id END,
    CASE WHEN p_has_transport THEN coalesce(p_direction, 'both') ELSE 'both' END,
    CASE WHEN p_has_transport AND coalesce(p_direction, 'both') <> 'both' THEN p_fee_override END,
    p_source, p_note, p_actor, p_change_request_id
  )
  ON CONFLICT (enrollment_id, effective_from) DO UPDATE
  SET has_transport = excluded.has_transport,
      bus_stop_id = excluded.bus_stop_id,
      transport_direction = excluded.transport_direction,
      transport_fee_override = excluded.transport_fee_override,
      source = excluded.source,
      note = excluded.note,
      recorded_by = excluded.recorded_by,
      change_request_id = excluded.change_request_id,
      created_at = now();

  PERFORM public.sync_enrollment_transport(p_enrollment_id);
END;
$$;

-- ── Remove a recorded change (a correction entered by mistake) ──────────────
CREATE OR REPLACE FUNCTION public.delete_transport_period(p_period_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_enrollment uuid;
BEGIN
  DELETE FROM student_transport_periods WHERE id = p_period_id
  RETURNING enrollment_id INTO v_enrollment;
  IF v_enrollment IS NOT NULL THEN
    PERFORM public.sync_enrollment_transport(v_enrollment);
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_enrollment_transport(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_transport_period(uuid, date, boolean, uuid, text, numeric, text, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_transport_period(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_transport_period(uuid, date, boolean, uuid, text, numeric, text, text, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_transport_period(uuid) TO service_role;

-- ── Safety net: an arrangement changed any other way is still dated ─────────
CREATE OR REPLACE FUNCTION public.record_unrecorded_transport_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start date;
BEGIN
  IF coalesce(current_setting('app.transport_period_recorded', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.has_transport IS NOT DISTINCT FROM OLD.has_transport
     AND NEW.bus_stop_id IS NOT DISTINCT FROM OLD.bus_stop_id
     AND NEW.transport_direction IS NOT DISTINCT FROM OLD.transport_direction
     AND NEW.transport_fee_override IS NOT DISTINCT FROM OLD.transport_fee_override
  THEN
    RETURN NEW;
  END IF;
  SELECT start_date INTO v_start FROM academic_years WHERE id = NEW.academic_year_id;
  IF v_start IS NOT NULL
     AND v_start < current_date
     AND NOT EXISTS (SELECT 1 FROM student_transport_periods WHERE enrollment_id = NEW.id)
  THEN
    INSERT INTO student_transport_periods (
      enrollment_id, academic_year_id, effective_from, has_transport, bus_stop_id,
      transport_direction, transport_fee_override, source
    ) VALUES (
      NEW.id, NEW.academic_year_id, v_start,
      coalesce(OLD.has_transport, false) AND OLD.bus_stop_id IS NOT NULL,
      CASE WHEN coalesce(OLD.has_transport, false) THEN OLD.bus_stop_id END,
      CASE WHEN coalesce(OLD.has_transport, false) THEN coalesce(OLD.transport_direction, 'both') ELSE 'both' END,
      CASE WHEN coalesce(OLD.has_transport, false) AND coalesce(OLD.transport_direction, 'both') <> 'both'
        THEN OLD.transport_fee_override END,
      'baseline'
    );
  END IF;
  INSERT INTO student_transport_periods (
    enrollment_id, academic_year_id, effective_from, has_transport, bus_stop_id,
    transport_direction, transport_fee_override, source
  ) VALUES (
    NEW.id, NEW.academic_year_id, current_date,
    coalesce(NEW.has_transport, false) AND NEW.bus_stop_id IS NOT NULL,
    CASE WHEN coalesce(NEW.has_transport, false) THEN NEW.bus_stop_id END,
    CASE WHEN coalesce(NEW.has_transport, false) THEN coalesce(NEW.transport_direction, 'both') ELSE 'both' END,
    CASE WHEN coalesce(NEW.has_transport, false) AND coalesce(NEW.transport_direction, 'both') <> 'both'
      THEN NEW.transport_fee_override END,
    'unrecorded'
  )
  ON CONFLICT (enrollment_id, effective_from) DO UPDATE
  SET has_transport = excluded.has_transport,
      bus_stop_id = excluded.bus_stop_id,
      transport_direction = excluded.transport_direction,
      transport_fee_override = excluded.transport_fee_override,
      source = excluded.source,
      created_at = now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_unrecorded_transport_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enrollment_transport_history ON student_enrollments;
CREATE TRIGGER trg_enrollment_transport_history
  AFTER UPDATE OF has_transport, bus_stop_id, transport_direction, transport_fee_override
  ON student_enrollments
  FOR EACH ROW
  EXECUTE FUNCTION public.record_unrecorded_transport_change();

-- ── Changes already applied this session ────────────────────────────────────
-- Changes approved through Transport → Changes before this migration are not
-- replayed: their "before" arrangement isn't fully recorded (a direction
-- change never stored the old direction). There were none on either campus
-- when this was written; if any exist, record them again from Student
-- Assignments → History with their dates.
DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n
  FROM transport_change_requests c
  JOIN student_enrollments e ON e.id = c.enrollment_id
  JOIN academic_years y ON y.id = e.academic_year_id AND y.is_current
  WHERE c.status = 'applied' AND c.effective_to IS NULL
    AND c.change_type IN ('stop_change', 'drop', 'resume', 'direction_change');
  IF n > 0 THEN
    RAISE NOTICE 'migration 140: % transport change(s) applied this session predate the history. Record them again from Student Assignments → History so their months are priced correctly.', n;
  END IF;
END $$;
