# ERP Audit — Fixes

Tracking the fixes for the June 2026 ERP health audit. Severity from the audit report.

## Batch A — quick, high-leverage (DONE)
- [x] #1 CRITICAL: CSV formula injection — shared `csvEscape` guards `=+-@`, wired into results/export, green-sheet/csv, white-sheet/csv
- [x] #13 HIGH: Calendar leaks internal events to portals — `UpcomingEvents` now filters `is_public=true`
- [x] #14 HIGH: One-class holiday blocks all classes — admin calendar form sets `is_school_wide=!class_id`
- [x] #15 HIGH: Bulk routes return 200 on total failure — students/bulk, staff/bulk, subjects/quick-setup, subjects/bulk-assign now 400 when nothing inserted

## Batch B — auth scope (DONE except #6)
- [x] #5 HIGH: Teacher can read any class's report-card remarks — scoped `results/remarks` GET to teacher's classes
- [x] #4 HIGH: Teacher scope missing on PTM import & school-meeting-counts — added class-access checks
- [x] #6 HIGH: Account-existence enumeration on `/api/register` — DECISION: uniform generic response; existing/pending now returns same success, no insert/email
- [x] #10 HIGH: Dues gate flips on swallowed DB errors — `student-dues.ts` now throws; callers fail closed
- [x] #18 MEDIUM: Transport "verify" attests student with no transport/pickup — guard added
- [x] #19 MEDIUM: Transport coord change-detection wipes verification on no-op saves — numeric compare w/ tolerance
- [x] #21 MEDIUM: `/api/users` POST admission_no collision — extracted `pickFreeAdmissionNo` to lib, reused

## Batch C — fees / results integrity (mostly DONE)
- [x] #7 HIGH: Waiver uncapped/un-deduped/editor-writable — cap+dedup via `validateWaiver`; editors now file `insert` change-requests (migration 070); approve route re-validates + applies; admin UI + waiver dialog updated
- [x] #8 HIGH: Historical import "misfiles transport as tuition" — NOT APPLICABLE (closed). Investigation: importer reads a tuition-only monthly "Account Wise" report (no transport column), filing payments into a generic `fee_type='Historical'`, amount=0, is_active=false bucket. DECISION: historical transport is not migrated at all, so there is nothing to misfile. No code change. Re-open only if transport history is imported later (would need an explicit transport import mode → transport_slab_id).
- [x] #9 HIGH: Comma-grouped amounts dropped on import — regex now allows commas, strips before parse
- [x] #11 HIGH: Un-publish doesn't revoke downloadable report-card PDFs — PDF gate now honours live publish flag for students/parents
- [x] #12 HIGH: historical-revert can hard-delete published results — added is_published guard

## Batch D — timetable period_number model (DONE)
- [x] #3 CRITICAL: substitution assignment does no availability re-check — added `findSubstituteConflict` to POST + PATCH
- [x] #2 CRITICAL: generate/import use time-overlap; DB teacher index replaced by `timetable_teacher_no_overlap` EXCLUDE constraint (migration 071). Commit `replace` now wipes whole (class,day); friendly overlap error; period-0 clash check fixed.
- [x] #20 MEDIUM: teacher timetable grid renders all staggered entries (lossless, time-sorted). Student/parent grids view a single class → period_number is unique there, no collision possible.

## Decisions (resolved)
- #6 register enumeration → uniform generic response. DONE.
- #7 waiver policy → cap + dedup + route editors via change-request. DONE.
- #2 timetable → full fix incl. migration. PENDING (see below).
- #8 transport import → fix importer now. PENDING.

## Remaining (2 heavy items)
- #2 CRITICAL + #20: full timetable time-overlap fix. Needs: a migration replacing the
  `(teacher_id, day, period_number)` unique index with a time-overlap EXCLUDE
  constraint (btree_gist), rewrite of generate + import preview/commit clash
  detection to start_time/end_time overlap, and the 3 portal grids keyed by time.
  RISK: the EXCLUDE constraint will FAIL to apply if existing timetable data
  already contains real overlaps — must audit live data first.
- #8 HIGH: teach the historical fees importer to detect transport payments and
  route them to the transport fare-slab path instead of a tuition fee_structure.

## Verification status
- All landed fixes: typecheck clean (4 packages), lint 0 errors (112 pre-existing warnings, none added).
- Migration 070 authored + mirrored into supabase-schema.sql. NOT yet applied to a live DB.
