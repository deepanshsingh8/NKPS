# ERP Bug & Incomplete-Features Audit — 2026-04-24

Comprehensive audit of the NKPS ERP (auth, exams, results, publish, students, fees, TC, registrations, schema). Each item has a checkbox — tick it the moment the fix lands (not at end of session). File:line refs are starting points; grep/read before editing.

Work order: **Critical → High → Medium → Low → Incomplete features**. Don't re-order inside a severity band without a reason.

---

## Critical

- [ ] **C1. Public TC storage bucket — all student TCs downloadable without auth**
  - Files: `src/app/api/erp/transfer-certificates/generate/route.tsx:180–184`, `src/app/api/transfer-certificates/route.ts`
  - TC PDFs written via `getPublicUrl()`; public route unauthenticated. URL guessable/enumerable.
  - Fix: move to private bucket; serve via signed URL from an authenticated route enforcing admin or self/parent ownership.

- [ ] **C2. Link-child endpoint is brute-forceable**
  - File: `src/app/api/erp/parents/link-child/route.ts`
  - Only gate is `admission_no` + DOB. No rate limit, no CAPTCHA, no lockout. Lets any parent account enumerate + link any student.
  - Fix: per-parent rate limit (≤ 5 / 30 min), lockout after N failures, log failed attempts, optional CAPTCHA.

- [ ] **C3. Marksheet snapshot ignores result-master final result**
  - Files: `src/lib/marksheet-snapshot.ts:45–76`, `src/app/api/erp/results/report-card/pdf/route.tsx:107`
  - `buildMarksheetSnapshot` captures per-exam rows only; never calls `computeFinalResult`. Finalized marksheets are not actually frozen — post-finalize edits silently rewrite them.
  - Fix: extend `MarksheetSnapshotV1` with `finalResult` + `resultMasterSummary`; compute at finalize; PDF renders from snapshot only; branch on `schema_version`.

- [ ] **C4. Registration approval — race condition creates duplicate users**
  - File: `src/app/api/erp/registrations/approve/route.ts:56–61` (check) vs `:172` (update)
  - Status check and update aren't atomic; two concurrent approvals create two auth users.
  - Fix: atomic claim — `UPDATE registration_requests SET status='approved' WHERE id=? AND status='pending' RETURNING *`; proceed only if a row came back.

- [ ] **C5. Editor self-elevation latent bug on `/api/admin/editor-permissions`**
  - File: `src/app/api/admin/editor-permissions/route.ts:36–134`
  - `verifyAdmin()` blocks editors today, but no check stops the actor from modifying their own `editor_id` row if gate ever softens to `verifyAdminOrEditor`.
  - Fix: reject `editorId === actingUserId`; add structured audit log (actor + diff).

- [ ] **C6. No ownership check on `POST /api/erp/class-tests/[id]/marks`**
  - File: `src/app/api/erp/class-tests/[id]/marks/route.ts:36–158`
  - Role checked; assignment not. Any teacher can mutate any other teacher's marks. `entered_by` audit becomes unreliable.
  - Fix: fetch `class_tests` → join `class_subjects` with actor's `teacher_id`; reject if not assigned.

- [ ] **C7. Duplicate migration number `025`**
  - Files: `scripts/migration-025-publish-workflow.sql`, `scripts/migration-025-roll-number-auto.sql`
  - Same prefix; lexical-order runners may skip one.
  - Fix: rename roll-number file to `scripts/migration-026-roll-number-auto.sql`. Content already mirrored in `supabase-schema.sql`, so pure rename is safe.

---

## High

- [ ] **H1. `must_change_password` flag bypassable via API**
  - Files: `src/lib/supabase/middleware.ts:91–100` vs `src/lib/verify-admin.ts`
  - Middleware enforces on UI; API helpers don't. User with forced-reset still hits `/api/erp/**` with a bearer token.
  - Fix: `verifyAdmin*` reads `must_change_password` in the same profile query; returns null (distinct status) if set.

- [ ] **H2. No rate limit on `/api/portal/forgot-password`**
  - File: `src/app/api/portal/forgot-password/route.ts`
  - Unlimited resets per IP/email; timing side-channel leaks which emails exist.
  - Fix: IP + email rate limit (3 / 15 min); constant-time response (≥ 500 ms).

- [ ] **H3. No rate limit / CAPTCHA on `/api/erp/register` and `/api/contact`**
  - Files: `src/app/api/erp/register/route.ts`, `src/app/api/contact/route.ts`
  - Admin queue flooding, DB bloat, email quota burn.
  - Fix: per-IP limit (5/hour), hCaptcha, honeypot.

- [ ] **H4. No rate limit on `/api/chat`**
  - File: `src/app/api/chat/route.ts`
  - Attacker can drain Claude API quota.
  - Fix: IP rate limit; require session; per-session budget guard.

- [ ] **H5. `max_marks_override` is dead code**
  - Files: `src/lib/final-result.ts:509–514`, `src/components/admin/result-master/helpers.ts:89`
  - UI writes `class_exam_configs.max_marks_override`; `computeFinalResult` reads `max_marks` from `results` row and ignores it.
  - Fix: consume override in the result engine, or remove the UI surface.

- [ ] **H6. Class tests never flow into the final result**
  - Files: `src/lib/final-result.ts:222–223`; never reads `class_test_results`
  - `class_test_best_of` filters exam_configs by kind, but actual class-test marks live in a separate table that the engine never queries.
  - Fix: extend `computeFinalResult` to join `class_test_results`, or unify into the `results` table.

- [ ] **H7. `/api/erp/results/bulk` doesn't verify teacher teaches subject/class**
  - File: `src/app/api/erp/results/bulk/route.ts:6–113`
  - Fix: pre-check via `class_subjects` join.

- [ ] **H8. `/api/erp/attendance/bulk` same flaw**
  - File: `src/app/api/erp/attendance/bulk/route.ts:16–28`
  - Fix: verify caller is class_teacher or subject teacher of `class_id`.

- [ ] **H9. `/api/erp/non-scholastic-assessments` same flaw**
  - File: `src/app/api/erp/non-scholastic-assessments/route.ts:53–62`
  - Fix: same pattern as H7.

- [ ] **H10. Report-card PDF passes wrong `academicYearId` in legacy branch**
  - File: `src/app/api/erp/results/report-card/pdf/route.tsx:145`
  - Legacy path filters attendance by `academic_year.is_current`; passing `academicYearId` corrupts that filter.
  - Fix: pass `null` in legacy mode.

- [ ] **H11. Result-Master Preview tab "Download sample PDF" 404s**
  - File: `src/components/admin/result-master/PreviewTab.tsx` (per `tasks/phase-3-result-master.md` §7)
  - Fix: update link to the corrected PDF route, or disable until a student is loaded.

- [ ] **H12. Grade-band boundary ambiguity**
  - File: `src/lib/grading.ts:48`
  - Inclusive-inclusive match + seeded defaults like `80.00–89.99` / `90.00–100` ⇒ raw 89.949 rounded half-up jumps A→A+.
  - Fix: inclusive-exclusive (`>= min && < max`) for all but top band; or enforce edge-disjoint bands in UI.

- [ ] **H13. SSRF in admit-card PDF photo fetch**
  - File: `src/app/api/erp/admit-cards/pdf/route.tsx:30–43`
  - Server blindly `fetch()`es `students.photo_url`. No scheme/host/timeout guard.
  - Fix: allowlist Supabase storage host; enforce `https:`; 5s timeout; reject private-net.

- [ ] **H14. Marks/amount schemas accept `Infinity` / `NaN`**
  - File: `src/lib/validations.ts` — `resultsBulkSchema` (L61), `classTestMarksBulkSchema` (L112), `feePaymentSchema` (L153)
  - Fix: add `.finite()` on every `z.number()` that represents marks or money.

- [ ] **H15. Registration approval returns plaintext password in response**
  - File: `src/app/api/erp/registrations/approve/route.ts:199–211`
  - Password captured in network logs / browser history / error reporters.
  - Fix: return only `user_id`; email channel only.

- [ ] **H16. Promotion silently duplicates enrollments**
  - File: `src/app/api/erp/students/promote/route.ts:162`
  - `upsert({ ignoreDuplicates: true })` returns `count: null`; code reports `newEnrollments.length` as "success."
  - Fix: pre-check `(student_id, class_id)` in target year; hard-error on conflict.

- [ ] **H17. TC generation + student closure not atomic**
  - File: `src/app/api/erp/transfer-certificates/generate/route.tsx:186–226`
  - Failure after insert leaves student active with TC on record.
  - Fix: Postgres function for the combined op, or reverse order + rollback on failure.

- [ ] **H18. TC has no draft/review state**
  - Files: same as H17; `transfer_certificates` schema
  - Fix: add `status in ('draft','issued','revoked')`; default `draft`; separate publish action.

- [ ] **H19. `migration-015-grade-master.sql` missing `IF NOT EXISTS`**
  - File: `scripts/migration-015-grade-master.sql:7, 22, 38`
  - Breaks re-run on dev/staging.
  - Fix: add `IF NOT EXISTS` to the three CREATE TABLE statements.

- [ ] **H20. `migration-014-results-marks-check.sql` ALTER ADD CONSTRAINT not idempotent**
  - File: `scripts/migration-014-results-marks-check.sql`
  - Fix: `DROP CONSTRAINT IF EXISTS results_marks_in_range;` before `ADD CONSTRAINT`.

- [ ] **H21. Admission-no collision in registration approval**
  - File: `src/app/api/erp/registrations/approve/route.ts:99`
  - Defaults to `email.split("@")[0]` — two `rahul.gupta@*` addresses collide.
  - Fix: generate deterministic unique admission_no (year + DB sequence); reject on conflict.

- [ ] **H22. `/api/admin` generic proxy is over-powered**
  - File: `src/app/api/admin/route.ts:56–154`
  - Admin-gated insert/update/delete on any ALLOWED_TABLES row by column match; no per-table rule, no audit.
  - Fix: per-table rules, structured audit log, consider deprecating for purpose-built endpoints.

- [ ] **H23. Audit admin-only API counterparts of ADMIN_ONLY_PREFIXES**
  - Files: `src/app/api/erp/grade-scales/**`, `src/app/api/erp/pdf-templates/**`, `src/app/api/erp/non-scholastic/subjects/**`, `src/app/api/erp/result-masters/**`
  - Must use `verifyAdmin()` (not the `OrEditor` variant). Spot-check; enforce everywhere.

---

## Medium

- [ ] **M1. No ownership check on `PATCH/DELETE /api/erp/class-tests/[id]`**
  - File: `src/app/api/erp/class-tests/[id]/route.ts:9–102`
  - Fix: verify teacher owns (class, subject) before mutation.

- [ ] **M2. `/api/erp/results/remarks` — class-teacher check only, not subject-scoped**
  - File: `src/app/api/erp/results/remarks/route.ts:120–139`
  - Fix: decide — document remark as class-level, or add subject-scope check.

- [ ] **M3. Snapshot `schema_version` unused by consumer**
  - File: `src/app/api/erp/results/report-card/pdf/route.tsx:107`
  - Fix: explicit version switch; reject unknown versions.

- [ ] **M4. Finalize-marksheet is best-effort, not atomic**
  - File: `src/app/api/erp/results/finalize-marksheet/route.ts:62–119`
  - If new version insert fails after prior unpublish, student is in limbo.
  - Fix: build all snapshots in-memory first; batch insert; re-publish prior on any error.

- [ ] **M5. Auto-unpublish reason on re-finalize is hardcoded `"re-finalized"`**
  - File: `src/app/api/erp/results/finalize-marksheet/route.ts:86`
  - Fix: require `unpublish_reason_on_refinalize` from client when a prior active snapshot exists.

- [ ] **M6. Timetable has no conflict detection**
  - Files: `src/app/admin/timetable/page.tsx`; no API validation
  - Fix: partial unique on `(teacher_id, day, period_number) WHERE teacher_id IS NOT NULL`; also `(class_id, day, period_number)`.

- [ ] **M7. Attendance accepts future dates and ignores holidays/Sundays**
  - File: `src/app/api/erp/attendance/bulk/route.ts:40–70`
  - Fix: reject `date > today`; cross-reference `calendar_events`; at minimum skip Sundays.

- [ ] **M8. Fee structure not scoped to student's class**
  - File: `src/lib/fees.ts:29–50`
  - Filters by stream only. A Class XI student can be charged Class XII fees.
  - Fix: join `student_enrollments → classes`; filter on `class_name`.

- [ ] **M9. Fee lifecycle stubs**
  - Files: `src/app/api/erp/fees/payments/route.ts`, `src/types/index.ts:506`
  - Enum includes `partial/failed/refunded`; app only writes `paid`; no waiver/refund UI.
  - Fix: implement or narrow the enum.

- [ ] **M10. Avatar upload — no MIME/size check**
  - File: `src/app/api/portal/avatar/route.ts:24–75`
  - Forces `contentType: "image/jpeg"` regardless of actual bytes.
  - Fix: magic-byte sniff; 5 MB cap; reject SVG.

- [ ] **M11. `/api/admin/upload-url` signs for any bucket/filename**
  - File: `src/app/api/admin/upload-url/route.ts`
  - Fix: per-bucket MIME/size allowlist validated before signing.

- [ ] **M12. Supabase raw errors returned to clients**
  - Files: many (e.g. `src/app/api/erp/class-tests/[id]/marks/route.ts:28`)
  - Leaks column/table names.
  - Fix: generic message to client; `console.error` raw for server.

- [ ] **M13. Non-scholastic assessment text length unbounded**
  - File: `src/lib/validations.ts:75–86`
  - Fix: `.max(500)` on `grade_label`, `remarks`.

- [ ] **M14. Division / White-Sheet / Green-Sheet / Supplementary — spec'd, not built**
  - Files: `tasks/exam-department-expansion.md` (Appendices, Phases 6–8); no code
  - Decision: scope for a later phase; mark UI as "pending" so schools know.

- [ ] **M15. Admit card has no QR / barcode**
  - File: `src/components/pdf/AdmitCardPDF.tsx`
  - Fix: embed QR (student_id + exam_type_id).

- [ ] **M16. Per-class non-scholastic sub-subjects not modelled**
  - Schema: global `non_scholastic_sub_subjects`; no class scoping.
  - Fix: add nullable `class_id` or a join table.

- [ ] **M17. Non-scholastic placement options render as placeholder**
  - File: `src/components/pdf/ReportCardPDF.tsx`
  - `below` / `above` / `separate_page` all show "Not yet recorded."
  - Fix: implement all three branches; pull live data.

- [ ] **M18. `/teacher/results` never surfaces final-result computation**
  - File: `src/app/teacher/results/page.tsx`
  - Fix: "Preview final result" button that calls the same `computeFinalResult` path.

- [ ] **M19. `/teacher/non-scholastic` blank grid when no sub-subjects configured**
  - File: `src/app/teacher/non-scholastic/page.tsx`
  - Fix: empty-state message.

- [ ] **M20. Phase 4+ tables lack TypeScript interfaces**
  - File: `src/types/index.ts`
  - Missing: `grade_scales`, `grade_bands`, `class_grade_scales`, `class_exam_configs`, `pdf_header_configs`, `pdf_footer_configs`, `exam_schedules`, `admit_card_templates`, `result_masters`, `result_master_subjects`, `non_scholastic_subjects`, `non_scholastic_sub_subjects`, `non_scholastic_assessments`, `class_tests`, `class_test_results`, `marksheet_publications`, `publish_events`.
  - Fix: add interfaces mirroring DB columns.

- [ ] **M21. `updated_at` triggers missing on 15 Phase 4+ tables**
  - Tables: `grade_scales`, `class_exam_configs`, `pdf_header_configs`, `pdf_footer_configs`, `non_scholastic_subjects`, `non_scholastic_sub_subjects`, `exam_schedules`, `admit_card_templates`, `result_masters`, `class_tests`, `student_remarks`, `articles`, `staff_members`, `section_cards`, `gallery_events`
  - Fix: attach existing `set_updated_at()` trigger. Also append to `supabase-schema.sql`.

- [ ] **M22. Missing indexes on audit FKs**
  - Columns: `results.entered_by`, `class_test_results.entered_by`, `non_scholastic_assessments.entered_by`, `student_remarks.author_id`, `class_tests.created_by`, `payment_orders.expires_at`; marginal — `results.is_published`, `class_tests.is_published`
  - Fix: add BTREE indexes; mirror into schema file.

- [ ] **M23. Staff ↔ teacher records diverge**
  - Files: `src/types/index.ts:59–74`, `src/app/api/staff/route.ts`
  - No FK from `staff_members` to `teachers`; name changes don't sync.
  - Fix: add `teacher_id` FK (nullable); optional auto-provision.

- [ ] **M24. `exam_schedules` times stored without timezone**
  - File: `scripts/migration-019-exam-schedules.sql`
  - Fix: either switch to `timestamptz` or document IST assumption explicitly.

- [ ] **M25. One parent → unlimited linked children**
  - File: `src/app/api/erp/parents/link-child/route.ts`
  - Fix: soft cap (10); admin review above.

- [ ] **M26. Deleting a student orphans `profiles` and `parents`**
  - File: `src/app/api/erp/students/route.ts:414–447`
  - `profiles.student_id` → NULL; `parents` rows stay.
  - Fix: cleanup linked profiles + dangling parents in the same handler (or Postgres function).

- [ ] **M27. Class delete has no explicit FK rule**
  - No DELETE handler today, but direct DB delete would orphan results/attendance/enrollments.
  - Fix: add `ON DELETE RESTRICT` on all FKs pointing to classes.

- [ ] **M28. `/admin/registrations` is a redirect; editor with `registrations` perm can't land anywhere**
  - File: `src/app/admin/registrations/page.tsx`
  - Redirects to `/admin/people/users?tab=registrations`, which is admin-only.
  - Fix: build a real page, or drop the `registrations` feature key.

- [ ] **M29. Feature-key coverage gaps**
  - Several ERP routes use raw `profile.role === 'admin'` instead of `verifyAdminOrEditor(featureKey)`. Examples: `/api/erp/students/bulk`, `/api/erp/fees/payments`, various `/api/erp/results/*`.
  - Fix: standardize on `verifyAdminOrEditor(featureKey)` wherever a matching key exists.

- [ ] **M30. Content-Disposition filename can include non-ASCII / CRLF**
  - File: `src/app/api/erp/results/report-card/pdf/route.tsx:287–325`
  - Fix: strip `[\r\n]`; ASCII-only `filename`; separate `filename*=UTF-8''…` form.

---

## Low

- [ ] **L1. Phone / DOB / admission-no format validators too loose**
  - File: `src/lib/validations.ts:40, 243, 259, 275, 279, 366`
  - Fix: Indian mobile regex; ISO date + sanity range; alphanumeric admission no.

- [ ] **L2. Articles cover-image cleanup misses non-local URLs**
  - File: `src/app/api/admin/articles/route.ts:169–173`
  - Fix: always attempt delete; log on miss.

- [ ] **L3. Disclosure docs soft-delete is half-baked**
  - File: `src/app/api/admin/disclosure-documents/route.ts:88–96`
  - Fix: hard-delete drafts; soft-delete only if published.

- [ ] **L4. Overpayment / late-fee logic not implemented**
  - File: `src/types/index.ts:489–503`
  - Fix: add `late_fee_percent`, `late_fee_fixed_amount`; overpayment credit tracking.

- [ ] **L5. Calendar events not role-scoped on read**
  - Files: calendar routes / `src/types/index.ts:574–590`
  - Fix: filter by audience/role in query.

- [ ] **L6. Student-list fetch risks PostgREST URL truncation on large enrollments**
  - File: `src/app/api/erp/students/route.ts:36–69`
  - Fix: paginate or chunk enrollment lookups.

- [ ] **L7. TC number — 6 random digits, no DB UNIQUE**
  - File: `src/app/api/erp/transfer-certificates/generate/route.tsx:25–29`
  - Fix: DB sequence + UNIQUE constraint on `tc_number`.

- [ ] **L8. Alumni flags can't be reverted**
  - File: `src/app/api/erp/students/promote/route.ts:124–142`
  - Fix: admin-only "revert alumni" action with audit.

- [ ] **L9. Editor-permission revocation has in-flight window**
  - Document as known behavior; session refresh covers steady state.

- [ ] **L10. No cap on bulk upload row count**
  - Files: `src/app/api/erp/students/bulk`, `results/import`, `staff/bulk`
  - Fix: `.max(5000)` or similar on each bulk schema.

- [ ] **L11. DB `CHECK (> 0)` missing on money / max_marks**
  - Columns: `exam_types.max_marks`, `fee_structures.amount`, `fee_payments.amount_paid`, `payment_orders.amount`
  - Fix: add CHECK constraints; migration + mirror to schema file.

- [ ] **L12. Transport opt-in missing in TC form**
  - Migration 013 added `has_transport` and `is_generated`; UI doesn't surface them.
  - Fix: add field to TC generation form.

- [ ] **L13. Default grade bands use `89.99`-style upper bounds; edit round-trips can drift**
  - File: `scripts/migration-015-grade-master.sql:51–62`
  - Fix: adopt exclusive-upper-bound semantics (ties into H12).

---

## Incomplete features (code present, spec not delivered)

- [ ] **IF1. Class tests** — entry works; never integrated into `computeFinalResult`. (See H6.)
- [ ] **IF2. `max_marks_override`** — UI exists; engine ignores it. (See H5.)
- [ ] **IF3. Marksheet snapshot** — captures per-exam, not final result. (See C3.)
- [ ] **IF4. Non-scholastic on report-card PDF** — "Not yet recorded" placeholder. (See M17.)
- [ ] **IF5. Per-class non-scholastic sub-subject scoping** — not modelled. (See M16.)
- [ ] **IF6. Division labels / White Sheet / Green Sheet / Supplementary / PTM Notes** — spec'd, unbuilt. (See M14.)
- [ ] **IF7. Admit card QR** — absent. (See M15.)
- [ ] **IF8. Fee waiver / refund / partial / overpayment / late-fee** — stubs only. (See M9, L4.)
- [ ] **IF9. Attendance per-period / holiday exclusion** — absent. (See M7, L5.)
- [ ] **IF10. Parent self-service cap + rate limit** — absent. (See C2, M25.)
- [ ] **IF11. TC draft/issued/revoked workflow + transport field** — absent. (See H18, L12.)
- [ ] **IF12. `/admin/registrations` real page** — redirect only. (See M28.)
- [ ] **IF13. Final-result preview in teacher portal** — absent. (See M18.)

---

## Working notes

- Every schema change must be both (a) a migration file in `scripts/`, **and** (b) appended to `supabase-schema.sql` in the same commit (see memory `feedback_schema_mirrors_migrations`).
- Tick the checkbox the instant the fix lands — not at end of session (see memory `feedback_plan_file_live_checkboxes`).
- Before marking done: read the diff back and verify the bug's actual trigger is closed, not just that code compiles.

## Review

_Add a short review here after each batch is shipped: what changed, what surprised, what follow-ups._
