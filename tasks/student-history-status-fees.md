# Feature batch — student history, status tracking, fees (Aug 2026)

Plan: `~/.claude/plans/few-features-are-required-typed-church.md`
Branch: `feat/student-history-status-fees`

## Phase 0 — Migration 086: enrollment integrity
- [x] `migration-086-enrollment-history-integrity.sql` — `created_at`, `source`, `import_batch_id`, `UNIQUE(student_id, academic_year_id)`
- [x] Append 086 to `supabase-schema.sql`
- [x] Stop swallowing errors: `report-card.ts`, `results/by-student/route.ts`, `final-result.ts`
- [ ] **BLOCKED ON USER** — apply 086 in Supabase Studio (no DB connection string in repo; no exec_sql RPC), then verify report-card enrollment lookup returns a row

## Phase 1 — Stop the past-year rewrite
- [x] GET `/api/students`: expose `enrollment_academic_year_id` + `enrollment_is_current_year`
- [x] PATCH `/api/students`: never rewrite `academic_year_id` on an existing row; branch by year
- [x] Recover branch: probe `(student_id, academic_year_id)` instead of `(student_id, class_id)`
- [x] Widen the same probe in `bulk` (upsert conflict target), `promote` (both branches), `revert-alumni`

## Phase 2 — Migration 087: status history
> Needs applying in Supabase Studio alongside 086 — the status route calls `change_enrollment_status()`.
- [x] `student_status_history` table + indexes + RLS
- [x] Cache columns on `student_enrollments` (`status_reason`, `status_changed_at`, `status_changed_by`)
- [x] `change_enrollment_status()` RPC (atomic)
- [x] Append 087 to `supabase-schema.sql`

## Phase 3 — Status API + confirm dialogs
- [x] `/api/students/status`: reason required for terminated/exited, actor capture, RPC call
- [x] Shared `Textarea` component
- [x] `StatusChangeDialog.tsx` (single + bulk)
- [x] Surface reason: status cell icon + detail dialog (timeline lands with Phase 5)

## Phase 4 — Students page
- [x] 4a perf: `useMemo` filter, `useDeferredValue` search, pagination (50/page), single-pass counts
- [x] 4b tabs: Active/Passed/Failed/Exited/Terminated/Unassigned/Alumni/All
- [x] Alumni tab replaces the list dialog (keep revert dialog)
- [x] Cross-tab search guard rail; promote banner counts unfiltered

## Phase 5 — Academic history
- [ ] `student-history.ts` + `/api/students/[id]/history`
- [ ] `/people/students/[id]` page + `AcademicHistoryTimeline`
- [ ] Bulk importer: year + status pickers, insert-only backfill mode
- [ ] Results historical importer: create enrollment rows; revert deletes them
- [ ] Portals pass `academic_year_id`; report-card attendance year scoping

## Phase 6 — Fees
- [ ] 6a group "All Structures" by class (Accordion, curriculum order)
- [ ] 6b historical-import template endpoint + link
- [ ] 6c fee structure bulk upload (template → preview → commit)
- [ ] 6d per-student fee upload — needs schema decision, deferred

## Phase 7 — Masters
- [ ] Awaiting user details

## Review
_To be filled in._
