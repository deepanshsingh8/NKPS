-- Migration 139 — one collection covering several bus months, and one
-- pending request per discount.
--
-- ── Why ─────────────────────────────────────────────────────────────────────
-- A bus fee could be recorded for one month per entry: the payments route
-- refused any amount above one month's stop fee. A parent paying April–June
-- together had to be keyed in as three entries with three receipts, and the
-- fee office reported it could not "update fees for more than one month at a
-- time". 739 students were on transport; 7 had any bus payment in the ERP.
--
-- Record Payment now takes several months at once. It still writes ONE
-- fee_payments ROW PER MONTH — the per-month over-collection guard, the dues
-- maths, refunds and every report keep working unchanged — and ties the rows
-- together with payment_group_id, so they print as one receipt
-- ("For April – June 2026") under one receipt number (rows suffixed /1, /2…).
--
-- The second half closes, in the database, the hole migration 056's
-- one-pending-per-row index left open for discount requests: their
-- target_id is NULL, so the same discount could sit in the queue twice and
-- the second copy could never be approved. The API now refuses a second
-- filing; this index is the backstop.
--
-- ── Safe to re-run ──────────────────────────────────────────────────────────
-- ADD COLUMN / CREATE INDEX are IF NOT EXISTS. The unique index is created
-- only when no duplicate pending discount requests exist — creating it over
-- duplicates would fail the whole migration. If any do, it says so and
-- skips; reject the duplicates (Fees → Change Requests → "Select
-- duplicates") and run the file again.

ALTER TABLE fee_payments
  ADD COLUMN IF NOT EXISTS payment_group_id uuid;

COMMENT ON COLUMN fee_payments.payment_group_id IS
  'Rows recorded together as one collection (several bus months in one '
  'payment, migration 139). NULL for a payment recorded on its own.';

CREATE INDEX IF NOT EXISTS idx_fee_payments_payment_group
  ON fee_payments (payment_group_id) WHERE payment_group_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM fee_change_requests
    WHERE status = 'pending'
      AND action = 'insert'
      AND proposed_changes->>'payment_method' = 'waiver'
    GROUP BY proposed_changes->>'student_id',
             proposed_changes->>'fee_structure_id',
             coalesce(proposed_changes->>'month', '')
    HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'migration 139: duplicate pending discount requests exist; '
      'idx_fee_change_requests_one_pending_discount NOT created. Reject the '
      'duplicates under Fees → Change Requests and run this file again.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS idx_fee_change_requests_one_pending_discount
      ON fee_change_requests (
        (proposed_changes->>'student_id'),
        (proposed_changes->>'fee_structure_id'),
        (coalesce(proposed_changes->>'month', ''))
      )
      WHERE status = 'pending'
        AND action = 'insert'
        AND proposed_changes->>'payment_method' = 'waiver';
  END IF;
END $$;
