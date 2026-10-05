# Multi-role closed-cycle audit + super-admin refund approval — 2026-10-05

Scope (user request): verify the ERP's closed cycles across roles — teacher
writes → student + parent portals see it; admin builds a timetable → teacher
sees it on login — and make fee **refunds** a two-step operation: anyone who is
not a *super admin* (Kuldeep Singh, KPS Rajavas, Deepansh) files a refund
request; only a super admin approves it, and only then does the payment flip
to `refunded` (and the student's dues move). Both production DBs (NKPS main +
Murlipura) run the same code, so every DB change ships as a re-runnable
migration applied to both.

## Findings — what exists today

- A fee change-request workflow already exists (migration 056, `tasks/fee-edit-approval.md`):
  editors cannot refund directly; they file `fee_change_requests`; **any admin**
  approves. Approval applies the patch atomically, stamps `refunded_by` from the
  approver, writes `fee_change_audit_log`.
- Dues already net refunds (`apps/erp/src/lib/student-dues.ts:201`,
  `lib/fees.ts:400`), so an approved refund reaches the dues register,
  receipts and the parent/student fee views with no further work.
- There is **no super-admin concept** anywhere (`profiles.role` is
  admin|staff|teacher|student|parent). Every admin can refund directly and
  approve any request. That is the gap.
- Side finding: `/administration/users` toggles `is_active` from the browser
  client (`page.tsx:339`), but migration 061 grants `authenticated` UPDATE on
  only `full_name, phone, avatar_url` — the toggle cannot work. Route it
  through `/api/users` PATCH if it is wired to a button.
- Teacher→student/parent and timetable legs: see "Cycle audit" below (filled
  from the two read-only audits).

## Design — super admins

- `profiles.is_super_admin boolean NOT NULL DEFAULT false` (migration 135,
  `base/`). Locked like the other privilege columns: added to
  `guard_profile_privileged_cols()` as **service-role-only** (even a browser
  admin cannot flip it; the column grant already excludes it). A trigger
  clears it whenever `role` leaves `admin`, plus a CHECK so the pair can never
  disagree.
- Server: `verify-admin.ts` loads `is_super_admin`; `verifyAdminWithUser` and
  `verifyAdminOrEditorWithUser` return `isSuperAdmin`; new
  `verifySuperAdminWithUser()`.
- Refund route: direct refund only for super admins. Everyone else (editor or
  plain admin) gets the existing structured 403 and the UI files a request.
- Approve/reject: a **refund** request (`proposed_changes.status ===
  'refunded'`) needs a super admin. Other requests (editor edits, deletes,
  waivers) stay admin-approvable — the user asked for refunds specifically, and
  routing every editor edit to three people would stall fee desks.
- Grant/revoke on `/administration/users`: a "Super admin" toggle on admin
  rows, visible to super admins. Bootstrap: while **no** super admin exists,
  any admin may set the first one (there is no other way in without SQL);
  after that only super admins may change it, and the last one cannot be
  removed. Every change is audited (`user.super_admin_change`).
- UI: refund dialog copy/button flips to "Submit Refund Request" for
  non-super-admins; payment rows show "Refund requested" while a request is
  pending; the change-requests inbox shows "Needs super admin" on refund cards
  and hides Approve/Reject from admins who cannot act.

## Tasks

### A. Super-admin refund approval
- [x] A1. Migration `base/migration-135-super-admins.sql` (column, guard fn,
      role-sync trigger, CHECK) + mirror in `supabase-schema.sql`
- [x] A2. `verify-admin.ts`: `isSuperAdmin` on the WithUser helpers; `verifySuperAdminWithUser`
- [x] A3. `audit-log.ts`: `user.super_admin_change` action; label on the audit page
- [x] A4. `/api/users` PATCH: `{ id, is_super_admin }` branch (bootstrap rule, last-one guard, audit)
- [x] A5. Refund route: super admin only; others → `EDITOR_MUST_REQUEST` (message updated)
- [x] A6. Approve + reject routes: refund requests need a super admin (`lib/fee-change-requests.ts` helper)
- [x] A7. `SessionProvider` loads `is_super_admin`; `useIsSuperAdmin()` hook
- [x] A8. `AdminFeesContent`: non-super-admins file requests; "Refund requested" chip on pending rows
- [x] A9. Change-requests page: super-admin gating of Approve/Reject, "Needs super admin" badge, copy
- [x] A10. Users page: Super admin toggle on admin rows; fix `is_active` toggle to go through the API
- [x] A11. Guide registry entries (`/fees`, `/fees/change-requests`, `/administration/users`)
- [x] A12. `pnpm run typecheck`, `lint`, `check:guide`, `check:mobile`, `check:colors`

### B. Cycle audit fixes — teacher → student/parent
- [x] B1. Student attendance / dashboard / calendar pick the current enrollment (not an arbitrary `limit(1)` row) — `student/attendance`, `student/page.tsx`, `student/calendar`
- [x] B2. Class-teacher remark rendered on screen in `student/results` and `parent/results` (already in the report-card JSON)
- [x] B3. Non-scholastic grades reach the portals: report-card JSON carries published NS grades; both results pages render them
- [x] B4. Class tests reach the portals: a "Class Tests" block on both results pages (RLS already exists; teacher Publish toggle currently publishes to nobody)
- [x] B5. Migration 136: `student_remarks` student/parent SELECT gated on `is_published`; `supplementary_attempts` student SELECT policy (parent already has one)
- [ ] B6. (deferred, policy call) teachers may silently overwrite *published* marks (`results/bulk/route.ts:159-167`) — route through unlock or log a publish event

### T. Cycle audit fixes — timetable
- [x] T1. Teacher timetable + dashboard scoped to the current academic year's classes (admin route already does this)
- [x] T2. Teacher timetable derives period rows from data (zero period / 9th period were dropped by the fixed 1–8 list)
- [x] T3. Substitutions reach the covering teacher: migration 136 teacher SELECT on `substitutions` + `teacher_absences` (own rows); teacher dashboard shows today's cover periods; timetable marks covered periods
- [x] T4. Unlinked teacher login shows "your login is not linked to a teacher record" instead of "No timetable configured yet"
- [x] T5. Migration 136: `timetable_periods` SELECT restricted to signed-in users (was `USING (true)` — readable with the anon key)

### C. Operator steps (cannot be done from this session — production reads/writes are blocked)
- [x] C1. Migrations 135 + 136 applied to **both** projects on 2026-10-05 (main `duwvcanuntblisqyftnh`, Murlipura `dcdvxhdxodflkpmhhqoj`); column, triggers and all six policies verified live
- [~] C2. Main: Deepansh Singh, Kuldeep Singh and NKPS Rajawas are super admins (set 2026-10-05; they are the only three admins there). **Murlipura: 0 super admins** — its admins are Chitra Raje Basera, "NKPS Admin" and "NKPS Murlipura Admin"; any of them can set the first super admin from Users & Access once the code is deployed, and refunds there queue until one is set.
- [ ] C3. Browser pass: editor refund → request; plain admin refund → request; super admin approves → payment `refunded`, dues drop, parent fee view updates

## Cycle audit — verdicts

| Leg | Verdict | Evidence |
|---|---|---|
| Teacher marks → student/parent | CONDITIONAL on admin publish (`/exams/publish`) | `report-card.ts:198-206` filters `is_published`; teacher UI has no publish control |
| Teacher attendance → parent | WORKS | `parent/attendance:172-176` orders enrollments correctly |
| Teacher attendance → student | GAP for returning students | `student/attendance:80-85` `limit(1)` with no order/year |
| Class-teacher remark → portals | GAP on screen, PDF only | `report-card.ts:282-294` emits it; portal pages drop it |
| Non-scholastic grades → portals | GAP | no JSON path; PDF block only in result-master branch portals never request |
| Class tests → portals | GAP | no student/parent reader of `class_tests*` |
| PTM notes → parent | WORKS | `parent/ptm` via `/api/ptm-notes` |
| Admin timetable → teacher | CONDITIONAL on `profiles.teacher_id` link; not year-scoped; periods 1–8 only | `teacher/timetable/page.tsx:22,54-60` |
| Admin timetable → student/parent | WORKS (year-scoped, elective-aware) | `student/timetable:56-110`, `elective-timetable.ts` |
| Substitution → covering teacher / students | GAP | RLS admin-only (`schema:4062-4073`); no portal reader |
| Refund approval | GAP (any admin) | `approve/route.ts` used `verifyAdminWithUser` |

## Review — 2026-10-05

**Shipped on branch `claude/super-admin-refund-approval` (uncommitted, 31 files):**

- **Super admins (migration 135, `base/`).** `profiles.is_super_admin`, locked
  to the service role in `guard_profile_privileged_cols()` (a browser admin
  session cannot flip it; verified: "permission denied for table profiles"),
  auto-cleared when role leaves admin (trigger + CHECK; verified). Granted on
  Users & Access → "Super admin" button on admin rows; bootstrap lets any admin
  set the first one; last one cannot be revoked; audited as
  `user.super_admin_change`.
- **Refund gate.** `/api/fees/payments/[id]/refund` is super-admin-only; every
  other caller gets the structured 403 and the dialog files a request.
  Approve/reject of a *refund* request (status → refunded) is super-admin-only;
  other requests (edits/deletes/waivers) stay with any admin. Inbox shows
  "Needs super admin"; payment rows show "Refund requested" while pending.
  Dues already net refunds, so approval is the moment the student's balance
  moves.
- **Side fix.** Users page activate/deactivate now goes through `/api/users`
  (the browser UPDATE was refused by the migration-061 column grant).
- **Teacher → student/parent.** Current-enrollment helper for the three student
  pages; class-teacher remark on screen; non-scholastic grades in the
  report-card JSON + both results pages; "Class Tests" block on both results
  pages (shared components in `components/results/ResultExtras.tsx`).
- **Timetable.** Teacher week + dashboard year-scoped; period rows derived from
  data; unlinked-login message; "Today's cover periods" on the dashboard and
  cover/absent markers on the grid, backed by migration 136 RLS.
- **Migration 136 (`erp/`).** timetable_periods read → signed-in only;
  teachers read their own substitutions/absences (SECURITY DEFINER lookup
  avoids policy recursion); remarks publish-gated; students read own
  supplementary attempts. All four verified on a local Postgres 14 with the
  consolidated schema loaded: covering teacher sees 1/1, absent teacher 1/1,
  unrelated teacher 0/0, anon 0 periods, student/parent see only the
  published-exam remark.

**Verification:** `pnpm run typecheck` clean (after regenerating a stale
`.next/dev/types` stub that referenced a removed `auth/confirm/route`), lint
0 errors (141 pre-existing warnings), check:guide / check:mobile /
check:colors / check:pwa OK, both migrations parsed with pglast and applied
twice each (re-runnable). Not done: a signed-in browser pass — the dashboard
is behind Supabase login; C1–C3 above are the operator steps.

**Deliberately out of scope / decisions:**
- Only *refunds* need a super admin. Editor edits, deletes and waiver inserts
  still go to any admin — routing them to three people would stall the desk.
  Flip `canReview` + the two routes if the school wants all of them escalated.
- Admin direct edits of fee_payments through the admin proxy are still
  unaudited beyond `admin_proxy.update` in the general audit log (v2 from
  `tasks/fee-edit-approval.md`).
- B6 (teachers can overwrite published marks silently) is a policy call left
  open.
- The pre-existing ordering errors when loading `supabase-schema.sql` from
  scratch (top-of-file DROPs, `has_editor_feature`, `security_invoker` on
  PG14) are unrelated to this change and were not touched.
