# NKPS — Student lifecycle, timetable & dues fixes

Plan: `~/.claude/plans/effervescent-cooking-dove.md`

## WS0 — TC student-status fix (URGENT)
- [x] Make status editable from the main students view (gate on `enrollment_id` only)
- [x] TC delete reopens the student (is_active=true + revert terminated enrollment)
- [x] Typecheck (erp + cms)

## WS3 — Fee-dues gating (admit card + result)
- [x] `lib/student-dues.ts` helper (reuse `lib/fees.ts`) + `dueGateApplies` role gate
- [x] Gate admit-card PDF route (skip admin/staff/teacher)
- [x] Gate result report-card PDF route
- [x] Bulk admit-card variant is admin-only — no gate needed
- [x] `GET /api/students/dues` endpoint for the UI
- [x] UI: banner + disabled buttons (student + parent admit-cards & results)
- [x] Typecheck

## WS1 — Student/parent account ↔ record linking
- [x] `POST /api/students/link-account` (+ GET lookup) admin repair tool
- [x] Admin UI on /people/users (verify by admission no, link dialog, Re-link state)
- [x] `POST /api/students/link-self` (student claim by admission no + DOB)
- [x] Student dashboard claim prompt when student_id null (`StudentLinkPrompt`)
- [x] Surface silent approval failure in registrations/approve (`link_warning`)
- [x] Typecheck

## WS2 — Timetable: zero period + flexible count
- [x] Zod `period_number` >= 0
- [x] import + import/commit allow period 0
- [x] Editor: derive periods from data + "Add zero period" / "Add period" affordances
- [x] Student + parent timetable views: dynamic period list (incl. P0)
- [~] Templates: left 1-based — zero periods are per-class (editor/import), avoids
      destabilizing the template position→period_number generate contract
- [x] Typecheck

## Review

**WS0 — TC status (urgent):** Root cause was UI, not data — status was only
editable in the class-filtered view (`students/page.tsx:1443`), so edits landed
on a per-class enrollment that could differ from the representative row shown
elsewhere. Status is now editable from the main list (gate on `enrollment_id`).
TC delete now reopens the student (is_active=true + reverts the terminated
enrollment). No DB trigger was re-terminating anyone.

**WS3 — Dues gating:** New `lib/student-dues.ts` (mirrors the student fees-page
math) + `dueGateApplies` (student/parent only). Server gates on the admit-card &
result PDF routes (cover student + parent; admin/staff/teacher exempt) return
403; `GET /api/students/dues` powers the UI banner + disabled buttons on all four
portal pages. Exams stay visible; only downloads lock.

**WS1 — Linking:** `POST /api/students/link-account` (+GET verify) admin repair
tool on /people/users; `POST /api/students/link-self` student self-claim by
admission no + DOB (`StudentLinkPrompt` on the dashboard). Both write via the
service-role client (bypasses the migration-061 privilege-lock). Parent approval
now returns `link_warning` when the admission-no doesn't match, surfaced as a
toast.

**WS2 — Timetable:** Period 0 allowed end-to-end (Zod + import + commit). Editor
derives rows from saved periods (scales past 8) with "Add zero period" / "Add
period"; student + parent grids derive the period list dynamically.

**Verification:** erp + cms typecheck clean (exit 0); eslint clean (only
pre-existing effect-setState warnings). No new migrations needed for WS0–WS3.

**Follow-ups for the user:**
- Run `migration-062-backfill-teacher-profile-link.sql` (separate, earlier teacher fix).
- Manually test the flows per each WS verification note.
