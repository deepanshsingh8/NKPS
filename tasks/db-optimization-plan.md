# NKPS database & query optimisation — findings and plan

**Date:** 2026-09-09 · **Branch:** `saas-hardening-2026-09`
**Method:** live measurement against the production Supabase project (service-role + anon, 7-11 runs
per data point, medians reported) plus a full read of `supabase-schema.sql` (77 tables, 262 policies,
116 migrations) and the data layer of all three apps.

---

## 0. Headline: the bottleneck is not what it looks like

The starting hypothesis was *"too many tables, the same data in several places, so queries are slow
and the DB is loaded up."* Half of that is right, but not the half that governs speed.

**Measured, on the live database:**

| Question | Answer |
|---|---|
| How big is the data? | Largest table is `timetable_periods` at **1,377 rows**. `students`/`student_enrollments` are 944. ~40 tables are **empty**. |
| Does table count slow Postgres down? | **No.** Query cost depends on tables *in the query*, not tables in the database. 77 is small. |
| Does joining more tables cost more? | Barely. 1 table 260ms → 4 tables **352ms** in one query. |
| Does splitting into fewer, separate queries cost more? | **Yes, badly.** The same 4-table data as 3 sequential fetches = **804ms**. |

> Collapsing tables would make queries **slower**, not faster: it trades a cheap join for extra
> round trips and destroys constraints. The number of tables is not costing anything today.

**What is actually costing time**, in order:

1. **RLS policies are evaluated once per row.** ~184 per-row helper calls across 161 of 254 policies.
   Measured: `students` costs **+277ms** and `student_enrollments` **+273ms** of pure CPU per query.
2. **Round trips.** ~132ms each. Several pages issue 40-700 of them, some strictly serial.
3. **Payload width.** `students` is 98 columns; `select("*")` ships **2.4MB** where 164KB would do.
4. **No caching anywhere** in the ERP or CMS. Every navigation refetches everything.

And the part of the hypothesis that **is** right: **identity data is genuinely duplicated across five
tables with no synchronisation at all.** That is a correctness problem, not a speed one — and it is
the more dangerous of the two.

---

## 1. Evidence

### 1.1 RLS is the single biggest query cost

Identical query, service-role (RLS bypassed) vs anon (RLS enforced):

```
students             110ms  ->  388ms     +277ms
student_enrollments  113ms  ->  387ms     +273ms
timetable_periods    111ms  ->  111ms       +0ms
fee_structures       109ms  ->  110ms       +0ms
gallery_images       112ms  ->  111ms       -1ms
```

It scales **per row scanned**, which proves per-row evaluation:

```
students, 1 row  (PK lookup)   RLS cost:   +4ms
students, 944 rows (full scan) RLS cost: +209ms
```

**Cause.** Every helper is correctly declared `STABLE`:

```sql
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$ SELECT role FROM public.profiles WHERE id = auth.uid(); $$
LANGUAGE sql SECURITY DEFINER STABLE;
```

...but **no policy wraps the call in a scalar subquery**, so Postgres cannot hoist it:

```
0 of 254 policies use the (SELECT ...) scalar-subselect form.

get_user_role()      ~159 scalar call sites   -> ALL per-row
get_my_student_id()    12 scalar              -> per-row
get_my_teacher_id()    11 scalar              -> per-row
get_my_parent_id()      6 scalar              -> per-row
auth.uid()             64 sites               -> per-row where scalar
get_my_class_ids() /
get_my_children_ids()  45 sites               -> ALREADY FINE (see below)
                      -------------------------------------------
                      ~184 true per-row call sites across 161 policies
```

**Important nuance:** the `IN (SELECT public.get_my_class_ids())` idiom is **already correct** — a
set-returning function inside `IN (SELECT …)` becomes an uncorrelated InitPlan and runs once. Only the
**scalar** calls (`get_user_role() = 'admin'`, `student_id = get_my_student_id()`, `id = auth.uid()`)
are re-evaluated per row. So the fix targets ~184 sites, not all 227.

**Why this is worse here than in a typical Supabase project:** the helpers are `SECURITY DEFINER`, and
Postgres **refuses to inline a SQL function when `prosecdef` is true**. So these can never be folded
into the calling query — every call is a real function invocation running its own `SELECT … FROM
profiles`. Un-wrapped × per-row × non-inlinable is why the measured cost is so high.

`students` has **5 permissive SELECT policies**, each calling `get_user_role()` unwrapped. Postgres
ORs them, so a 944-row scan can call the function ~4,700 times, each doing its own `profiles` lookup.

**Fix:** wrap every call — `(SELECT public.get_user_role())`. Postgres then evaluates it **once** as an
InitPlan. Pure win, no semantic change. **Projected today: ~275ms → ~5ms on the two hottest tables.**

**Why this is urgent:** the cost is linear in table size.

```
   944 students  ->  ~275ms per query   (today)
 2,000 students  ->  ~583ms
 5,000 students  ->  ~1.5s
10,000 students  ->  ~2.9s
```

### 1.2 Round trips dominate everything else

Per-round-trip floor is **~132ms** (the DB origin is far from the client; Cloudflare's edge answers in
10ms but real queries take 132ms). 20 serial queries = 2,269ms; the same 20 in parallel = 367ms.

`(admin)/attendance/page.tsx:159-192` loops over classes with two `await`s inside the loop, strictly
serial, and hits `student_enrollments` — the table with the +273ms RLS penalty. **Simulated against
the live DB:**

```
CURRENT  (64 serial round trips)  : 10.2s
BATCHED  (2 parallel queries)     :  0.52s     -> 19x
```

Worst offenders found:

| Page / operation | Round trips now | Achievable |
|---|---|---|
| Green sheet (40-student class) | ~730 queries | ~10 |
| Report card PDF (1 student, ranks on) | ~400 | ~15 |
| `/attendance` (32 classes) | ~78, **64 serial** | ~12 |
| Teacher dashboard | ~45 | ~10 |
| Any admin page, shell alone | ~11 | ~2 |

`computeFinalResult` (`apps/erp/src/lib/final-result.ts:490-770`) costs ~9 sequential queries per
student, and **6 of the 9 are class-level and identical for every student in the class**.
`green-sheet.ts:178-195` calls it for all N students, then `computeRanksForClass` recomputes all N
again. These fan out via `Promise.all`, so wall-clock is ~9 waves rather than 730×132ms — but it is
still ~730 real queries hammering the connection pooler, which is what will fail first under load.

### 1.3 Payload width

`students` is 98 columns. Live measurement, all 944 rows:

```
select=*          409ms   2,394 KB
7 columns         126ms     164 KB
```

Only **398KB of that 2.4MB is real data** — the rest is repeated column names and nulls. Because:

- **38 of 98 columns are 100% empty.** `blood_group`, `photo_url`, `pen_number`, `apaar_number`,
  `district`, `state`, `caste`, all 5 `caution_money_*`, all 3 `previous_school_{max,obtained,result}`…
- **30 more are under 10% filled.**
- **60 of 98 carry any data at all.**

`apps/erp/src/app/api/students/route.ts:99-103` does `.select("*").range(0, 9999)` — the whole roster,
98 columns wide, on every `/people/students` load. The UI renders 50 at a time via `Array.slice`.

### 1.4 No caching layer exists

Confirmed absent across `apps/erp` and `apps/cms`: no `unstable_cache`, no React `cache()`, no route
`revalidate`, no SWR or React Query. Only `apps/website` uses ISR. An `is_current` academic-year
lookup appears **42 times** across the repo, re-queried on every mount.

Also: 79 of 86 ERP pages are `"use client"`, so nearly every page fetches from the browser after
hydration, serialised behind auth. The admin shell alone fetches the same profile **four independent
times** per page load (`SidebarShell`, `SidebarProfileMenu`, `AppSwitcher`, `useIsAdmin`).

And `proxy.ts:13-17` runs the auth middleware on `/api/*`, where `middleware.ts:103` calls
`auth.getUser()` (a network call) and then **returns early at :108** — a wasted round trip on every
single API request.

### 1.5 Index coverage — 18 missing, 34 redundant

Parsed: 152 FK constraints, 202 explicit `CREATE INDEX`, 126 implicit from PK/UNIQUE.

**Migration 095 (commit 2cef9c1) was mostly right but has two defects:**
- It added `idx_class_tests_class_id`, an **exact duplicate** of the existing `idx_class_tests_class`.
  Both are already redundant against `idx_class_tests_class_subject(class_id, subject_id)` —
  verified: three overlapping indexes on `class_tests.class_id` (schema lines 2863, 2865, 6139).
- It added `exam_schedules(subject_id)` but **missed `exam_schedules(class_id)`**, which today is only
  the second column of a composite and so has no leading index.
- Its claim that "the other 17 sit on small master tables" is wrong for `student_status_history`,
  `teacher_absences`, `transport_change_requests` and `fee_change_audit_log` — all append-only and
  unbounded.

**Missing FK indexes (18).** Postgres indexes PK/UNIQUE automatically but **never foreign keys**, so
every `DELETE FROM profiles` or `DELETE FROM buses` currently seq-scans each child table. Tier 1:
`transport_change_requests` × 6 (`requested_by`, `reviewed_by`, `previous_bus_id`, `amended_bus_id`,
`previous_stop_id`, `amended_stop_id`), `student_enrollments.status_changed_by`,
`student_status_history.changed_by`, `teacher_absences.marked_by`, `fee_change_requests.reviewed_by`,
`historical_corrections.enrollment_id`, `fee_change_audit_log.source_request_id`. Tier 2:
`exam_schedules(class_id)`, `result_masters(grade_scale_id)`, `students(alumni_academic_year_id)`,
`export_events(academic_year_id)`, `buses(conductor_id)`, `elective_slot_options(subject_id)`.

**Redundant indexes (34 droppable).** 8 are exact duplicates of an implicit UNIQUE/PK index; 26 are a
left-prefix of a wider index, which Postgres already serves. Spot-verified two of the riskiest:
`idx_enrollments_student_id` is a left-prefix of `UNIQUE(student_id, class_id)` (schema:419) and
`idx_results_student_id` of `UNIQUE(student_id, subject_id, exam_type_id)` (schema:471). Both drops
are safe. Each redundant index costs write amplification and VACUUM time for nothing.

**Composite gaps vs. the real query shapes** (cross-checked against actual `.eq()/.order()` chains):

| Shape | Call sites | Coverage today | Verdict |
|---|---|---|---|
| `student_enrollments(class_id, status)` ORDER BY `roll_number` | 15 | `(class_id)` only | **Worst gap** — `idx_enrollments_active` leads with `student_id`, so class-roster reads can't use it |
| `student_enrollments(student_id, academic_year_id)` ORDER BY `enrollment_date DESC` | 14 | UNIQUE, no sort support | Sort spills |
| `results(class_id, exam_type_id)` | 7 | `(class_id, subject_id)` + `(exam_type_id)` separately | Real gap — the marksheet path |
| `fee_payments(student_id, academic_year_id)` ORDER BY `payment_date` | 6 | two single-col indexes | Gap |
| `attendance(student_id, class_id, date)` | 4 | `UNIQUE(student_id, class_id, date)` | **Already covered** |
| `marksheet_publications` latest-version | 3 | partial unique index | **Already covered** |

`academic_years.is_current` is unindexed despite 122 call sites — correctly left alone, the table has
2 rows.

---

## 2. The duplication finding — real, and it is the dangerous one

Identity is stored across five tables with **zero database-level synchronisation**. No trigger or
function anywhere copies name/email/phone between them. Propagation is best-effort application code
that exists in **one direction on one edge** (`staff_members` → `teachers`).

| Concept | `profiles` | `teachers` | `staff_members` | `students` | `parents` |
|---|---|---|---|---|---|
| name | `full_name` | `full_name` | `name` | `full_name` | `full_name` |
| email | `email` | `email` | `email` | `email` | `email` UNIQUE |
| phone | `phone` | `phone` | `phone` | `phone` | `phone` |

Creating one teacher writes the same three strings to **four** places
(`apps/erp/src/app/api/users/route.ts:81, 93-99, 158-170, 175-187`).

**Confirmed drift channels:**

- `/portal/settings` lets any user rename themselves in `profiles` only. Nothing propagates.
- `PATCH /api/staff` updates `staff_members` + `teachers` but **never `profiles`** — and
  `(admin)/people/staff/page.tsx:276-291` decides "does this person have a login?" by **string-joining
  `staff_members.email` against `profiles.email`**. Correct an email and the system offers to create a
  duplicate account. Migration 062 already had to repair exactly this class of breakage.
- `mirrorTeacherToStaff` (`staff-teacher-sync.ts:88`) is **defined and never called** — verified zero
  call sites. There is no teacher edit UI and no parent edit UI at all; `parents` rows are write-once.
- `students.father_name` is editable; `parents.full_name` has no edit surface. After the parent invite
  prefill (`people/students/page.tsx:1026-1033`) the two can never be reconciled — and that prefill
  seeds the guardian's phone from **`students.phone`**, the student's own number.
- `is_active` exists on all five and is synchronised by nothing. Deactivating a student leaves their
  login live.

The link *topology* is rigorous — migration 068's unique partial indexes, the role↔link trigger and
the `profile_link_health` view are well built. They guarantee you point at the right row. **Nothing
guarantees the row says the same thing.**

---

## 3. Bugs found while auditing (not performance — correctness)

These were found incidentally and are independently verified. Several are latent because the affected
tables are still empty.

1. **Non-scholastic grades can never appear on a report card.**
   `non_scholastic_assessments.is_published` is `NOT NULL DEFAULT false`; the report card filters
   `.eq("is_published", true)` (`report-card/pdf/route.tsx:518`); **no code path ever sets it true** —
   the upsert omits it (`non-scholastic-assessments/route.ts:195-203`) and there is no publish route.

2. **Elective subjects are invisible to every report and export.**
   Writes go to `student_elective_picks` (`api/electives/students/route.ts:89,112`); every read path
   (`student-roster.ts:300`, `report-query.ts:282`, `students/[id]/export/route.ts:85`) reads
   `student_subjects`. Nothing reconciles them. Filtering a report by an elective silently excludes
   every student who picked it. (Both tables are empty today — fix before they aren't.)

3. **`exam_types.weightage` is dead but looks live.** The admin Exam Types page balances weightages to
   100; the engine reads weightage **only** from `class_exam_configs` (`final-result.ts:542,574`) and
   treats null as zero. An admin who never opens Result Master gets a **zero-weight final result**.

4. **Approved temporary transport changes do nothing.** `effectiveTransport()`
   (`apps/erp/src/lib/transport.ts:64`) has zero importers. A dated bus/stop change is marked
   `approved`, shown to the parent, and consulted by no reader — not assignments, not bus-load, not
   billing.

5. **Schema mirror gap.** `student_enrollments.pickup_address` is used in production code
   (`admin-tables.ts:44,89`, `api/transport/assignments/route.ts:70`, and 3 more) but appears **zero
   times in `supabase-schema.sql`** — it lives only in `migration-053`. A DB rebuilt from the mirror
   would 400 on the transport assignments page.

6. **`max_marks` drift.** `results.max_marks` is copied from `exam_types.max_marks` at write time and
   never backfilled when the exam type is edited. `white-sheet.ts` prints the denominator from one and
   totals from the other.

7. **Teachers see zero `student_subjects` rows.** The policy at schema:391 does
   `class_subject_id IN (SELECT id FROM class_subjects WHERE teacher_id = auth.uid())` — but
   `class_subjects.teacher_id REFERENCES teachers(id)` (schema:351), a **different UUID space** from
   `auth.uid()` (= `profiles.id`). The comparison is always false. Every other policy in the file
   correctly uses `get_my_teacher_id()`. **Verified.**

8. **`has_editor_feature()` is dead at the DB layer.** Defined at schema:845, referenced by **zero**
   policies. All editor gating happens in middleware and `verifyAdminOrEditor()`. It reads as a
   database-level security control that isn't actually enforced there — wire it or drop it.

9. **`supplementary_attempts.passed`** is a stored derivation of the master's pass mark, computed in
   the browser and manually overridable. Change the pass mark and every stored value is stale — and
   `passed=true` is what drives substitution into the final result.

---

## 4. Dead weight (safe to remove, after confirmation)

- **`payment_orders`** — entire table. **Zero source references** repo-wide. Consistent with Razorpay
  being on hold. Also its dependent columns `fee_payments.{payment_order_id, gateway_payment_id,
  gateway_receipt}` (never read or written) and its 4 RLS policies — including a live parent-INSERT
  policy on a table nothing validates.
- **`packages/shared/src/lib/road-distance.ts`** — zero importers, describes a pricing model deleted by
  migration 074.
- **`mirrorTeacherToStaff`** — zero call sites.
- **38 always-null columns on `students`** — keep if UDISE requires them, but they are why the payload
  is 15x its data.

---

## 5. Plan

Ordered by measured impact per unit of risk. **Phases 1-2 are where nearly all the speed is**, and
neither changes the data model.

### Phase 1 — RLS wrapping ★ biggest single win, lowest risk
- [x] **DONE** — `migration-102-rls-hoist-per-row-calls.sql`. Rewritten as a `DO` block over
      `pg_policies` rather than DROP/CREATE by name, because the mirror is stale (see below).
      Covers 15 hot tables; `ALTER POLICY` only, so the policy SET is unchanged. Idempotent.: `public.get_user_role()` →
      `(SELECT public.get_user_role())`, same for the other scalar helpers and `auth.uid()`.
      Leave the `IN (SELECT get_my_class_ids())` sites alone — they are already hoisted.
- [x] **DONE** — verified against live `pg_policies`: covered tables show the hoisted `( SELECT get_user_role() AS get_user_role)` form.
- [x] **DONE** — measured 388ms → 115ms; RLS overhead +277ms → −2ms; the 944-row scan penalty (+209ms) is gone entirely.
- [ ] Consolidate the 5 permissive SELECT policies on `students` into one where the roles allow it.
- [x] **DONE** — bug fix included in 099, written defensively to match on the broken predicate
      rather than the policy name.
- [x] **DONE** — 102/103/104 mirrored. Note the repo
      already has collisions on 008/027/044/050-056/061/086, so re-run the `uniq -d` check on merge).
- **Expected: ~275ms off every `students` / `student_enrollments` query, and it stops scaling with row
  count. This alone is the difference between working at 1,000 students and at 10,000.**

### Phase 2 — Kill the round trips
- [x] **DONE** — 67 round trips → 2 waves. All 7 stat fields preserved field-for-field (verified
      by diff review). Added `.range(0, ROW_CAP)`: the old per-class reads were silently truncated
      at PostgREST's 1000-row default.
- [x] **DONE** — green sheet for 40 students: 887 queries → 18, constant not O(N). Verified by an 861-check differential harness.
      and batching per-student rows via `.in("student_id", ids)`; make `computeFinalResult` pure over
      that context. Share one context between `green-sheet` and `computeRanksForClass`. **~730 → ~10.**
- [x] **DONE** — N + (classSubjects × examTypes) ≈ 33 → 2 parallel queries.
- [x] **DONE** — page cost `3 + N` → flat 4. Also collapsed a duplicate enrollment read in parent/fees.
- [x] **DONE** — `/api/` early-return moved above `auth.getUser()` in `updateSession`. The cookie
      refresh it also carried is not load-bearing for API routes: Bearer handlers never read the
      session cookie, and every cookie-authed handler calls `getUser()` itself. **1 round trip saved
      on every API request.**
- [x] **DONE** — `SessionProvider` hoists `{ user, profile, editorPermissions }` into one fetch for
      the whole shell (`SidebarShell`, `SidebarProfileMenu`, `AppSwitcher`, `useIsAdmin`), with
      profiles + editor_permissions in parallel. **10 requests / 3 serial hops → 3 requests / 2 hops,
      once per page load instead of once per consumer.**
- [ ] **NOT DOING — `cache()` on `loadCaller`.** React `cache` memoizes only inside a render pass;
      Route Handlers are not part of the component tree (`react.react-server`'s `cache` falls through
      to a plain call when no dispatcher is set), and `verify-admin` is used *only* from route
      handlers. It would be a provably dead wrapper. Audited every caller: the multi-`verifyAdmin*`
      files are one call per HTTP method, i.e. one per request. The single real double-call is
      `admin-proxy.ts` :84-89, on the `altKey` retry — a failure path only.
- [x] **PARTLY DONE** — `student/page.tsx` depth 7 → 4 waves. `AdminFeesContent` NOT done.
      `Promise.all`.

### Phase 2b — Indexes (independent of Phase 2, can ship with Phase 1)
- [x] **DONE** — `migration-103-index-coverage.sql`, 25 `CREATE INDEX IF NOT EXISTS`, additive only.
- [ ] **DEFERRED, deliberately.** Dropping based on a stale mirror is unsafe; 100 ships a live
      `pg_index` prefix-coverage query to confirm each one first. Costs nothing on read latency.
- [ ] **Rollout caveat:** `CREATE INDEX` locks against writes. At current table sizes it is sub-second,
      so plain DDL is fine today — but once multi-school data lands, use `CREATE INDEX CONCURRENTLY`,
      which **cannot run inside a transaction block** and must go in a separate non-transactional file.
- [x] **DONE differently** — verified by paired service-role/anon timing and by reading live `pg_policies`, which was cheaper and equally conclusive.
      to `InitPlan 1`.

### Phase 3 — Payload and caching
- [ ] Replace `select("*")` with explicit column lists on `students`, `teachers`, `profiles`,
      `fee_payments`, `result_masters`. **Measured 409ms/2.4MB → 126ms/164KB on the students list.**
- [ ] Server-side pagination for `/people/students`, `/people/users` (currently full pull + `.slice`).
- [ ] Add a shared cache for the four near-static lists refetched everywhere: `academic_years`,
      `classes`, `streams`, `subjects`. Removes ~42 duplicate `is_current` lookups.
- [ ] Move the heaviest pages' initial payload to server components.

### Phase 4 — Correctness bugs (§3)
- [x] **DONE** — publishing a class's results now publishes its co-scholastic rows too; no migration needed.
- [x] **DONE** — picks keep `slot`, the mirror row is what reports read; unmapped subject now hard-fails with a fix-it message.
- [x] **`exam_types.weightage` DONE** — the Result Master grid now seeds from it; a stored value is
      never overwritten (production has 60/15/10/15 on exam types vs 20/15/20/45 on a class — both
      deliberate), only a null is healed.
- [ ] `effectiveTransport()` still dead — approved temporary transport changes have no effect anywhere.
- [x] **DONE** — and lost once to a peer session's branch switch, then recovered from the dangling commit.
- [ ] Recompute `max_marks` / `supplementary_attempts.passed` on master edit, or derive at read time.

### Phase 5 — Identity de-duplication (§2) — design first, no big-bang
- [ ] Make `profiles` authoritative for name/email/phone; the domain tables keep only domain fields.
- [ ] Replace the `staff_members.email` ↔ `profiles.email` **string join** with the existing FK.
- [ ] Add a `identity_drift` view alongside `profile_link_health` so drift is at least *visible*.
- [ ] Delete `mirrorTeacherToStaff` or wire it.
- [ ] Do this **before** the DB fills up. It is far cheaper at 944 students than at 10,000.

### Phase 6 — Structural (small, optional)
- [ ] **DO:** merge `pdf_header_configs` + `pdf_footer_configs` — 1:1 on `template_key`, and
      `getPdfTemplate` currently costs 2 round trips per PDF, called *per student* during bulk finalize.
- [ ] **DO:** drop `payment_orders` + its dead columns and policies.
- [ ] **DON'T** collapse: `timetable_*` (loses the teacher-overlap exclusion constraint),
      `houses`/`streams`/`subjects`/`exam_types` (breaks ~25 FKs and the `ALLOWED_COLUMNS` security
      allowlist), the audit tables (each carries a distinct CHECK; merging would degrade the
      `publish_events` index that sits in the parent-facing result path), `teacher_absences`/
      `substitutions` (1:N parent/child), the CMS family (`section_cards` already *is* the
      polymorphic table).

### Not recommended
- **Do not consolidate tables for speed.** Measured: joins are cheap, round trips are not.
- **Region migration** — the ~132ms floor suggests the DB is far from its users. Real, but it is a
  migration with downtime; revisit only after Phases 1-3, which cut round-trip *count* and matter more.

---

## 5a. Discovered during implementation — the schema mirror is NOT trustworthy

`supabase-schema.sql` is treated as the canonical mirror, but it is **stale in ways that make
name-based migrations dangerous**:

- `migration-erp-redesign.sql` **drops** the original policy names (`"Users can read own profile"`,
  `"Admins can read all students"`, …) and replaces them with a different scheme
  (`profiles_select_own`, `students_select_admin`, …). The mirror contains **zero** of the new names
  and still lists all the old ones. The redesign demonstrably ran — the `teachers` / `parents` /
  `payment_orders` / `notifications` tables it creates are live and populated.
- ~50 policies across `profiles`, `students`, `student_enrollments`, `results`, `attendance`,
  `fee_payments` and `parents` are defined in migrations but absent from the mirror.
- `student_enrollments.pickup_address` is used in production code but absent from the mirror (§3.5).

**Consequence:** the first draft of migration 099 — hand-written `DROP POLICY "<name>"` +
`CREATE POLICY` — would have **dropped nothing and created duplicate policies alongside the live
ones**. Permissive policies are OR-ed, so that would have *widened access*. It was rewritten to
transform `pg_policies` in place via `ALTER POLICY`, which is correct under drift by construction.

**Action needed:** reconcile the mirror against the live catalog. Until then, treat any migration
that references a policy or index *by name* as unsafe.

## 5b. Post-merge verification (measured after 102/103 were applied)

| | before | after |
|---|---|---|
| `students` RLS overhead | +277ms | ~0 (−2ms over 11 runs) |
| `student_enrollments` | +273ms | +9ms |
| 944-row scan penalty | +209ms | ~0 — **no longer scales with the table** |
| `/attendance` batched path | 0.52s | **0.15s** (the two fixes compound) |

**The tail needs no follow-up migration.** The ~90 policies on tables 102 did not
cover were measured with 25 interleaved paired samples (service-role vs anon,
alternating sample-by-sample so drift cancels):

```
fee_structures     service 138ms  anon 115ms   -23ms
disclosure_items   service 113ms  anon 112ms    -1ms
bus_stops          service 112ms  anon 115ms    +4ms
gallery_images     service 129ms  anon 116ms   -13ms
```

All zero. A naive non-interleaved run had suggested +78ms on `fee_structures`;
that was drift, not signal. **Do not spend a migration on the tail** — those
policies are either simple public-read or sit on tables of a few hundred rows.

## 6. Expected outcome

| Surface | Now | After Phases 1-3 |
|---|---|---|
| `/attendance` (32 classes) | ~10.2s | ~0.5s |
| `/people/students` | 2.4MB, ~15 trips | ~164KB, ~8 trips |
| Green sheet (40 students) | ~730 queries | ~10 |
| Any `students` query | +277ms RLS | +5ms, and flat as you grow |

The database does not need restructuring. It needs the policies hoisted, the loops batched, and the
columns narrowed — after which the same 77 tables will comfortably serve 10x the data.
