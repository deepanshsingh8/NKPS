# NKPS → multi-school SaaS: audit findings and roadmap

**Branch:** `saas-hardening-2026-09` (off `main` @ `187f10c`, verified identical to GitHub `origin/main`)
**Date:** 2026-09-09
**Baseline on that commit:** `pnpm typecheck` clean · `pnpm lint` 0 errors / 149 warnings · `pnpm build` all 3 apps green · **0 automated tests**

---

## 0. What this codebase already is

Worth saying plainly, because it changes what the plan should be: this is a **well-built system**, not
a rescue job. Evidence gathered while auditing:

- **Auth is centralised and consistently applied.** 127 ERP API routes; every one calls a verify
  helper except nine, and all nine are deliberate and documented (four static `.xlsx` template
  downloads with no data in them, the token-gated Exotel webhook, the public register/forgot-password
  pair, and the two generic proxies which authenticate inside the shared handler).
- **Authorization is real, not decorative.** `packages/shared/src/lib/verify-admin.ts` fails closed on
  `must_change_password`, and `apps/erp/src/lib/teacher-scope.ts` enforces a teacher's blast radius on
  every write path that accepts a `class_id`/`subject_id` from the request.
- **The generic write proxy is properly locked down.** `packages/shared/src/lib/admin-proxy.ts` gates on
  a table allowlist, a per-table column allowlist, a per-table feature key, editor-restricted actions
  routed into an approval workflow, and a dependency check that refuses cascade-deletes of academic
  records.
- **Two prior audits were done properly.** `tasks/audit-2026-07-23.md` (35 findings) and
  `tasks/security-hardening.md` were applied, and spot-checks confirm the fixes still hold.
- The comments in this codebase explain *why*, not *what*. That is rare and it is why the audit below
  could go deep quickly.

So the work ahead is **not** "fix a broken app". It is: close a small number of genuine bugs, add the
engineering safety net a SaaS needs, and build the tenancy + AI layer that turns one school's ERP into
a product.

---

## 1. Confirmed bugs

Each of these I read the exact code path for. Nothing here is speculation.

### BUG-1 · Dates are computed in UTC for a school that runs on IST — **High**

**Where:** 29 call sites of `new Date().toISOString().slice(0,10)` / `.split("T")[0]`.
The ones that matter:

| File | Line | What breaks |
|---|---|---|
| `apps/erp/src/app/api/fees/payments/route.ts` | 180 | `payment_date` of a recorded payment |
| `apps/erp/src/lib/fee-waiver.ts` | 126 | `payment_date` of a waiver-settlement row |
| `apps/erp/src/lib/student-dues.ts` | 114 | whether an instalment has fallen due |
| `apps/erp/src/lib/report-query.ts` | 318 | "as of today" in every report |
| `apps/erp/src/app/api/dashboard/route.ts` | 15 | today's attendance counts |
| `apps/erp/src/app/api/dashboard/analytics/route.ts` | 292 | dues on the dashboard fee card |
| `apps/erp/src/app/(admin)/attendance/page.tsx` | 70–76 | the register's default date range |

**Why it's wrong:** India is UTC+05:30. `toISOString()` converts to UTC before truncating, so between
00:00 and 05:30 IST every one of these returns **yesterday's date**. Server code on Vercel runs in UTC;
browser code in India hits the same bug because the conversion happens regardless of local zone.

**The scenario that costs money:** a fee collected at 00:30 IST on 1 April is written with
`payment_date = 31 March` — the previous financial year. For an Indian school the 31 March / 1 April
boundary is exactly the date that must not be wrong.

**Worse in one spot:** `attendance/page.tsx:70` does `d.setDate(1)` and *then* `toISOString()`. Run
before 05:30 IST, "first day of current month" evaluates to the **last day of the previous month**, so
the register silently opens on the wrong month.

**Fix:** one shared helper that formats a civil date in the school's timezone, used everywhere. The
timezone becomes a per-school setting later (§3), defaulting to `Asia/Kolkata`.

### BUG-2 · Hot foreign keys have no index — **Medium (becomes High with scale)**

27 FK columns have no index with them as the leading column. Most are on small master tables and don't
matter. These do, and I verified each against the schema by hand:

| Table | Unindexed FK | Why it hurts |
|---|---|---|
| `fee_payments` | `academic_year_id` | every year-scoped fee query, on the largest transactional table |
| `class_tests` | `class_id`, `subject_id` | only `created_by` and `is_published` are indexed today |
| `class_subjects` | `subject_id` | teacher-scope and subject-assignment lookups |
| `timetable_periods` | `subject_id` | timetable and substitution planning |
| `exam_schedules` | `subject_id` | exam timetable build |
| `student_enrollments` | `stream_id` | stream-filtered rosters |
| `marksheet_publications` | `exam_type_id` | publish/finalize checks |

Adding indexes is additive and reversible — the safest possible performance win.

### BUG-3 · No general audit trail — **Medium**

The only audit tables are `fee_change_audit_log` and `call_logs`. Every other privileged mutation is
recorded as a `console.info` line in `admin-proxy.ts:` — which Vercel discards on a rolling window.
A school ERP cannot answer "who changed this student's marks / fee / status, and when". This is both a
trust problem and, under India's DPDP Act, a compliance one. It is already flagged in the code as a
known follow-up ("H22").

### BUG-4 · Rate limiting is per-process, in memory — **Medium**

`packages/shared/src/lib/rate-limit.ts` is honest about this in its own comments. On Vercel every
serverless instance gets its own counter, so the effective limit is `N × max`. Acceptable for one
school; not acceptable once login, forgot-password, and the public chatbot are exposed for many.

---

## 2. What's missing for a sale (the honest gap list)

Verified by grep, not assumption.

| Capability | State | Evidence |
|---|---|---|
| Online fee payment | **Schema only** | `payment_orders` has `gateway CHECK IN ('razorpay','stripe','manual')` and signature columns, but no gateway integration code exists anywhere |
| WhatsApp / SMS notifications | **Absent** | only `wa.me` deep links in constants; no provider |
| Notifications | In-app only | `notifications` table exists; no push, no email fan-out |
| Multi-school tenancy | **Absent** | zero occurrences of `school_id` / `tenant_id` in schema or code |
| Automated tests | **Absent** | 0 test files across 4 packages |
| Observability | **Absent** | no Sentry, no structured logging, no health endpoint |
| AI | One hardcoded chatbot | `apps/website/src/app/api/chat/route.ts` — the entire staff directory, phone numbers and leadership are literals in the system prompt; it has no database access, so it cannot answer a single question about an actual student |

Not present at all, and commonly expected by Indian schools: library, hostel, inventory, HR/payroll,
admissions CRM, biometric attendance, homework/LMS, ID cards, Hindi UI, UDISE+/APAAR exports.

---

## 3. Multi-tenancy: the decision that gates everything

There is no tenant column. Three options:

**(a) One Supabase project per school.** Isolation is absolute and needs no code change. But every
schema change must be applied N times, and there is no cross-school reporting. Onboarding is a
provisioning script.

**(b) `school_id` on every table + RLS.** The textbook answer, and **the wrong one here** — because
`verify-admin.ts` deliberately returns a *service-role* client, RLS is bypassed on essentially every
API path. Tenant isolation would rest entirely on 127 route handlers each remembering to filter. One
missed `.eq("school_id", …)` leaks another school's students. That is a very large, very sharp
surface.

**(c) Schema per tenant.** Middle ground, but Postgres connection pooling and Supabase tooling fight it.

**Recommendation: start with (a), engineered so (b) stays possible.** Concretely, in this order:

1. **Extract school identity into a `school_config` table now** — name, logo, address, affiliation
   number, contact, timezone, currency, grading scheme, fee heads, PDF header/footer, email from-name,
   brand colours. Today these are literals in `packages/shared/src/lib/constants.ts`, the chatbot
   prompt, PDF templates, SEO metadata and the manifest. Doing this *first* is what makes a second
   school possible at all, under any tenancy model.
2. **Automate provisioning**: a script that creates a Supabase project, applies the schema, seeds
   `school_config` and the first admin. Time-to-onboard becomes an afternoon.
3. **Add `school_id` columns and a `current_school()` helper opportunistically**, so that if
   consolidation is ever needed, the data model is already shaped for it.

The white-labelling surface must be inventoried and moved to config before any second school is
signed. That is the single highest-leverage piece of work in this document.

---

## 4. Where AI genuinely helps

Ranked by value × feasibility. All of them read data the ERP already has; none of them are the reason
the ERP works.

**Tier 1 — build first**

1. **Report-card remark generator.** Teacher-facing. Reads marks, attendance and non-scholastic rows
   for one student; drafts two or three sentences in the school's voice; the teacher edits and
   approves. `student_remarks` already exists as the destination. This is the single biggest hour-sink
   in a CBSE term and the output is always human-approved. **S**
2. **"Ask the ERP" admin copilot.** Tool-use over the *existing* API routes, called with the caller's
   own token so `verifyAdminOrEditor` and `teacher-scope` remain the only authority. "How many Class IX
   students haven't paid the July instalment?" already has a route behind it. Guardrail: read-only
   tools in v1. **M**
3. **Natural-language report builder.** The report engine exists (`report-query.ts`,
   `report-fields.ts`); AI only translates a sentence into the filter object it already accepts. Low
   risk because the engine, not the model, fetches the data. **S**
4. **Fee follow-up drafting.** Turns the dues register into per-family messages with tone control,
   queued for one-click human send. Pairs with the WhatsApp provider work. **S**

**Tier 2 — strong differentiators**

5. Document OCR onboarding — TC / marksheet / Aadhaar into structured student rows, admin confirms
   each field. Removes the worst part of switching ERPs, which is also the biggest *sales* objection.
6. At-risk student early warning — attendance slope + marks trend + fee stress → a weekly list for the
   coordinator, with the evidence shown rather than a black-box score.
7. Website admissions assistant that captures leads into a CRM table. The existing chatbot already has
   the shape; today it answers from a hardcoded prompt and captures nothing.
8. Timetable generation and substitution explanation on top of `substitution-availability.ts`.
9. Circular and notice drafting, Hindi + English.
10. CBSE-aligned worksheet / question-paper generation using `cbse-curriculum.ts`.

**Where AI must not go:** computing grades, mutating money, publishing results, or sending anything to
a parent without a human pressing send. The moment a school catches the system inventing a mark, the
product is dead. Every AI write path stays draft-then-approve.

---

## 5. Engineering prerequisites

Ordered by how much they de-risk everything after them.

1. **Tests.** Zero today. The minimum that matters: unit tests on the pure logic where money and grades
   are decided — `final-result.ts`, `grading.ts`, `fees.ts`, `student-dues.ts`, `fee-waiver.ts`,
   `supplementary.ts`. These are deterministic functions; they are cheap to test and they are exactly
   where a silent regression is most expensive.
2. **CI gates on those tests**, alongside the existing lint/typecheck/build.
3. **Audit log table** (BUG-3), written by `admin-proxy.ts` and every privileged route.
4. **Observability** — Sentry, structured request logs, a health endpoint.
5. **Migration tooling** — move from hand-numbered SQL plus a mirrored schema file to Supabase CLI
   migrations. The current scheme already produced one numbering collision that needed a renumber.
6. **Durable rate limiting** (Upstash) — BUG-4.
7. **Staging environment** — there is none; changes go from a branch to the live school.
8. **Job queue** for bulk PDF, imports and notification fan-out.
9. **Role model** — today's `admin / staff / teacher / student / parent` plus feature grants will not
   express principal, accountant, librarian or transport manager cleanly.
10. **DPDP Act compliance** — children's data, consent, retention, and the audit trail in (3).

---

## 6. 90-day plan

Estimates assume one senior engineer working AI-assisted.

**Phase 1 — Stabilise (days 1–30, ~4 eng-weeks)**
- [ ] Fix BUG-1 (IST dates) with a shared helper + a school timezone setting
- [ ] Fix BUG-2 (FK indexes) via an additive migration
- [ ] Audit log table + wire `admin-proxy` and privileged routes into it
- [ ] Unit tests on grading + fees logic; wire into CI
- [ ] Sentry + health endpoint
- [ ] Staging environment

**Phase 2 — Productise (days 31–60, ~5 eng-weeks)**
- [ ] `school_config` table; move every hardcoded school literal into it
- [ ] Provisioning script → new school in an afternoon
- [ ] Razorpay integration against the existing `payment_orders` schema
- [ ] WhatsApp/SMS provider abstraction + fee reminders
- [ ] Durable rate limiting
- [ ] AI #1 (remark generator) and #3 (NL report builder)

**Phase 3 — Differentiate (days 61–90, ~5 eng-weeks)**
- [ ] AI #2 (admin copilot, read-only tools)
- [ ] AI #4 (fee follow-up drafting)
- [ ] Document OCR onboarding
- [ ] At-risk early warning
- [ ] Frontend performance pass (79 of 86 ERP pages are client components fetching in `useEffect`)
- [ ] Second-school pilot

---

## 7. Not yet audited

The audits for these were started and did not finish. They are the known gaps in this document:

- Fees module deep correctness (concurrency, refund netting, instalment math)
- Exams/results deep correctness (grading edge cases, publish/snapshot immutability, rank)
- Portal RLS policy review against `supabase-schema.sql`'s 260 policies
- Frontend performance measurement (bundle weights, waterfalls)
- CMS/website/shared infrastructure review

None of these blocked the findings above, but none should be assumed clean.
