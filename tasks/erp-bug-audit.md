# ERP Bug & Incomplete-Features Audit — 2026-04-24

Comprehensive audit of the NKPS ERP (auth, exams, results, publish, students, fees, TC, registrations, schema). Each item has a checkbox — tick it the moment the fix lands (not at end of session). File:line refs are starting points; grep/read before editing.

Work order: **Critical → High → Medium → Low → Incomplete features**. Don't re-order inside a severity band without a reason.

---

## Critical

- [x] **C1. Public TC storage bucket — all student TCs downloadable without auth** — fixed in code 2026-04-25 (deployment step pending)
  - New endpoint `GET /api/transfer-certificates/[id]/download` issues a fresh 60-second signed URL on every request, IP-rate-limited to 30/hour, with server logs of every actor + TC id. Both the public page and the admin page now link through it; the public page no longer selects `file_url` from the table at all. The download route handles three storage path formats (bare filename, public URL, signed URL) so existing rows keep working through the cutover. **Manual deployment step:** flip the `transfer-certificates` bucket from public to private in Supabase Studio — see memory `project_tc_bucket_private`.

- [x] **C2. Link-child endpoint is brute-forceable** — fixed 2026-04-25
  - Two-tier rate limit (5/parent/30min, 20/IP/30min) plus a 10-children cap per parent. Successful links still consume the bucket but real families never hit it.

- [x] **C3. Marksheet snapshot ignores result-master final result** — fixed 2026-04-25
  - Decision (per user): kind column on `marksheet_publications`, not a sibling table. Migration 033 adds `kind ('per_exam'|'year_final')`, makes `exam_type_id` nullable, adds `academic_year_id`, and rebuilds the partial-UNIQUE indexes for both kinds. New `MarksheetSnapshotV2` type (final_result + result_master + year_label). New `buildYearFinalSnapshot()` helper. New endpoint `POST/DELETE /api/erp/results/finalize-year-final` mirrors the per-exam finalize, with `prior_active_count` re-finalize gating. PDF route's final-result branch now serves from a year-final snapshot first; falls back to live compute if none. Atomic via the new `finalize_year_final_one` RPC. Mirrored to schema.

- [x] **C4. Registration approval — race condition creates duplicate users** — fixed 2026-04-25
  - Switched to an atomic `UPDATE … WHERE id=? AND status='pending' RETURNING *` claim. Concurrent admins now race for the row; only one wins. On auth-user creation failure the row is reverted to `pending` so the admin can retry.

- [x] **C5. Editor self-elevation latent bug on `/api/admin/editor-permissions`** — fixed 2026-04-25
  - Self-edit guard added: PUT now rejects when the calling user's id matches the target `editor_id`. Audit-log work deferred to a follow-up.

- [x] **C6. No ownership check on `POST /api/erp/class-tests/[id]/marks`** — fixed 2026-04-25
  - New `src/lib/teacher-scope.ts` resolves `profiles.teacher_id` and validates `class_subjects` membership for the test's `(class_id, subject_id)`. Applied here and on the sibling `[id]` PATCH/DELETE routes.

- [x] **C7. Duplicate migration number `025`** — fixed 2026-04-25
  - `migration-025-roll-number-auto.sql` → `migration-029-roll-number-auto.sql` (the originally-planned `026` slot was already taken by ptm-notes; bumped to the next free number). NOTE: two other duplicate-prefix collisions still exist that were introduced after the audit (`027-profile-fk-set-null` × `027-ptm-formats`; multiple files share `027`). Flagged but not renamed without explicit go-ahead since they may have intentional ordering.

---

## High

- [x] **H1. `must_change_password` flag bypassable via API** — fixed 2026-04-25
  - `src/lib/verify-admin.ts` rebuilt around a single `loadCaller()` helper; all four exported gates (`verifyAdmin`, `verifyAdminOrEditor`, `verifyAdminOrEditorWithUser`, `getCallerAccess`) now fail closed when `must_change_password` is set. The change-password endpoint uses Supabase Auth directly so it isn't deadlocked.

- [x] **H2. No rate limit on `/api/portal/forgot-password`** — fixed 2026-04-25
  - Per-IP (10 / 15 min) + per-email (3 / 15 min) limits via the new `src/lib/rate-limit.ts`. Per-email throttles return the standard `success:true` shape so we don't leak which emails are registered. A 600 ms minimum response time flattens the timing side-channel.

- [x] **H3. No rate limit / CAPTCHA on `/api/erp/register` and `/api/contact`** — fixed 2026-04-25
  - Per-IP rate limit (5 / hour) on both. CAPTCHA / honeypot intentionally deferred — re-evaluate if logs show bot traffic.

- [x] **H4. No rate limit on `/api/chat`** — fixed 2026-04-25
  - Per-IP cap of 20 messages / minute. Real chat doesn't need more; an attacker is bounded well below anything that would incur material spend.

- [x] **H5. `max_marks_override` is dead code** — fixed 2026-04-25
  - Engine now selects `max_marks_override` along with weightage in `class_exam_configs` and applies it per `(exam_type_id)` to every `results` row before per-subject pct compute. Supplementary substitution sits downstream so it inherits the override automatically. Validation schema also `.finite()`-checked.

- [x] **H6. Class tests never flow into the final result** — fixed 2026-04-25
  - Decision (per user): dedicated table only. `computeFinalResult` now loads `class_tests` + `class_test_results` for the student's subjects (only `is_published=true`, only rows with non-null marks), synthesizes `exam_type_id = "ct:<uuid>"` rows, and pushes them into both `examConfigs` and `results` before the rest of the engine runs. `class_test_best_of` already keys on `kind === 'class_test'` so the existing best-of selection works on the new contributions automatically. The legacy `exam_types(kind='class_test')` path still works for any rows that already use it.

- [x] **H7. `/api/erp/results/bulk` doesn't verify teacher teaches subject/class** — fixed 2026-04-25
  - Pre-check via `teacherTeachesClassSubject(class_id, subject_id)`. Admins skip.

- [x] **H8. `/api/erp/attendance/bulk` same flaw** — fixed 2026-04-25
  - Pre-check via `teacherCanAccessClass` (class teacher OR teaches any subject in the class). Future-date attendance also rejected (M7 partial — Sundays/holidays still TBD).

- [x] **H9. `/api/erp/non-scholastic-assessments` same flaw** — fixed 2026-04-25
  - Same `teacherCanAccessClass` gate as H8 since non-scholastic isn't tied to a single subject.

- [x] **H10. Report-card PDF passes wrong `academicYearId` in legacy branch** — fixed 2026-04-25
  - `src/app/api/erp/results/report-card/pdf/route.tsx` legacy branch now passes `null` so attendance is computed via `is_current` as the helper expects.

- [x] **H11. Result-Master Preview tab "Download sample PDF" 404s** — fixed 2026-04-25
  - The PDF route already supports a final-result mode when `academic_year_id` is supplied without `exam_type_id`. PreviewTab now points at that URL (`legacyPdfHref` renamed to `previewPdfHref`); the misleading "may 400" footnote has been replaced with a description of what the link actually renders.

- [x] **H12. Grade-band boundary ambiguity** — fixed 2026-04-25
  - `computeGrade` now sorts bands by `min_pct` descending and picks the first whose `min_pct ≤ pct`. This eliminates inclusive-inclusive overlap ambiguity and the tiny gaps from the `.99` upper-bound trick — boundary cases now land deterministically on the band with the higher min_pct, regardless of rounding precision.

- [x] **H13. SSRF in admit-card PDF photo fetch** — fixed 2026-04-25
  - New `src/lib/safe-fetch.ts` enforces https-only, allowlisted hosts (Supabase Storage by default, extensible via `SAFE_FETCH_ALLOWED_HOSTS`), 5 s timeout, redirect-rejection, and a 10 MB cap. Wired through `fetchPhoto` in both admit-card routes; fails closed if no allowlist is configured.

- [x] **H14. Marks/amount schemas accept `Infinity` / `NaN`** — fixed 2026-04-25
  - `.finite()` added to every numeric schema in `src/lib/validations.ts` (`resultsBulkSchema`, `classTestCreateSchema`, `classTestUpdateSchema`, `classTestMarksBulkSchema`, `feePaymentSchema`, `feeStructureSchema`, `paymentOrderSchema`, `schoolMeetingCountSchema`).

- [x] **H15. Registration approval returns plaintext password in response** — fixed 2026-04-25
  - Password is now returned **only** when email delivery fails, so the admin can fall back to manual delivery; happy path returns `user_id` + `email_delivered: true` only. Same pattern applied to `/api/erp/users` POST. Admin UI updated to show the password dialog only on the fallback path.

- [x] **H16. Promotion silently duplicates enrollments** — fixed 2026-04-25
  - Both promotion (passed → next class) and retention (failed → same class) branches now pre-fetch existing `(student_id, class_id)` rows for the target class, exclude already-enrolled students from the insert, and surface the skipped count in `summary.errors`. Counts reported are now exact, not optimistic.

- [x] **H17. TC generation + student closure not atomic** — ~resolved 2026-04-24~
  - TC generation feature removed (product decision: TCs are authored externally and uploaded). Closure now runs in the upload path (`src/app/api/transfer-certificates/route.ts`). Still non-atomic across the insert + status update, but failure surfaces a clear warning toast and is manually recoverable. Revisit as a Postgres function if it becomes an issue.

- [x] **H18. TC has no draft/review state** — ~closed as won't-fix 2026-04-24~
  - Not needed: uploads are of finished PDFs prepared by school staff outside the app. Delete-TC still available from admin UI to recall mistakes.

- [x] **H19. `migration-015-grade-master.sql` missing `IF NOT EXISTS`** — fixed 2026-04-25
  - All three `CREATE TABLE` and the four CREATE INDEX statements use `IF NOT EXISTS`. Default-scale seed and band seed are now guarded with `WHERE NOT EXISTS` so the migration is fully idempotent. RLS policies wrapped in `DROP POLICY IF EXISTS` before re-create.

- [x] **H20. `migration-014-results-marks-check.sql` ALTER ADD CONSTRAINT not idempotent** — fixed 2026-04-25
  - `DROP CONSTRAINT IF EXISTS results_marks_in_range` precedes the `ADD CONSTRAINT`.

- [x] **H21. Admission-no collision in registration approval** — fixed 2026-04-25
  - New `pickFreeAdmissionNo` helper tries the email local-part first (preserves the previous default in the common case), falls back to `${year}-${randomBase36}` until a free value is found. The DB UNIQUE on `students.admission_no` is the final guard.

- [~] **H22. `/api/admin` generic proxy is over-powered** — partial 2026-04-25
  - Per-table editor permission gate (`TABLE_FEATURE_KEY`) and column allowlist were already in place. This pass adds: actor-aware audit log lines on every successful op (`[admin-proxy] ok actor=… table=… action=… match=…`), and replaces the raw Supabase `error.message` with a generic client-facing string (covers M12 for this route). Full deprecation in favor of purpose-built endpoints is left as the longer-term plan.

- [x] **H23. Audit admin-only API counterparts of ADMIN_ONLY_PREFIXES** — verified 2026-04-25
  - Spot-checked: every route under grade-scales (incl. `[id]`), class-grade-scales, pdf-templates, non-scholastic/subjects (+`[id]`) and sub-subjects (+`[id]`), result-masters (+`[id]`, `[id]/exam-configs`, `[id]/subjects`, `[id]/preview`) uses `verifyAdmin()` directly — no `OrEditor` slip-throughs. Audit clean.

---

## Medium

- [x] **M1. No ownership check on `PATCH/DELETE /api/erp/class-tests/[id]`** — fixed 2026-04-25 (see C6)
  - File: `src/app/api/erp/class-tests/[id]/route.ts:9–102`
  - Fix: verify teacher owns (class, subject) before mutation.

- [x] **M2. `/api/erp/results/remarks` — class-teacher check only, not subject-scoped** — closed as intended 2026-04-25
  - Remarks are intentionally class-level (one holistic comment per student per exam type), not subject-scoped. Updated the route comment to call out that the class-teacher gate is the design, not an oversight.

- [x] **M3. Snapshot `schema_version` unused by consumer** — fixed 2026-04-25
  - Snapshot consumer now reads `schema_version` from the column (falls back to the JSON's own field for older rows) and rejects anything other than `"v1"` with a 422 + actionable message ("Re-finalize this marksheet to upgrade").

- [x] **M4. Finalize-marksheet is best-effort, not atomic** — fixed 2026-04-25
  - Migration 032 adds `finalize_marksheet_one()` Postgres function that wraps unpublish-prior + insert-new in a single transaction. Migration 033 adds the year-final variant `finalize_year_final_one()`. The route loop now calls each via `admin.rpc(...)`; per-student failure can no longer leave a row unpublished without its replacement.

- [x] **M5. Auto-unpublish reason on re-finalize is hardcoded `"re-finalized"`** — fixed 2026-04-25
  - `finalizeMarksheetSchema` now accepts an optional `unpublish_reason_on_refinalize`. The route up-front-checks whether any target student has a live active marksheet; if so and no reason was supplied, it returns 400 + `prior_active_count` so the UI can prompt. Admin publish page now does that prompt and retries with the reason in one round-trip.

- [x] **M6. Timetable has no conflict detection** — fixed 2026-04-25 (DB-level)
  - Files: `src/app/admin/timetable/page.tsx`; no API validation
  - Fix: partial unique on `(teacher_id, day, period_number) WHERE teacher_id IS NOT NULL`; also `(class_id, day, period_number)`.

- [~] **M7. Attendance accepts future dates and ignores holidays/Sundays** — partial 2026-04-25
  - File: `src/app/api/erp/attendance/bulk/route.ts:40–70`
  - Fix: reject `date > today`; cross-reference `calendar_events`; at minimum skip Sundays.

- [x] **M8. Fee structure not scoped to student's class** — already correct (audit incorrect)
  - File: `src/lib/fees.ts:29–50`
  - Filters by stream only. A Class XI student can be charged Class XII fees.
  - Fix: join `student_enrollments → classes`; filter on `class_name`.

- [ ] **M9. Fee lifecycle stubs**
  - Files: `src/app/api/erp/fees/payments/route.ts`, `src/types/index.ts:506`
  - Enum includes `partial/failed/refunded`; app only writes `paid`; no waiver/refund UI.
  - Fix: implement or narrow the enum.

- [x] **M10. Avatar upload — no MIME/size check** — fixed 2026-04-25
  - 5 MB cap, MIME allowlist (jpeg / png / webp), and a magic-byte sniff that bails when reported MIME and the actual bytes disagree. SVG rejected. Storage path now uses the real extension instead of always `.jpg`.

- [x] **M11. `/api/admin/upload-url` signs for any bucket/filename** — fixed 2026-04-25
  - Per-bucket allowlist (`BUCKET_RULES`) — only the 7 buckets the admin UI actually writes to are accepted, each with its own extension whitelist (e.g. `transfer-certificates` → `pdf`, `staff` → image formats). Path-traversal attempts (`..`, leading `/`, `\`) are rejected.

- [ ] **M12. Supabase raw errors returned to clients**
  - Files: many (e.g. `src/app/api/erp/class-tests/[id]/marks/route.ts:28`)
  - Leaks column/table names.
  - Fix: generic message to client; `console.error` raw for server.

- [x] **M13. Non-scholastic assessment text length unbounded** — fixed 2026-04-25
  - Added `.max(50)` on `grade_label` and `.max(500)` on `remarks` in `nonScholasticAssessmentsBulkSchema`. Also added `.max(2000)` on PTM-notes free-text fields and `.max(200)` on class-test names while in there.

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

- [x] **M19. `/teacher/non-scholastic` blank grid when no sub-subjects configured** — already handled (audit incorrect)
  - `src/app/teacher/non-scholastic/page.tsx` already renders distinct empty states for "no sub-subjects" and "no students" (around line 468). No change needed.

- [ ] **M20. Phase 4+ tables lack TypeScript interfaces**
  - File: `src/types/index.ts`
  - Missing: `grade_scales`, `grade_bands`, `class_grade_scales`, `class_exam_configs`, `pdf_header_configs`, `pdf_footer_configs`, `exam_schedules`, `admit_card_templates`, `result_masters`, `result_master_subjects`, `non_scholastic_subjects`, `non_scholastic_sub_subjects`, `non_scholastic_assessments`, `class_tests`, `class_test_results`, `marksheet_publications`, `publish_events`.
  - Fix: add interfaces mirroring DB columns.

- [x] **M21. `updated_at` triggers missing on 15 Phase 4+ tables** — fixed 2026-04-25
  - Migration `031-db-hygiene.sql` attaches `set_updated_at()` to all 15 listed tables via a DO block (skips silently if a table is missing for older deployments). Mirrored into `supabase-schema.sql`.

- [x] **M22. Missing indexes on audit FKs** — fixed 2026-04-25
  - Migration `031-db-hygiene.sql` adds the eight indexes (audit FKs, partial-true `is_published`, and `payment_orders.expires_at`). Mirrored into `supabase-schema.sql`.

- [ ] **M23. Staff ↔ teacher records diverge**
  - Files: `src/types/index.ts:59–74`, `src/app/api/staff/route.ts`
  - No FK from `staff_members` to `teachers`; name changes don't sync.
  - Fix: add `teacher_id` FK (nullable); optional auto-provision.

- [ ] **M24. `exam_schedules` times stored without timezone**
  - File: `scripts/migration-019-exam-schedules.sql`
  - Fix: either switch to `timestamptz` or document IST assumption explicitly.

- [x] **M25. One parent → unlimited linked children** — fixed 2026-04-25
  - Hard cap of 10 children per parent enforced server-side. Beyond that the parent must contact admin.

- [ ] **M26. Deleting a student orphans `profiles` and `parents`**
  - File: `src/app/api/erp/students/route.ts:414–447`
  - `profiles.student_id` → NULL; `parents` rows stay.
  - Fix: cleanup linked profiles + dangling parents in the same handler (or Postgres function).

- [x] **M27. Class delete has no explicit FK rule** — already correct (audit incorrect)
  - No DELETE handler today, but direct DB delete would orphan results/attendance/enrollments.
  - Fix: add `ON DELETE RESTRICT` on all FKs pointing to classes.

- [x] **M28. `/admin/registrations` is a redirect; editor with `registrations` perm can't land anywhere** — fixed 2026-04-25
  - Dropped the `registrations` feature key entirely (registrations live inside the admin-only `/admin/people/users` page). Updated `permissions.ts` (key/catalog removed; `/admin/registrations` added to `ADMIN_ONLY_PREFIXES`) and `/api/admin/dashboard` (gated by `isAdmin` instead of `can("registrations")`).

- [ ] **M29. Feature-key coverage gaps**
  - Several ERP routes use raw `profile.role === 'admin'` instead of `verifyAdminOrEditor(featureKey)`. Examples: `/api/erp/students/bulk`, `/api/erp/fees/payments`, various `/api/erp/results/*`.
  - Fix: standardize on `verifyAdminOrEditor(featureKey)` wherever a matching key exists.

- [x] **M30. Content-Disposition filename can include non-ASCII / CRLF** — fixed 2026-04-25
  - New helper `contentDispositionAttachment(name)` in `src/lib/utils.ts` strips CRLF, ASCII-fences the `filename` form, and emits `filename*=UTF-8''…`. Applied to all 13 download endpoints (report card v1+v2, admit cards single+bulk, white/green sheet pdf+csv, blank marks, ptm notes/format, results export).

---

## Low

- [~] **L1. Phone / DOB / admission-no format validators too loose** — partial 2026-04-25
  - Phone done: Indian mobile regex (10 digits starting with 6-9) with prefix tolerance (`+91`, `91`, leading `0`). Applied to `contactFormSchema`, `createUserSchema`, `registrationRequestSchema`, `parentSchema` via shared `phoneRequiredSchema` / `phoneOptionalSchema`. DOB sanity-range and admission-no regex still TODO — left unticked because they need stricter UI feedback to avoid mass-rejecting legacy rows.

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

- [x] **L7. TC number — 6 random digits, no DB UNIQUE** — ~obsolete 2026-04-24~
  - Generator removed; `tc_number` no longer written by the app. Column remains in schema for any legacy rows.

- [ ] **L8. Alumni flags can't be reverted**
  - File: `src/app/api/erp/students/promote/route.ts:124–142`
  - Fix: admin-only "revert alumni" action with audit.

- [ ] **L9. Editor-permission revocation has in-flight window**
  - Document as known behavior; session refresh covers steady state.

- [x] **L10. No cap on bulk upload row count** — fixed 2026-04-25
  - Added `.max(5000)` to every bulk Zod schema in `src/lib/validations.ts` (attendance, results, non-scholastic, class-test marks, PTM notes, students, staff).

- [x] **L11. DB `CHECK (> 0)` missing on money / max_marks** — fixed 2026-04-25
  - Migration `031-db-hygiene.sql` adds idempotent CHECK constraints on `exam_types.max_marks`, `fee_structures.amount`, `fee_payments.amount_paid`, `payment_orders.amount`. Mirrored into `supabase-schema.sql`.

- [x] **L12. Transport opt-in missing in TC form** — ~obsolete 2026-04-24~
  - TC generate form removed. `has_transport` on `student_enrollments` can be set from the student edit screen if still relevant.

- [ ] **L13. Default grade bands use `89.99`-style upper bounds; edit round-trips can drift**
  - File: `scripts/migration-015-grade-master.sql:51–62`
  - Fix: adopt exclusive-upper-bound semantics (ties into H12).

---

## Incomplete features (code present, spec not delivered)

- [x] **IF1. Class tests** — fixed 2026-04-25 (See H6.)
- [ ] **IF2. `max_marks_override`** — UI exists; engine ignores it. (See H5.)
- [x] **IF3. Marksheet snapshot** — fixed 2026-04-25 (See C3.)
- [ ] **IF4. Non-scholastic on report-card PDF** — "Not yet recorded" placeholder. (See M17.)
- [ ] **IF5. Per-class non-scholastic sub-subject scoping** — not modelled. (See M16.)
- [ ] **IF6. Division labels / White Sheet / Green Sheet / Supplementary / PTM Notes** — spec'd, unbuilt. (See M14.)
- [ ] **IF7. Admit card QR** — absent. (See M15.)
- [ ] **IF8. Fee waiver / refund / partial / overpayment / late-fee** — stubs only. (See M9, L4.)
- [ ] **IF9. Attendance per-period / holiday exclusion** — absent. (See M7, L5.)
- [ ] **IF10. Parent self-service cap + rate limit** — absent. (See C2, M25.)
- [x] **IF11. TC draft/issued/revoked workflow + transport field** — ~closed 2026-04-24~ (TC generation removed in favor of upload-only; see H17/H18/L7/L12.)
- [ ] **IF12. `/admin/registrations` real page** — redirect only. (See M28.)
- [ ] **IF13. Final-result preview in teacher portal** — absent. (See M18.)

---

## Working notes

- Every schema change must be both (a) a migration file in `scripts/`, **and** (b) appended to `supabase-schema.sql` in the same commit (see memory `feedback_schema_mirrors_migrations`).
- Tick the checkbox the instant the fix lands — not at end of session (see memory `feedback_plan_file_live_checkboxes`).
- Before marking done: read the diff back and verify the bug's actual trigger is closed, not just that code compiles.

## Review

_Add a short review here after each batch is shipped: what changed, what surprised, what follow-ups._
