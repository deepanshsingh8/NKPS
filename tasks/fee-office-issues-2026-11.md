# Fee office issues — November 2026

**Source:** "Issues and Problems Faced While Working on the NKPS Portal" (four items,
reported by the fee office). This file checks each one against the code and the live
data, finds the cause, and plans the fix.

**What was checked:** the ERP code at `b7e3c25` (main, includes PR #104), plus
aggregate-only read queries on the **NKPS** Supabase project (no student names
were read). **NKPS-Murlipura** has no fee activity yet (0 transport payments,
0 waivers, 0 fee change requests), so everything below comes from the main campus.

**Ground rule for every fix:** the existing safeguards stay. Editors (the fee
clerk) still can't change a recorded payment or give a discount without an admin
approving it. Refunds still need a super admin. Every correction still writes a
`fee_change_audit_log` row with a reason. The fixes make those controls usable.
They don't remove them.

---

## Shipped — 17 Nov (after the Vice Principal couldn't approve a request)

Code only. Database access stays off unless the owner says otherwise, so the
blocked request itself (filed under the name Shagun) was not looked up. Every
failure route now names its own cause on screen.

- [x] **One discount rule for every path.** `checkWaiverAgainstLedger()` in
      `lib/fee-waiver.ts` is the pure rule (cap + one discount per instalment and
      month). It's used by the direct waiver, the clerk's request (on filing and on
      approval), the bulk concession import, and the inbox.
- [x] **Inbox verdicts (1b).** Every pending discount card carries "Already
      applied — duplicate", "Duplicate of an earlier request", "More than is still
      owed" or "Can't be applied". The dialog explains the problem and disables
      Approve where it can only fail. A duplicate gets a one-click **Reject as
      duplicate** with the note filled in.
- [x] **Approve says why it failed.** A refused discount returns
      `DUPLICATE_WAIVER` / `EXCEEDS_OUTSTANDING` / `WAIVER_INVALID` and the verdict,
      and the inbox pins that explanation to the request.
- [x] **Stuck receipt number.** A discount request drew its receipt number when it
      was filed and reused it on every approval. If another receipt took the number
      in between, the request could never be approved. Approve now draws a fresh
      number on a collision.
- [x] **Duplicates refused at filing (1d, app side).** Filing a discount, and the
      bulk import, now count discounts still waiting for approval. The DB index part
      of 1d is still to do, in migration 139.
- [x] **Discounts shown as discounts (3e, history part).** Admin Payment History,
      the parent and student portals, and the receipt PDF show the discount's value
      ("Discount" / "Discount Allowed"), not ₹0.
- [x] **Registration approval.** "Failed to create user account" is replaced by the
      actual cause: the email already has an account (reject, sign in or use Forgot
      password, Link record), an invalid email, or the sign-in service being busy.
- [x] The rest of Issue 1 (1c, 1e, 1f, 1g) shipped on 20 Nov. See below.

---

## Shipped — 20 Nov (everything else)

Code only, with no database access. Each item is a commit on
`claude/dreamy-noether-wwkb6n`.

| Item | What shipped |
|---|---|
| **New: next-student search** | Payment Management's search now works while a student is open ("Search Another Student"). Typing closes the student and lists matches, and Enter opens the only match. "Back to student list" is always shown, and there is a "Next student" button on the page and on the payment-recorded toast. Closing a student drops `?student_id`, so a refresh no longer reopens them. |
| **Issue 4** (4a–4f) | "Correct Payment": date, mode, mode details, transport month, and a required reason. `POST /api/fees/payments/[id]/correct` replaces `/date`. Admins apply directly (audited); editors file one change request. `paymentMethodDetailIssues()` is the shared rule for record, correct and approve. Locked for discounts, gateway payments and refunded rows. Corrected rows are marked "Corrected", and their receipts say "corrected on <date>". The admin proxy now refuses `fee_payments` writes for everyone. |
| **1a / 1c** | `applyFeeChangeRequest()` / `rejectFeeChangeRequest()` in `lib/fee-change-apply.ts`. `POST /api/fees/change-requests/bulk` handles up to 50, in order. The inbox gets checkboxes, "Select all approvable", "Select duplicates" and Approve/Reject selected. |
| **1e** | Payment History shows "Refund / Correction / Deletion requested"; a fee card shows "₹X discount awaiting approval". |
| **1f / 1g** | Registrations: per-row busy state, and the fallback dialog lists every password. Transport changes: claim → apply → revert on failure, with per-row busy state. |
| **Issue 2** (2a–2e) | Month chips in Record Payment. `months[]` is split oldest month first (`allocateAcrossMonths`), one row per month in one insert, tied by `payment_group_id`, with suffixed receipt numbers and one combined receipt. A month is now required. The transport card shows each month. |
| **Issue 3** (3a–3f) | `computeInstalmentLedger()` matches `computeDuesBreakdown()` to the paisa (randomised check over 3,000 students). A **Quarter-wise** tab on Dues & No-Dues (due till today / whole session, CSV). A Discount column. Per-instalment position on each fee card, and "Unpaid by quarter". "Spread across unpaid" discounts. Change or remove a discount via `PATCH/DELETE /api/fees/discounts/[id]`. |

**Decisions — confirmed by the school on 20 Nov:**
- D1: the request the Vice Principal couldn't approve (Shagun) was on Fee
  Change Requests.
- D2: a discount on a paid instalment is spread over the unpaid ones, in
  proportion to what each owes, with no credit balance.
- D3: admins correct a payment's mode directly (audited); the clerk asks
  for approval.
- D4: quarters by due date, Apr–Jun = Q1.
- D5: an admin rejects the duplicates ("Select duplicates"); migration 139
  skips its index while any remain.
- D6: **yes**: one receipt can cover several instalments and bus months
  together, money clearing the oldest due first and only the last-due fee
  part-paid. Built: Record Payment's "Fees being paid" checklist,
  `items[]` on `POST /api/fees/payments`, `allocateOldestFirst()`, and the
  receipt listing each fee.
- A bus payment must name its month(s).

**To deploy:**
1. Run `scripts/migrations/erp/migration-139-payment-groups.sql` in the
   Supabase SQL editor **first** (both campuses). It adds
   `fee_payments.payment_group_id`, which a multi-month bus payment writes.
   While duplicate discount requests are still pending, it reports that and
   skips only its unique index, so it is safe to run now.
2. Merge and deploy. (Single payments and receipts don't depend on the new
   column, so a deploy that lands first breaks only multi-month bus
   payments, until step 1.)
3. Clear the duplicate discount requests: Fees → Change Requests → Select
   duplicates → Reject selected.
4. Run migration 139 again; this time it creates the index.

**Known limits — fixed on 20 Nov (migration 140):**
- ~~A student who changes stop mid-year is priced at the new stop for the
  whole year.~~ The bus fee is now priced month by month from a transport
  history (`student_transport_periods`). The school chose:
  - a change takes effect from the month it falls in;
  - a student taken off the bus keeps the months they rode billed;
  - temporary changes don't change the fee;
  - Student Assignments asks for an effective date, shows the history, and
    records past changes.

  Every place that prices a bus fee reads the same history: the fee desk,
  the register, both portals, the download gate, the dashboard, the report
  builder, and the payments and correction routes. A bus payment counts for
  its month whichever stop it was taken at. The migration was tested on a
  local Postgres: re-runnable, functions, trigger and RLS.
- ~~A bus payment stored with a yearless month can't be placed.~~ No import
  writes bus payments, so the yearless case can't arise from any current
  flow. Month reading still places "APR"/"April" in its session everywhere.
  The real leftover case, a bus payment with **no** month, is flagged in
  Payment History as "No month · set month".
- Before deploying: run migration 140 on both campuses. Until then
  everything keeps the old pricing, and Student Assignments saves changes
  without a date.
- Nothing was tried in a browser against real data. Checks run:
  typecheck, lint, all repo checks, the production build, scratch tests of
  the new rules (including 2,000 random transport histories reconciled
  against the dues total), and the migration on a local Postgres.

---

## Issue 1 — Approving multiple requests

### Verified

The requests are the **fee change requests** at `/fees/change-requests`. Every
request ever filed (50) is a **discount (waiver) insert**, all filed by one person.
Most were approved in bursts (23 in a single day). **20 are pending right now**:
9 students, filed between 18 Sep and 16 Nov.

If you tried to approve those 20 today:

| Verdict | Count | What happens on Approve |
|---|---|---|
| Approvable as-is | 10 | Works |
| Re-filed copy of a discount that is **already applied** (same student, instalment, amount) | 6 | 409 *"A waiver already exists for this fee…"*. The request goes back to pending and stays in the queue forever |
| Two pending requests for the **same instalment**, same amount (2 pairs) | 4 | The first works. The second fails like the row above |

So about half the queue can't be approved, the error doesn't say "this is a
duplicate, reject it", and the failed request goes back into the queue. That is the
"not working smoothly" part.

### Causes

1. **One at a time only.** Each approval is click card → load detail → Approve →
   reload the whole list (`fees/change-requests/page.tsx:275`). There's no
   multi-select, no bulk action, and no "approve the rest".
2. **Duplicates aren't blocked when filed.** `validateWaiver`
   (`lib/fee-waiver.ts:67`, `:98`) only looks at `fee_payments`. It ignores
   *pending* requests, so the same discount can be filed twice. The
   one-pending-per-row index (`idx_fee_change_requests_one_pending`) is keyed on
   `target_id`, which is NULL for an insert, so it doesn't apply.
3. **Duplicates aren't detected at review.** The card doesn't say "this student
   already has a ₹X discount on this instalment".
4. **The clerk can't see that a discount landed.** Payment History prints a waiver's
   `amount_paid`, which is always 0 (`AdminFeesContent.tsx:2841`), so an applied
   discount reads **₹0 · Waiver**. Re-filing is the natural reaction.

### Same pattern in the other two approval screens (fix alongside, small)

- **Registrations** (`administration/users/page.tsx`): one shared `processingId`
  (`:109`), so a second click clears the first row's spinner. The fallback-password
  dialog holds one password (`:486`), so if two approvals both fail to email, the
  first password is lost. There's also a cap of 30 approvals per hour
  (`registrations/approve/route.ts:47`).
- **Transport changes** (`api/transport/changes/[id]/route.ts:33–77`): the route
  reads `status = pending`, then applies, then writes the status. There's no
  atomic claim, so a double click or two staff members can apply one change twice.
  The page uses the same single `reviewingId` as Registrations.

### Fix

- [ ] **1a. One apply function.** Move the body of `change-requests/[id]/approve/route.ts`
      into `applyFeeChangeRequest(admin, id, reviewer)` in `lib/fee-change-requests.ts`.
      Single approve and bulk approve both call it, so their rules can't drift apart.
- [ ] **1b. Pre-check every pending request.** `GET /api/fees/change-requests?status=pending`
      returns a `verdict` per request (`ok` · `duplicate_of_applied` ·
      `duplicate_of_pending` · `exceeds_outstanding` · `refund_needs_super_admin`),
      computed in one batched pass with the same rules `validateWaiver` uses.
      Each card shows the verdict as a badge, and a duplicate gets a one-click
      **Reject as duplicate**.
- [ ] **1c. Bulk actions.** Checkboxes, plus **Select all approvable**,
      **Approve selected (N)** and **Reject selected (N)**.
      New `POST /api/fees/change-requests/bulk` `{ ids[], action, review_notes }`:
      admin only, at most 50 per call, processed in order through `applyFeeChangeRequest`.
      Each request is re-checked at apply time, so a twin approved earlier in the
      same batch makes the later one come back `duplicate`, not an error. The
      response gives a result per id. The UI shows "17 approved · 3 skipped
      (duplicate)" and removes those rows without a full reload.
      Refund requests are skipped unless the caller is a super admin.
- [ ] **1d. Stop duplicates when filed.** In `POST /api/fees/waivers` (editor branch),
      refuse with *"A discount for this instalment is already awaiting approval"*
      when a pending insert request exists for the same (student, instalment, month).
      Count pending discounts toward the cap. DB backstop (migration 139): a partial
      unique index on `fee_change_requests ((proposed_changes->>'student_id'),
      (proposed_changes->>'fee_structure_id'), coalesce(proposed_changes->>'month',''))
      WHERE status='pending' AND action='insert'`. The index can't be created while the
      two duplicate pairs exist, so the queue gets cleared first (decision D5).
- [ ] **1e. The clerk sees request status.** Replace `pendingRefundIds` with a
      per-payment / per-instalment map of pending requests. Payment History and the
      instalment ledger (3a) show "Discount awaiting approval" or "Date change requested".
- [ ] **1f. Registrations:** per-row busy `Set`; the fallback dialog lists *every*
      password from the session, not just the last one. Make the hourly cap's error
      say how many approvals are left; keep the cap value itself.
- [ ] **1g. Transport changes:** claim first (`UPDATE … SET status='approved' WHERE
      id=? AND status='pending' RETURNING *`), then apply; on failure, revert to
      pending (the pattern the fee route already uses). Per-row busy `Set`.

**Done when:** the current 20 can be cleared in one pass (10 approved, 10 rejected as
duplicates), and a second attempt to file the same discount is refused with a clear
message.

---

## Issue 2 — Bus fee: month not shown, can't pay several months at once

### Verified

- **739** students are on transport this year. Only **7** have any bus-fee payment in
  the ERP (24 rows). The office isn't using the ERP for bus fees.
- Those 7 show the workaround: up to **4 separate entries for one student on one day**,
  one per month. Rows exist for months up to 2026-12, which is advance payment.
- Every stop fee is `monthly` (376 active stop fees).

### Causes

1. **One month per payment, enforced by the server.** `api/fees/payments/route.ts:118`
   rejects any amount above one month's stop fee: *"Amount paid (3000) exceeds the
   bus stop fee amount (1000)…"*. A parent paying April–June together can't be
   recorded as one payment.
2. **Month is optional** (`AdminFeesContent.tsx:3604`, "For Month (optional)").
   The over-collection guard groups payments by month (`route.ts:143`), so all
   month-less bus payments land in one bucket. The second month-less payment is
   rejected as over-collection. A month left blank also shows as "--" in history.
3. **The Month column only shipped on 16 Nov** (PR #104, `3c87096`). If the report
   was written before that was deployed, the office never saw a month column.
   **Check the ERP Vercel deployment includes #104.**
4. **No month-by-month view** of which bus months are paid or due. The transport card
   shows only the monthly rate.

### Fix

- [ ] **2a. Month checklist in Record Payment** (transport lines). Replace the single
      optional month with the session's months (Apr → Mar) as chips, each marked
      Paid / Part-paid ₹x / Due / Advance. The earliest unpaid month is pre-ticked.
      Amount = ticked months × monthly fee, and can be lowered to make the *last*
      ticked month a part-payment. At least one month is required.
- [ ] **2b. API.** `feePaymentSchema` gains `months: string[]` (YYYY-MM, unique,
      inside the academic year, required when `bus_stop_id` is set). The route checks
      each month's remaining balance with the existing per-month guard, then inserts
      **one `fee_payments` row per month** in a single `insert([...])` statement
      (atomic). Dues, reports, the per-month guard and refunds keep working
      unchanged. Rows share a new `payment_group_id` (migration 139) and one receipt
      number with a `/1…/n` suffix per row, like the day-book import does.
- [ ] **2c. One receipt per collection.** `/api/fees/receipt?group_id=` prints every
      row of the group on one receipt: "Transport — For April – June 2026, ₹3,000".
      Payment History groups the rows under one receipt.
- [ ] **2d. Month strip** on the student's transport card: Apr … Mar, coloured
      paid / part / due / not yet due (status colours only: green/amber/red/blue).
- [ ] **2e. Backfill.** The one transport row with no month gets a month through the
      Correct Payment dialog (4a). `month` is already an approvable column.
- [ ] **2f. (Optional, same mechanism)** Let Record Payment take several tuition
      instalments in one receipt (e.g. Q2 + Q3). Say whether you want it (D6).

**Guardrails:** no month outside the session; no month already fully settled;
advance months allowed but labelled "Advance"; a part-payment only on the last
ticked month.

**Known gap, not in scope:** a student who changes stop mid-year is priced at the
new stop's fee for the whole year, because dues are worked out from the stop on
their enrollment *today*. Worth a separate task.

---

## Issue 3 — Discounts and a quarter-wise outstanding report

### Verified

- A discount is a waiver row on **one instalment**, capped at what's still owed on
  that instalment (`fee-waiver.ts:98`). Only one is allowed per (student, instalment,
  month), and month is blank on all 27 waivers, so in practice **one discount per
  instalment, ever**. There's no screen to edit or remove a discount, even though
  the error message tells the user to do that.
- Q1 (and in most classes Q2) is already paid, so a concession decided now can only
  go on Q3 and later. The clerk splits it by hand: **19 of the 20 pending requests
  are one student's discount split across instalments #3, #4 and #5.**
- **Discounts are invisible.** History shows ₹0 (see 1, cause 4). The Outstanding
  Dues card and the register fold discounts into "Paid"
  (`AdminFeesContent.tsx:280`).
- **Nothing is broken down by quarter.** `computeDuesBreakdown` gives one number
  (`billedToDate − paid`, `fees.ts:559`). Money paid ahead on a later quarter counts
  against an earlier quarter's arrear, so the total can read **Nil** while Q2 is
  still unpaid. That's why the office "can't tell which quarter the amount is due
  against". Payments already carry `fee_structure_id`, so a per-instalment figure
  is available. Nothing displays it.
- **Schedule layout:** 14 class schedules have 4 tuition instalments (Apr / Jul /
  Oct / Jan) and 3 have 3 (Apr / Oct / Jan). Tuition `instalment_no` runs **2–5**,
  because 1 is the admission fee. So the quarter has to come from the **due date**,
  not from `instalment_no`.

### Fix

- [ ] **3a. Instalment ledger** on the student's Record & History screen, replacing
      the Applicable Fees cards. One row per line: Instalment · Quarter · Due ·
      Amount · Paid · Discount · Outstanding · Status (Paid / Part / Overdue /
      Not yet due) · Late fee. Transport shows one row per quarter (sum of its months).
      The footer must equal the Outstanding Dues card. Receipts against a line that's
      no longer in the schedule go in an "Unallocated" row, so nothing goes missing.
- [ ] **3b. One pure function** in `lib/fees.ts`:
      `computeLineLedger({ lines, payments, today, yearStartDate, billingCutoff })`
      plus `academicQuarterOf(date, yearStart)` (Apr–Jun = Q1 … Jan–Mar = Q4).
      The ledger, the report and the CSV all use it.
      `computeDuesBreakdown` stays the authority for the headline total, and the
      ledger reconciles to it.
- [ ] **3c. Quarter-wise Outstanding report:** a "Quarter-wise" tab on `/fees/dues`.
      Columns: Adm No · Name · Class · Q1 · Q2 · Q3 · Q4 · Transport · Late fee ·
      Discount · Total outstanding, plus a totals row. Filters: class, "due till
      today / whole session", "only students who owe". CSV and print.
      Reuses the paged reads `computeDues` already makes, with the payment select
      extended by `bus_stop_id, month, payment_method`. A 3-instalment class shows
      "—" under Q2. Guide entry for `/fees/dues` updated.
- [ ] **3d. Discount dialog.**
      - The instalment dropdown shows each line's outstanding amount.
      - New mode: **Spread across unpaid instalments.** Enter the total (or a % of
        tuition). The split goes onto the unpaid instalments with a preview, and the
        user can edit it. For an editor it files one request per instalment, which
        appear in the inbox grouped under the student and are approved together via 1c.
- [ ] **3e. Show discounts as discounts.** History Amount shows `waiver_amount`
      labelled "Discount". A refunded row shows the net. Discount becomes its own
      figure in the Outstanding Dues card and a register column.
- [ ] **3f. Change or remove a discount.** An admin can change or remove one directly
      (audited); an editor goes through a change request (`update` or `delete`,
      which approve already supports). Removing a discount on a paid line reopens
      the due, and the dialog says so.

---

## Issue 4 — Changing the payment mode after entry

### Verified

- There's no way in the UI to change a payment's mode. The pencil on a Payment
  History row only changes the **date** (PR #102). The audit log has **0** mode
  changes, ever.
- The approve route will accept `payment_method` (`approve/route.ts:22`) but doesn't
  check the details that go with it. A cash → cheque request with no cheque number
  would be applied.
- An admin can still rewrite `fee_payments` through the generic `/api/admin` proxy
  with **no audit row**. No screen uses that path (checked).

### Fix

- [ ] **4a. "Correct payment" dialog** (replaces "Change payment date"). Fields:
      date · mode · the details for that mode (cheque no / date / bank, UTR / bank,
      provider / ref) · For month (transport rows only) · reason (required).
      Current values are shown next to the new ones. One request carries all the
      changes, so an editor doesn't hit the one-pending-request-per-payment 409 by
      filing date and mode separately.
- [ ] **4b. API.** New `POST /api/fees/payments/[id]/correct`. Admins apply directly,
      guarded against a concurrent edit, with an audit row. Editors get
      `EDITOR_MUST_REQUEST`, and the UI files a change request. `/date` becomes a
      thin wrapper over the new route.
- [ ] **4c. Shared validation.** Lift the per-mode detail rules out of
      `feePaymentSchema`'s `superRefine` into `checkPaymentMethodDetails()`. Record,
      correct and approve all run it against the *resulting* row (live row + patch).
      Switching mode clears the fields that no longer apply.
- [ ] **4d. Conditions.**
      - **Locked:** waivers; `gateway` payments (verified by the gateway); refunded rows.
      - **Allowed:** `historical_unknown` (day-book imports) can be set to the real mode.
      - Reason is always required. An editor always goes through approval; an admin is
        always audited.
- [ ] **4e. Traceability.** A corrected row carries an "edited" marker in history
      (tooltip: who, when, what). A re-downloaded receipt prints the corrected mode
      and "Corrected on <date>".
- [ ] **4f. Close the unaudited path.** Deny `update`/`delete` on `fee_payments`
      through `/api/admin` for admins too. Corrections, refunds and deletes all have
      audited routes.

---

## Order of work

| Phase | Scope | Why first |
|---|---|---|
| 0 — no code | Clear today's queue: approve the 10, reject the 6 re-files and one of each duplicate pair. Confirm PR #104 is deployed. | Unblocks the office now |
| 1 | Issue 1 (1a–1g) + 3e (show discounts) | Small. Fixes the daily pain and the cause of re-filing |
| 2 | Issue 4 | Self-contained; reuses the date-correction pattern |
| 3 | Issue 2 + migration 139 | Biggest behaviour change at the counter |
| 4 | Issue 3 (3a–3d, 3f) | Builds on 2's per-month transport data |

**Migration 139** (`scripts/migrations/erp/`, re-runnable, mirrored into
`supabase-schema.sql`): `fee_payments.payment_group_id uuid` + index, and the pending
discount unique index from 1d. No new views, so no grants to add.

**Verification for every phase:** `pnpm run typecheck`, `lint`, `check:guide`,
`check:mobile`, `check:colors`, then a browser pass as admin **and** as a staff editor
with the `fees` grant. There's no test suite. Phase 4's ledger must reconcile to the
register's total for every student in one real class.

---

## Decisions needed

- **D1 — Which approval screen.** The data points to Fee Change Requests. Confirm
  the office didn't also mean Registrations or Transport changes (both get the
  small fixes in 1f/1g either way).
- **D2 — Discount on an instalment that's already paid.** Recommended: spread it over
  the unpaid instalments (3d), with no credit balance. Alternatives are carrying a
  credit forward (a new ledger concept) or refunding (the super-admin path).
- **D3 — Who may change a payment mode.** Recommended: admin direct (audited),
  editor through approval. Alternative: two people for everyone, including admins.
- **D4 — Quarters.** Recommended: by due date, academic quarters Apr–Jun … Jan–Mar.
  The 3-instalment classes then have no Q2 instalment.
- **D5 — Existing duplicates.** Reject them by hand with the new "Reject as
  duplicate" (recommended), or have migration 139 auto-cancel exact duplicates
  before creating the index.
- **D6 — Several tuition instalments on one receipt** (2f): yes / not now.
