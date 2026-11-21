# Fee import from the old ERP, bus-fee months, Paid/Due lines — November 2026

**Source:** the fee office's four questions of 21 Nov 2026 (with two screen photos):
how to bring the updated fee records over from the old ERP in bulk without
duplicating what was already keyed into the new one; take June out of the bus
fee; let the office take bus fees for months ahead; and why the Paid/Due lines
under the fee cards show for some students and not others.

**What was checked:** the ERP code at `71911fa` (main, includes PR #108). No
database access was used; the two photos are the only live data seen.

---

## 1. Bulk transfer from the old ERP without duplicates

**Finding.** The importer already exists: Fees → Payments → *Import Day Book
(Head wise)* reads the old software's Day Book export and writes one
`fee_payments` row per instalment settled, keyed by the old receipt number
(`source_receipt_no`, migration 115). Re-uploading a later export is safe for
anything it has imported before. Two gaps made it unusable for the office's
situation:

- A student with **any** payment entered by hand on the fee desk had **all**
  their file receipts held back ("needs review"), with one global tick to force
  them all in. There was no way to say "this receipt is the one we keyed in;
  the others are new".
- A **Transport / Bus Fee** column in the file was an unmapped head, which
  blocked the whole import. The office's bus collections could not come over
  at all; the first photo (every bus month unpaid, every tuition instalment
  paid) is what that looks like.

**Shipped.**

- [x] **Receipt-level match against hand-entered payments.** A file receipt
      whose student, date and total equal a fee-desk receipt (rows of one
      collection summed by receipt number) is reported **Already in ERP** and
      skipped. Discounts are not receipts and never match.
- [x] **Hold back only what is unexplained.** A student's remaining receipts
      are held back only while one of their hand-entered receipts matches
      nothing in the file; the row names those receipts (number, amount, date)
      so the clerk can check Payment History. Once every hand-entered receipt
      is matched, the rest import without review. The confirm tick still exists.
- [x] **Bus fee head.** A head named Transport / Bus / Conveyance / Van (or
      mapped to "Transport" in the head mapping) fills the student's bus months
      oldest first, each priced the way the fee desk prices it (transport
      history, migration 140), on top of anything already paid for the month.
      Rows land on `bus_stop_id` + month, exactly like a desk payment. A student
      with no stop (or a stop without a fee) is an error row naming the fix.
- [x] **Migration 141** widens the idempotency index with the month, since
      several bus months of one receipt share a stop. The importer names the
      migration if the old index refuses an insert.
- [x] Dialog copy, counters and the issue table know the new status; the
      dialog links the guide.
- [x] **Guide**: `apps/erp/public/guides/import-fees-from-old-erp.html`, served
      at `/guides/import-fees-from-old-erp.html`, and a new task in the in-app
      guide for Fees → Payments.

**Deploy:** run `scripts/migrations/erp/migration-141-source-receipt-bus-months.sql`
before the first import that carries a bus-fee column. Nothing else changes
shape.

## 2. June is not a bus month

**Finding.** Every screen priced the bus fee for all twelve session months; the
month strip, the Record Payment picker, dues and the parent portal all showed
and charged June.

**Shipped.** `TRANSPORT_FREE_MONTHS` in `lib/fees.ts` (June). A monthly bus fee
is now always priced month by month, with June at zero, so the annual figure is
eleven charges, "due till date" skips June, the quarter rows read "April – May"
for Q1, the strip and the picker leave June out, and the payments route, the
correction route and the importer refuse it. A quarterly or annual stop fee is
untouched. Checked by `scripts/_test-fee-months.mts`.

**Decision taken:** the rule is a constant, not a setting. The office described
it as the school's rule, and a per-year setting would be one more thing to set
before the first bus fee of a session can be taken. If a second no-charge month
ever appears, it is one line.

## 3. Bus fee for months ahead

**Finding.** It already worked: in Record Payment a grey month is "not yet due"
and could be ticked; the server accepted any session month. Nobody could tell,
and ticking twelve chips one by one for a whole-year payment was not obvious.

**Shipped.** A line under the picker says grey months can be taken in advance,
with **Tick all due**, **Tick rest of session** and **Clear**. The amount fills
in from what is ticked, and the one receipt covers every month.

## 4. Paid/Due lines missing for some students

**Finding.** In the current code the Paid/Due lines and the Outstanding Dues
box are gated on the same state, so one cannot show without the other; the
second photo shows neither. The lines shipped on 20 Nov. A browser window that
was open from before that deploy keeps running the old bundle until it is
reloaded, and the only "new version" nudge the app had was tied to the service
worker, which changes only when the icons do. Two windows on one desk, one
reloaded and one not, is exactly the symptom.

**Shipped.**

- [x] **Build check.** Each app bakes an opaque build token into its bundle
      (`NEXT_PUBLIC_BUILD_ID`, hashed from the deployed commit) and serves it at
      `/api/version`. `PWARegister` asks for it when the tab regains focus (at
      most every five minutes) and every thirty minutes, and shows the existing
      "A new version is available — Reload" toast when it differs.
- [x] **Deep links wait for the session.** `/fees/payments?student_id=…`
      opened the student before the academic year had resolved, which fetched
      the schedule without a year filter and skipped the transport fee. It now
      waits, and an open student is reloaded if the session picker changes.
- [x] The guide text tells the clerk to reload when the lines are missing.

**Not done:** no change to the ledger maths; nothing in the code could make it
appear for one student and not another on the same build.

## Checks run

`pnpm run typecheck` (all three apps), `pnpm run lint`, `check:guide`,
`check:mobile`, `check:colors`, `check:api-auth`, `check:pwa`,
`npx tsx scripts/_test-fee-allocation.mts` (19 pass, five new bus-month cases),
`npx tsx scripts/_test-fee-months.mts` (19 pass). No database was touched.
