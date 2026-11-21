-- Migration 141 — one old-software receipt may settle several bus months.
--
-- ── Why ─────────────────────────────────────────────────────────────────────
-- The day-book importer now places a "Transport Fee" head on the student's
-- bus months, oldest first, one fee_payments row per month — the row shape a
-- bus payment taken on the fee desk has (bus_stop_id + month). The idempotency
-- index from migration 115 keys a source receipt on
-- COALESCE(fee_structure_id, bus_stop_id), and every month of one receipt at
-- one stop shares that key: the second month's row violated the index and the
-- whole insert chunk was refused.
--
-- ── What ────────────────────────────────────────────────────────────────────
-- The same index with the month added. An instalment slice carries the
-- schedule's month label, which is one per instalment, so nothing an
-- instalment import relied on is loosened; a bus slice carries the month it
-- settles, so two months of one receipt are two keys.
--
-- Safe to re-run: the old index is dropped if present, the new one created if
-- absent.

DROP INDEX IF EXISTS fee_payments_source_receipt_unique;

CREATE UNIQUE INDEX IF NOT EXISTS fee_payments_source_receipt_unique
  ON fee_payments (
    academic_year_id,
    source_receipt_no,
    COALESCE(fee_structure_id, bus_stop_id),
    COALESCE(month, '')
  )
  WHERE source_receipt_no IS NOT NULL;

COMMENT ON INDEX fee_payments_source_receipt_unique IS
  'Idempotency key for the day-book importer: one row per (year, old receipt '
  'number, instalment or bus stop, month). The month is what lets one old '
  'receipt settle several bus months (migration 141).';
