-- Migration 137 — a student who left can come back.
--
-- ── Why ─────────────────────────────────────────────────────────────────────
-- Marking a student Exited (or Terminated) fires enrollment_after_update_
-- recompute, which renumbers the class: the remaining active students close
-- up, so the roll number the leaver held is handed to whoever is next by name.
-- The leaver's own row keeps its old number — it is not active, so the
-- recompute never looks at it.
--
-- Bring that student back and the UPDATE sets status = 'active' with the old
-- roll number still on the row. student_enrollments_class_rollno_active_unique
-- (migration 029) rejects it on the spot, before the AFTER trigger gets a
-- chance to renumber, and change_enrollment_status() surfaces as a bare
-- "Failed to update student status". The office saw exactly that on
-- 2026-10-08: ADVIT PAREEK, VI B, exited on 30 Sep with roll 2; Aman Singh
-- now holds roll 2; Advit could not be made active again from any screen.
--
-- ── Fix ─────────────────────────────────────────────────────────────────────
-- A BEFORE UPDATE trigger: when a row becomes active (or an active row moves
-- class), drop the roll number it is carrying in. The existing AFTER trigger
-- then renumbers the class and the student gets their place by name, exactly
-- as a fresh enrollment would. A manual pin (roll_number_manual) is kept when
-- the number is still free in that class, and released when it is not —
-- a pin that would block the return is worth less than the return.
--
-- Done as a trigger rather than inside change_enrollment_status() because the
-- RPC is not the only writer that flips a row to active: revert-alumni
-- re-points an old enrollment at a class, and the admin proxy can write
-- status and class_id directly. The index is the invariant; one place keeps it.
--
-- SAFE TO RE-RUN.

BEGIN;

CREATE OR REPLACE FUNCTION public.trg_enrollment_release_roll_on_activate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active'
     AND NEW.roll_number IS NOT NULL
     AND (OLD.status IS DISTINCT FROM 'active'
          OR OLD.class_id IS DISTINCT FROM NEW.class_id) THEN
    IF NOT NEW.roll_number_manual
       OR EXISTS (
         SELECT 1
           FROM student_enrollments se
          WHERE se.class_id = NEW.class_id
            AND se.roll_number = NEW.roll_number
            AND se.status = 'active'
            AND se.id <> NEW.id
       ) THEN
      NEW.roll_number := NULL;
      NEW.roll_number_manual := false;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_enrollment_release_roll_on_activate()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enrollment_before_update_release_roll ON public.student_enrollments;
CREATE TRIGGER enrollment_before_update_release_roll
  BEFORE UPDATE OF status, class_id ON public.student_enrollments
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status
        OR OLD.class_id IS DISTINCT FROM NEW.class_id)
  EXECUTE FUNCTION public.trg_enrollment_release_roll_on_activate();

COMMIT;
