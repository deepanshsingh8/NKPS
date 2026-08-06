# Instalment-Based Fee Schedules

**Problem:** The customer publishes fees as an instalment *schedule* — a numbered list of
rows, each with its own due date, name, amount, audience and late-fee grace date:

| S No | Fee Head | Due Date | Instalment Name | Amount | Student Type | Month Name | Late Fee Start Date |
|---|---|---|---|---|---|---|---|
| 1 | Admission Fee | 01/04/2026 | Admission/Regn. Fee | 10500 | New Student | | |
| 2 | Tuition Fee | 01/04/2026 | 1st Instalment (Tuition Fee) | 23500 | Both | April, 2026 | 12/07/2026 |
| 3 | Tuition Fee | 01/10/2026 | 2nd Instalment (Tuition Fee) | 23500 | Both | Oct., 2026 | 12/10/2026 |
| 4 | Tuition Fee | 01/01/2027 | 3rd Instalment (Tuition Fee) | 23500 | Both | Jan., 2027 | 12/01/2027 |

Required for Nursery–X and XII (one schedule per class) and for XI (one per stream).
Instalment counts differ per class — 3-instalment and 4-instalment plans are both in use.

`fee_structures` could not express any of this: one row per fee head with a `frequency`
multiplier, a single due date, no instalment identity, no new-vs-returning distinction,
and a late fee that accrued from the due date with no grace period.

**Approach (implemented 2026-08-06):** extend `fee_structures` rather than add a parallel
`fee_schedule_items` table. Every grid row IS a `fee_structures` row with
`frequency='one_time'`, so `fee_payments`, `payment_orders`, `fee_change_requests`,
receipts, waivers and the historical import keep their existing foreign keys, and the
annualized amount of a one_time row is already the amount itself — no multiplier
special-casing in the dues math.

---

## DB layer — migration 085

- [x] D1. `scripts/migrations/erp/migration-085-fee-instalment-schedule.sql`
- [x] D2. `instalment_no`, `instalment_name`, `month_label` on `fee_structures`
- [x] D3. `student_type` (`new` | `existing` | `both`, default `both`) with CHECK
- [x] D4. `late_fee_start_date` — the grace anchor, with a CHECK that it can't precede `due_date`
- [x] D5. `idx_fee_structures_schedule` on (year, class, stream, due_date, instalment_no)
- [x] D6. Mirror into `supabase-schema.sql`

## Shared types + validation

- [x] T1. `FeeStudentType`, `FEE_HEADS`, new `FeeStructure` fields (`packages/shared/src/types`)
- [x] T2. `TransportFeeLine` gains the same fields as literal nulls so `EffectiveFeeLine`
      stays uniform for consumers that don't narrow the union
- [x] T3. `feeScheduleSchema` / `feeScheduleRowSchema` / `feeScheduleCopySchema` (Zod)

## Resolution logic — `apps/erp/src/lib/fees.ts`

- [x] L1. `resolveStudentType(admissionDate, year)` — "new" = admitted inside the billed year
- [x] L2. `feeAppliesToStudentType` — an unknown admission date bills only unrestricted rows,
      so a missing date never levies an admission fee on a returning student
- [x] L3. `resolveEffectiveFeeStructures` applies student-type filtering AFTER computing the
      stream override, so a stream schedule still replaces the class-wide one for that head
- [x] L4. `computeLateFee` — shared by the dues view and per-student pages; accrues from
      `late_fee_start_date ?? due_date`
- [x] L5. `compareScheduleRows`, `feeLineLabel`

## API

- [x] A1. `POST /api/fees/schedule` — reconciles a whole grid against the stored bucket
      (id present → update, absent → insert, missing → delete or deactivate on FK violation)
- [x] A2. Rejects a row id that belongs to a different class before writing anything
- [x] A3. `POST /api/fees/schedule/copy` — clone one schedule onto other classes/streams
- [x] A4. New columns added to the `/api/admin` proxy allowlist

## UI

- [x] U1. `FeeScheduleGrid.tsx` — the screenshot's grid, + Add Row, Save, Copy to classes
- [x] U2. Per-row late-fee rule dialog (per-day / percent / cap); the published schedule has
      no column for the rate, only the date it starts
- [x] U3. Running New-student and Old-student totals under the grid
- [x] U4. Academic Fees page tabs: "Fee Schedule" (default) + "All Structures" (legacy list)
- [x] U5. Legacy single-row dialog gains the same fields so editing there loses nothing
- [x] U6. Payments: instalment name + due date on the applicable-fee cards, the record-payment
      dropdown, the waiver dropdown and payment history; Month prefills from `month_label`
- [x] U7. Receipts print the instalment name

## Downstream readers

- [x] R1. Admin dues view — per-student `student_type`, grace-anchored late fee
- [x] R2. `student-dues.ts` (the download gate) — same student-type filtering
- [x] R3. Student + parent portals — same
- [x] R4. Admin payments view now scopes structures to the current year and `is_active=true`
      (a removed-but-receipted row is deactivated, and must not reappear as billable)

## Notes / out of scope

- A legacy row with `frequency != 'one_time'` is shown in the grid with a "was monthly"
  badge; saving converts it to a single dated instalment. The All Structures tab remains
  the place to keep a genuinely recurring fee recurring.
- Editors with the `fees` grant can save schedules directly. `fee_structures` was already
  outside the fee-change-request approval flow (that covers `fee_payments`); widening it
  is a separate change.
