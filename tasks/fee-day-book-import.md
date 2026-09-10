# Fee Day-Book Import (2026-27 backfill from the old ERP)

Plan: `~/.claude/plans/users-deepanshsingh-downloads-fee-accou-kind-muffin.md`
Branch: `feat/fee-day-book-import`

Source: `Fee Accounts_Day Book_14-03-2026 to 10-09-2026_Session_2026-27.xls`
1,530 receipts · 835 students · Rs 2,04,19,998
Control totals: Cash 57,17,650 | Cheque 10,41,300 | Online 1,36,61,048
                Admission 12,50,600 | Tuition 1,91,69,398

## Phase 0 — Migration 115
- [x] `scripts/migrations/erp/migration-115-day-book-import.sql`
- [x] `fee_payments.source_receipt_no` + partial unique index on
      (academic_year_id, source_receipt_no, COALESCE(fee_structure_id, bus_stop_id))
- [x] `import_batches` table + admin-only RLS
- [x] Backfill one `import_batches` row per existing distinct `import_batch_id`
- [x] Mirror into `supabase-schema.sql` (same turn)

## Phase 1 — Parser (shared)
- [x] `packages/shared/src/lib/historical-import/parse-head-wise-day-book.ts`
- [x] `class-name-map.ts`: hyphen/space stream patterns (`XI-Commerce`)
- [x] Bank-cell heuristic (long text -> remarks, short -> bank_name)
- [x] Types in `historical-import/types.ts` + `index.ts` re-export
- [x] Scratch verification: parsed totals == file footer, to the rupee (7/7 PASS)

## Phase 2 — Allocation engine
- [x] `apps/erp/src/lib/fee-allocation.ts` (pure, no Supabase)
- [x] Cases: exact / spanning / partial / over-allocation / no schedule row / multi-receipt
- [x] `scripts/_test-fee-allocation.mts` — 14 checks, all passing (no test runner in the repo; follows the `scripts/_*` diagnostic convention)

## Phase 3 — API
- [x] `api/fees/day-book-import/route.ts` (dry-run + commit)
- [x] `api/fees/import-batches/route.ts` (GET list, admin-only)
- [x] Extend `api/fees/historical-revert/route.ts` (enrollments + stub students + batch stamp)
- [x] Fix `countFollowupNativePayments` cross-product — it compared students x structures,
      so any one unrelated native receipt would have blocked a large batch's revert forever
- [x] `resolveEffectiveFeeStructures` gains `ignoreStudentType` (used only as a per-head fallback)
- [x] Receipt PDF prints the instrument date beside the transaction ref, so an imported
      online receipt is complete; `cheque_date` comment widened to match how it is used

## Phase 4 — UI
- [x] `components/DayBookImportDialog.tsx`
- [x] Preview panels: 3-way reconciliation (file / parsed / will-import), counters,
      class + head mapping, students to create, needs_review opt-in, issue table
- [x] Error CSV download
- [x] Mount in `AdminFeesContent.tsx`
- [x] `components/ImportHistoryPanel.tsx` — import history + revert (first UI caller for revert)

## Phase 5 — Leavers visible in collections
- [x] "Include students who left" toggle on the dues register
- [x] Leaver rows carry a Left/Terminated badge — mixing them in silently would
      have made a historical arrear look like one to chase

## Phase 6 — Type drift
- [x] `PaymentMethod` += `historical_unknown`; `FeePayment` += source, import_batch_id,
      source_receipt_no

## Review

### What shipped
Parser -> allocation engine -> two-phase API -> wizard, plus the batch registry that
finally makes the revert endpoints reachable. Nothing has been run against a real
database; that hand-off is below.

New: `parse-head-wise-day-book.ts`, `fee-allocation.ts`, `api/fees/day-book-import`,
`api/fees/import-batches`, `DayBookImportDialog.tsx`, `ImportHistoryPanel.tsx`,
`migration-115`, `_test-fee-allocation.mts`, `_verify-day-book-import.mts`.
Touched: `class-name-map.ts`, `historical-import/types.ts`+`index.ts`, `fees.ts`,
`historical-revert/route.ts`, `FeeReceiptPDF.tsx`, `AdminFeesContent.tsx`,
`types/index.ts`, `supabase-schema.sql`.

### Things found on the way that were not in the plan
- **Dates are real Excel serials.** The display text is `M/D/YY` while every other
  sheet this ERP reads is `D/M/Y`. Parsing the display string would have swapped
  day and month on roughly a third of 1,530 receipts with no total changing, so
  nothing would have caught it. The parser reads the serial instead, via the
  existing UTC-safe `excelSerialToDate` — `cellDates:true` would have shifted every
  date back a day when run on an IST machine.
- **The dry run had to allocate too.** As first written it did not, so a fee head
  missing from one class's schedule would have passed preview and then failed the
  whole commit. Allocation now runs before the dry-run branch and the commit reuses
  the same result: a clean preview is the same computation that gets written.
- **`countFollowupNativePayments` cross-products.** It matched students x structures
  rather than actual pairs, so on a batch this size one unrelated native receipt
  would have blocked the revert forever. Rewritten to intersect real pairs.
- **`student_type` needed a fallback, not a bypass.** 209 students paid an admission
  fee and some are returning students the schedule would not bill. Ignoring the rule
  outright would misallocate for a school that publishes separate new/returning rows,
  so the resolution is primary-then-fallback, per head.
- **`min(uuid)` avoided** in the backfill — `(array_agg(... ORDER BY created_at))[1]`
  is type-agnostic and picks the first row of the batch, which is the meaningful one.
- Receipt PDF now prints the instrument date beside a transaction ref; it previously
  showed that date only next to a cheque number, so an imported online receipt would
  have dropped it.
- Pre-existing, untouched: `historical-import/route.ts` inserts its Historical bucket
  with `amount: 0`, which violates `fee_structures_amount_positive`. That path is
  almost certainly broken on commit. Separate fix.

### Verified
- `_verify-day-book-import.mts` on the real file: all 7 control totals reconcile to
  the rupee (grand 2,04,19,998; cash/cheque/online; both heads), 0 row errors,
  all 19 class names map with no operator input, 835 students, 9 zero-value skips.
  Allocation over a deliberately aggressive synthetic schedule: every rupee survives
  the split (4,697 slices == 2,04,19,998).
- `_test-fee-allocation.mts`: 14/14 — exact, spanning, partial, over-allocation,
  missing head, multi-receipt carry, already-filled, paise-exact 3-way split.
- Migration 115 applied to a scratch PostgreSQL 14 instance: applies clean, is
  idempotent on re-apply, and the dedup index was exercised directly — a re-split
  receipt is refused even under a new `receipt_number`, transport slices dedupe
  through the `COALESCE` target, and native rows are unaffected. Backfill
  reconstructs all three legacy batch kinds with correct counts, amounts and actors.
- `npm run typecheck`, `npm run lint` (0 errors; +1 warning vs the 130 already on
  main, a fetch-on-mount effect matching the existing house pattern), `npm run build`.

### Not done — needs a real database
Nothing here has touched Supabase. Before production:
1. Apply migration 115 in Supabase Studio.
2. Publish the 2026-27 fee schedule if it is not already published — the import
   refuses rather than inventing a bucket.
3. Dry run against a branch/restored copy, read the reconciliation panel.
4. Commit there, spot-check three students (multi-receipt, single-receipt leaver,
   over-allocated), re-run the same file to confirm it is a no-op, revert to confirm
   payments + enrollments + stub students all disappear.
5. Only then production.
