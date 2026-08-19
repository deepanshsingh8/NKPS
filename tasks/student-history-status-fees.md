# Feature batch — student history, status tracking, fees (Aug 2026)

Plan: `~/.claude/plans/few-features-are-required-typed-church.md`
Branch: `feat/student-history-status-fees`

## Phase 0 — Migration 086: enrollment integrity
- [x] `migration-086-enrollment-history-integrity.sql` — `created_at`, `source`, `import_batch_id`, `UNIQUE(student_id, academic_year_id)`
- [x] Append 086 to `supabase-schema.sql`
- [x] Stop swallowing errors: `report-card.ts`, `results/by-student/route.ts`, `final-result.ts`
- [x] Migrations 086 + 087 applied; report-card enrollment lookup verified returning a row

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
- [x] `student-history.ts` + `/api/students/[id]/history`
- [x] `/people/students/[id]` page + `AcademicHistoryTimeline`
- [x] Bulk importer: year + status pickers, insert-only backfill mode
- [x] Results historical importer: create enrollment rows; revert deletes them
- [x] Portals pass `academic_year_id`; report-card attendance year scoping

## Phase 6 — Fees
- [x] 6a group "All Structures" by class (Accordion, curriculum order)
- [x] 6b historical-import template endpoint + link
- [x] 6c fee structure bulk upload (template → preview → commit)
- [x] 6d per-student concessions — no new table needed: a concession IS a waiver, so the bulk path reuses `validateWaiver`/`buildWaiverRow` and flows through dues, no-dues and receipts unchanged. Admin-only (editors keep the approval workflow).

## Phase 7 — Masters
- [x] **Streams master** — table existed with no UI; only writers were the importers, so a typo made permanent junk. Full CRUD + usage counts + delete guard.
- [x] Sidebar audit: surfaced 4 orphaned routes (timetable generate/import/templates, registrations)
- [x] Closed the gating hole: 7 routes resolved to NO feature key, which lets any editor through
- [x] Unified `SidebarShell` resolver with `featureKeyForPath` (they had drifted)
- [ ] Broader Masters restructure — **awaiting user details** (which entities to promote, and whether to regroup the ~16 existing master screens under one nav parent)

## Review
_To be filled in._
