# Exam Department Expansion

Goal: turn the existing basic exam/result surface into a comprehensive Exam Department covering Admit Cards, Exam Timetables, Non-Scholastic assessments, configurable Report Cards, weighted Final Results, two-stage publish workflow, CSV import/export, White/Green sheets, and dynamic roll-number management.

**Hard constraints (must not regress):**
- Existing `/teacher/results`, `/student/results`, `/parent/results` must keep working identically until a phase explicitly changes them.
- Existing `results`, `student_remarks`, `exam_types` tables: additive changes only (new nullable columns or new sibling tables; no destructive edits).
- Existing PDF report card must continue to render for old data even before Result Master is configured — keep a fallback path.
- Every migration appended to `supabase-schema.sql` in the same turn (per saved rule).
- Every feature gets a `feature_key` in `src/lib/permissions.ts` for granular editor access.

---

## Locked design decisions

| Topic | Decision |
|---|---|
| Class Tests | Not a separate module. New `exam_types.kind` column (`term_exam` \| `class_test` \| `practical`). Class tests contribute weighted to final result. |
| Weightage | Per-class-level via `exam_types.class_level` (values mirror `FeeClassLevel`: `all`/`nursery_ukg`/`i_v`/`vi_viii`/`ix_x`/`xi_xii`). Per-class override remains available via `class_exam_configs` for rare exceptions, but the level column is the primary axis — one dropdown in the dialog instead of an N-class picker, and the 100% check is always scoped to (year, level). |
| Final result composition | Admin-defined. No rigid term structure. Weightages can sum to any shape admin wants (warn if ≠ 100%). |
| Upper Header | Text column `upper_header` on `exam_types`. |
| Non-Scholastic | Subject → Sub-Subject → Grade (from a non-scholastic `grade_scale`). Flat two-level hierarchy. |
| Grade Master | New `grade_scales` + `grade_bands` + `class_grade_scales` tables. One scale flagged as global default; any class can override. Report card auto-computes grade from the applicable scale and shows a legend. Replaces 4 duplicate hardcoded grade functions. Default-seeded with current A+/A/B+/B/C/D/F cutoffs. |
| ERP navigation | All exam features live under a single expandable **Exams** group in the admin sidebar. Parent shows if editor has any child permission. Existing `/admin/exam-types` moves to `/admin/exams/types` with a redirect. |
| Publish | Two independent actions: `results.is_published` (online visibility — already exists) and `marksheet_publications` (finalized PDF snapshot). |
| Roll Number | Alphabetical by `students.full_name` within class+year, auto-recomputed via Postgres trigger on enrollment CRUD and name change. Manual override allowed. |
| PDF templates | Header/footer configurable via DB (`pdf_header_configs`, `pdf_footer_configs`) with fallback to current hardcoded values. |
| Marks validation | Enforce `0 ≤ marks_obtained ≤ max_marks` at all three layers (DB CHECK, Zod, API route). Client already checks on submit. |
| "School Meeting Entry" | Parked. Not in scope. |
| "PTM notes" | Parked. PTM *format* (print template) is in scope. |

---

## Phase 0 — Settings, Masters & Data-Integrity Hotfix

Smallest phase, unblocks everything else. Also closes the marks-validation gap.

### 0.1 Marks validation hotfix (do this first — defense in depth)

Current gap (verified):
- `src/lib/validations.ts:68` — Zod `resultsBulkSchema` only has `min(0)`, no upper bound.
- `src/app/api/erp/results/bulk/route.ts:70-79` — route fetches `max_marks` but never compares per-entry; upserts whatever was sent.
- `results` table — no CHECK constraint.
- Client validates on submit (`teacher/results/page.tsx:344`) but API is bypassable.

Tasks:
- [x] `migration-014-results-marks-check.sql`
  - Pre-flight query included as commented reference at top of file.
  - `CHECK (marks_obtained >= 0 AND marks_obtained <= max_marks)` added as named constraint `results_marks_in_range`.
  - Mirrored in `supabase-schema.sql`.
- [x] Server-side per-entry check in `src/app/api/erp/results/bulk/route.ts` — returns 400 with `invalid_entries` array listing offending `student_id`s.
- [x] Client UI in `teacher/results/page.tsx`:
  - Invalid cells render with red border + red text + `aria-invalid`.
  - Grade column shows "> {max}" red chip instead of a misleading grade letter.
  - Save All button disabled while any row is out of range, with red helper text "Fix marks exceeding {max} to save".
- [ ] API test confirming direct POST with `marks_obtained > max_marks` returns 400. (Deferred — no test harness in repo yet; manual smoke covers it.)

### 0.2 Grade Master (per-class override with global default)
- [x] `migration-015-grade-master.sql`
  - `grade_scales(id, name, scope text check in ('scholastic','non_scholastic'), is_default bool, created_at, updated_at)` — library of named scales. Exactly one row per scope may have `is_default=true` (enforced via partial unique index).
  - `grade_bands(id, grade_scale_id ON DELETE CASCADE, label, min_pct, max_pct, remark nullable, sort_order)`
  - `class_grade_scales(class_id PRIMARY KEY, grade_scale_id, updated_at)` — per-class override. Absence of a row = falls back to the scope's default scale.
  - Seed: default scholastic scale "Default Scale" with current cutoffs (A+ 90+, A 80+, B+ 70+, B 60+, C 50+, D 40+, F <40) flagged `is_default=true`.
- [x] Resolver `src/lib/grading.ts`:
  - `resolveGradeScaleForClass(supabase, classId, scope) → GradeScale` — checks override first, falls back to default.
  - `computeGrade(pct, bands) → label` — pure function given already-loaded bands.
  - Server-side batch helper `computeGradesForResults(supabase, results[]) → ...` so report-card generation does one scale-load per class, not per row.
- [x] Replace 4 hardcoded grade duplicates:
  - [x] `src/app/api/erp/results/bulk/route.ts` — resolves scale per request, computes per entry with `computeGrade`.
  - [x] `src/app/teacher/results/page.tsx` — fetches bands on class-change via new effect; preview uses `computeGrade`.
  - [x] `src/app/admin/exams/results/page.tsx` — fetches bands on class-change; derived `getGradeFromPct` now delegates to `computeGrade`.
  - [x] `src/lib/report-card.ts` — `resolveGradeScaleForClass` runs once per report card; per-subject + overall grades recomputed from live scale so Grade Master edits reflect immediately. PDF legend wiring deferred to Phase 3 report-card PDF rewrite.
- [x] `/admin/exams/grade-master` page (admin-only):
  - Scope tabs (Scholastic / Non-Scholastic) + "New Scale" button.
  - Card grid of scales with Default badge, band chips preview, class-assignment count.
  - Edit dialog: name, "set as default" checkbox, bands table (add/remove rows, label/min%/max%/remark), class-assignment multi-select.
  - Seeds reasonable starter bands for a new scale (scholastic = current 7 bands; non-scholastic = A/B/C starter).
  - Client validation: non-empty name, ≥1 band, each band has label + valid min ≤ max within 0–100.
- [x] API routes (admin-only via `verifyAdmin`):
  - `GET/POST /api/erp/grade-scales` — list (enriched with bands + class assignments) + create (scale + bands in one call, atomic rollback on band failure).
  - `PATCH/DELETE /api/erp/grade-scales/[id]` — update (name, is_default, bands wholesale replace) + delete with two guard paths (default + assigned-classes).
  - `GET/PUT /api/erp/class-grade-scales` — per-class assignment, `grade_scale_id: null` clears override.
  - `is_default: true` on PATCH auto-unsets the current default for the scope before flipping — so admin can promote from inside the Edit dialog or from the Delete dialog's guided flow.
- [x] Default-scale deletion guard:
  - DELETE on default scale → 409 with `code: "DEFAULT_SCALE_PROTECTED"` + `candidates` list.
  - Delete dialog catches that, renders a "Promote to default" picker with the candidates, then promotes+deletes in sequence on confirm.
  - DELETE on a scale with class overrides → 409 with `code: "SCALE_IN_USE"` + count; admin asked to unassign first.
- [x] Middleware: `/admin/exams/grade-master` added to `ADMIN_ONLY_PREFIXES` (editors blocked from URL-hacking). Sidebar hides the link for editors automatically because the href has no feature_key.
- [x] Discoverability: Grade Master tile added to `/admin/exams` hub (admin-only via `adminOnly` flag) + link added to sidebar Exams group.

### 0.2.1 Sidebar restructure + /admin/exams landing (done first, before Grade Master)
- [x] `/admin/exams/page.tsx` — landing tile grid, filtered by editor feature permissions.
- [x] `AdminSidebar.tsx` — new `SidebarItem` union (link | group), expandable "Exams" group with auto-expand on matching path + manual toggle, collapsed-mode shows parent icon that navigates to landing.
- [x] Moved `/admin/exam-types/` → `/admin/exams/types/` and `/admin/results/` → `/admin/exams/results/` via `git mv`.
- [x] `next.config.ts` redirects for `/admin/exam-types` and `/admin/results` to the new paths (permanent=false for now in case we revert).
- [x] `src/lib/permissions.ts` — updated `exam_types` and `results` hrefs to new paths. Middleware `featureKeyForPath` resolves correctly via longest-prefix match (unchanged logic).
- [x] Editor permission filtering preserved: group shows only if editor has at least one child permission; per-child checks unchanged.

### 0.3 Exam type extensions
- [x] `migration-016-exam-type-extensions.sql`
  - Added `kind text NOT NULL DEFAULT 'term_exam'` + CHECK constraint (`'term_exam' | 'class_test' | 'practical'`) — existing rows automatically classified as `term_exam`.
  - Added `upper_header text` (nullable) for the per-exam banner string.
  - Created `class_exam_configs(id, class_id, exam_type_id, is_applicable, weightage, max_marks_override, sort_order)` with UNIQUE(class_id, exam_type_id), CHECK(weightage BETWEEN 0 AND 100), CHECK(max_marks_override > 0), and RLS (authenticated read, admin write).
  - Mirrored in `supabase-schema.sql`.
- [x] `/admin/exams/types` UI:
  - Kind dropdown (with hint descriptions per option: Term Exam / Class Test / Practical) in the add/edit dialog.
  - Upper Header text input in the dialog with placeholder showing expected format.
  - New Kind column (pill badge) and Upper Header column (truncated) in the table.
- [x] Type updates: `ExamKind` union + `kind` / `upper_header` fields added to `ExamType` interface in `src/types/index.ts`.
- [x] `migration-021-exam-class-level.sql` — `class_level text NOT NULL DEFAULT 'all'` on `exam_types` with CHECK over the six `FeeClassLevel`-style values + `idx_exam_types_year_level`. Mirrored in `supabase-schema.sql`.
- [x] `ExamClassLevel` union + `class_level` field added to `ExamType` in `src/types/index.ts`.
- [x] Level-based weightage UX on `/admin/exams/types`:
  - Academic-year selector in header; filters everything below.
  - Tab bar: All Levels + 5 scoped levels (Pre-Primary / Primary / Middle / Secondary / Sr. Sec.). Each scoped tab carries a colored dot (green=100%, amber=under, red=over) so imbalance is visible before clicking in.
  - Top banner: "N levels unbalanced for {year}" with per-level sums, shown only when something's off.
  - Per-tab coverage chip (Balanced · 100% / X% · Y% unallocated / X% · over by Y%) + Auto-balance button.
  - Auto-balance treats `class_level='all'` exams as locked and distributes the remainder (100 − sum_all) evenly across the tab's level-specific exams; rounding drift is pushed to the first exam so the total lands exactly.
  - Dialog gains one "Applies to level" dropdown; default pre-fills from current tab (falls back to `i_v` on the "All" tab). The old per-class picker is avoided entirely.
  - "Applies To" pill column added to the table, `class_level='all'` exams tinted blue so the admin can spot the shared ones at a glance.
- [x] Design decision updated in the "Locked design decisions" table above — Weightage is now per-class-level, not per-class-per-exam. `class_exam_configs` stays on the shelf as a latent override layer for rare exceptions.
- [ ] Per-class override UI (class_exam_configs CRUD) — still deferred to Phase 3. Level-based weightage handles the 80% case; the override layer plugs in later for Result Master without re-litigating the base model.

### 0.4 PDF templates
- [x] `migration-017-pdf-templates.sql`
  - `pdf_header_configs(id, template_key UNIQUE, school_name, address_line, affiliation, affiliation_number, logo_url, motto, is_active, timestamps)`.
  - `pdf_footer_configs(id, template_key UNIQUE, disclaimer_text, show_signatures, signature_labels jsonb, is_active, timestamps)`.
  - Seed `template_key='report_card'` with SCHOOL constant values byte-for-byte so first post-migration PDF is identical.
  - RLS: authenticated read, admin write. Mirrored in `supabase-schema.sql`.
- [x] `src/lib/pdf-templates.ts` — `getPdfHeader`, `getPdfFooter`, `getPdfTemplate(supabase, key)` helpers with hardcoded SCHOOL fallback when a row is missing or inactive.
- [x] `ReportCardPDF` extended with optional `footer` prop (disclaimer + signatures), defaulting to current hardcoded values. Signature blocks now rendered from `signature_labels` array.
- [x] `/api/erp/results/report-card/pdf` route fetches `getPdfTemplate(supabase, "report_card")` and passes both header + footer to the PDF component. No user-visible change until admin edits a row.
- [x] `/api/erp/pdf-templates` admin API: GET (single template or list of all known keys) + PUT (upsert header and/or footer for a template_key).
- [x] `/admin/exams/header-footer` page: template selector (Report Card / Admit Card / White Sheet / Green Sheet), two cards (Header + Footer), logo URL field, dynamic signature-label list (add/remove), active toggles. Admin-only.
- [x] Discoverability: tile on `/admin/exams` hub (admin-only) + link in sidebar Exams group. `/admin/exams/header-footer` added to `ADMIN_ONLY_PREFIXES`.

### 0.5 Non-Scholastic masters
- [x] `migration-018-non-scholastic-masters.sql`
  - `non_scholastic_subjects(id, name UNIQUE, sort_order, is_active, timestamps)`.
  - `non_scholastic_sub_subjects(id, parent_subject_id, name, grade_scale_id nullable, sort_order, is_active, timestamps)` with UNIQUE(parent_subject_id, name).
  - Seeded default `non_scholastic` grade scale "Default Co-Scholastic Scale" with CBSE-style A/B/C/D bands (Excellent / Good / Satisfactory / Needs Improvement) + their percentage metadata.
  - RLS: authenticated read, admin write. Mirrored in `supabase-schema.sql`.
- [x] API: `GET/POST /api/erp/non-scholastic/subjects`, `PATCH/DELETE /api/erp/non-scholastic/subjects/[id]`, `GET/POST /api/erp/non-scholastic/sub-subjects` (with `?parent_subject_id` filter), `PATCH/DELETE /api/erp/non-scholastic/sub-subjects/[id]`. All admin-only via `verifyAdmin`. POST/PATCH on sub-subjects guards `grade_scale_id` to only accept non-scholastic scales.
- [x] `/admin/exams/non-scholastic-masters` page: Subjects tab (card grid with edit / add sub / delete) and Sub-Subjects tab (grouped by parent). Delete dialog warns about cascade to sub-subjects. Sub-subject grade scale defaults to "Use default (Default Co-Scholastic Scale)" with per-item override.
- [x] Discoverability: tile on `/admin/exams` hub (admin-only) + link in sidebar Exams group. `/admin/exams/non-scholastic-masters` added to `ADMIN_ONLY_PREFIXES`.

### 0.6 Permissions (deferred — admin-only is the right default here)
- Grade Master, PDF Templates, and Non-Scholastic Masters are all admin-only for now. They touch sensitive school-wide config (grade cutoffs, report-card branding, co-scholastic taxonomy) — not features to delegate lightly to editors.
- Feature keys (`grade_master`, `pdf_templates`, `non_scholastic_master`) can be added later if an admin explicitly asks to delegate. Migration is ~5 LOC in `permissions.ts` + removing the path from `ADMIN_ONLY_PREFIXES` + swapping `verifyAdmin` → `verifyAdminOrEditor(featureKey)` in the 6 API routes.
- [ ] _Defer until asked._ Current access pattern: admin-only, admin sees everything, editors don't see these features at all (neither in sidebar nor via URL).

### Verification before marking Phase 0 done
- [ ] Direct API POST with `marks_obtained > max_marks` returns 400.
- [ ] DB rejects out-of-range inserts even if API is bypassed.
- [ ] Existing `/teacher/results` marks entry still works; grade letters unchanged for same percentages.
- [ ] Existing report card PDF byte-identical vs pre-change for old data.
- [ ] Old exam_types rows default to `kind='term_exam'` with no behavior change.

---

## Phase 1 — Exam Timetable + Admit Card

### 1.1 Exam Schedules (migration + API + admin page) — DONE
- [x] `migration-019-exam-schedules.sql`: `exam_schedules(exam_type_id, class_id, subject_id, exam_date, start_time, end_time, room, invigilator_teacher_id, sort_order, notes)` with UNIQUE(exam_type_id, class_id, subject_id) + CHECK(start_time < end_time).
- [x] API: `GET /api/erp/exam-schedules` (filters by exam_type_id + class_id), POST, `PATCH/DELETE /api/erp/exam-schedules/[id]`. POST translates 23505 unique violations into a friendlier 409 message.
- [x] `/admin/exams/timetable` — class + exam picker at top, sorted schedule table, add/edit dialog restricts subject picker to "class subjects not yet scheduled", time-order client validation. Schema mirrored.

### 1.2 Admit Card Templates (migration + API + admin page) — DONE
- [x] `migration-020-admit-card-templates.sql`: `admit_card_templates` with 11 field toggles, orientation check constraint, signature_labels jsonb default, partial unique index for single default. Seeds a "Standard Admit Card" default template and cross-populates `pdf_header_configs`/`pdf_footer_configs` rows for `template_key='admit_card'` by copying the report_card values.
- [x] API: `GET/POST /api/erp/admit-card-templates` + `PATCH/DELETE /api/erp/admit-card-templates/[id]`. Default-promotion + default-delete-guard with guided flow (same pattern as grade scales).
- [x] `/admin/exams/admit-cards` — tabbed page (Templates active now, Generate stub reserved for Phase 1.3). Card grid with Default badge, Inactive badge, active-field count and preview chips. Edit dialog covers name, orientation, bg image URL, 11 field toggles, instructions textarea (conditional on `show_instructions`), signature-label list (add/remove inline), is_default + is_active toggles. Delete dialog handles default promotion via the same picker pattern.

### 1.3 Admit Card Generation (PDF + flows) — DONE
- [x] `src/components/pdf/AdmitCardPDF.tsx` — A4 portrait/landscape per template.orientation, school header + upper_header banner + student details grid (field toggles respected), optional student photo slot, schedule table (subject/date/time/room), instructions block (split by newlines), footer with configurable signature labels from pdf_footer_configs or template fallback. Supports multi-page via `cards[]` array.
- [x] `/api/erp/admit-cards/pdf?student_id&exam_type_id&template_id` — single student PDF. Auth: admin/teacher/editor any student, student self only, parent linked children (reuses `canViewReportCard`). Resolves template (explicit id → default → 404), student + enrollment + class, exam_type, schedule rows, pdf header/footer via `getPdfTemplate`, logo buffer, student photo (fetched from photo_url or null).
- [x] `/api/erp/admit-cards/bulk?class_id&exam_type_id&template_id&student_ids=a,b,c` — admin+editor-with-`admit_cards` route. Supports both `?student_ids=a,b,c` and repeated `?student_ids=a&student_ids=b`. Empty student_ids means whole class. 200-student safety cap with `413` error message. Fetches schedule once, photos in parallel.
- [x] Generate tab on `/admin/exams/admit-cards` (extracted to `src/components/admin/AdmitCardGenerateTab.tsx`): Exam + Class + Template pickers (default template preselected), "Display students" button loads enrollment list, schedule-missing warning banner with direct link to `/admin/exams/timetable`, per-student SR/Roll/Name/Father/Admission/Phone table with Select All checkbox, per-row quick download, "Download Selected (N)" and "Download Class (N)" actions. Uses browser blob + anchor-click download pattern.
- [x] Student dashboard `/student/admit-cards` — lists exams with at least one schedule row for the student's active class, sorted by earliest exam_date, shows upper_header as a pill badge + date range + paper count + Download button per exam. Friendly empty state when no default template or no scheduled exams.
- [x] Parent dashboard `/parent/admit-cards` — same layout with a child picker (auto-selects single child; dropdown if multiple); falls back on the same PDF endpoint (auth allows parent for linked students).
- [x] Sidebar entries: Student sidebar gets "Admit Cards" link, Parent sidebar gets "Admit Cards" link.

### Verification — done at code level
- [x] `tsc --noEmit`: clean.
- [x] Lint: baseline 21 → 25, the 4 additions match existing codebase patterns on other @react-pdf components (JSX-in-try/catch + Image-alt false positives on PDF Image). No genuine regressions.
- [ ] **User smoke test needed** — see checklist below.

### Permissions + Discovery — DONE
- [x] Added `exam_timetable` and `admit_cards` feature keys to `FeatureKey` union and `FEATURE_CATALOG`. Both are editor-grantable (these are operational, not sensitive config).
- [x] Sidebar Exams group: Timetable + Admit Cards links added.
- [x] `/admin/exams` hub tiles: Exam Timetable + Admit Cards tiles added, wired to per-feature visibility.

### Verification
- [ ] Admit card renders for a sample student across different exams.
- [ ] Bulk generation for a 50-student class < 20s.
- [ ] RLS blocks cross-student admit card downloads.

---

## Phase 2 — Non-Scholastic entries + Marks import/export

> **Migration-numbering note:** 021 and 022 were already taken by
> `exam-class-level` and `result-master`. Phase 2 migration lands at 023.

### Migrations
- [x] `migration-023-non-scholastic-assessments.sql`
  - `non_scholastic_assessments(id, student_id, class_id, exam_type_id, sub_subject_id, grade_label, remarks, entered_by, is_published, timestamps, UNIQUE(student_id, exam_type_id, sub_subject_id))`.
  - Added `class_id` column (not in the original plan) so teacher RLS can reuse the `get_my_class_ids()` helper without a join.
  - RLS mirrors `results`: admin full; teachers read/insert/update within their classes; students/parents read their own published rows (waiting on Phase 5 publish workflow to actually flip the flag).
  - Mirrored in `supabase-schema.sql`.

### Non-Scholastic UI
- [x] `/teacher/non-scholastic` — Class + Exam + Parent-Subject pickers, grid with rows = students (by roll) × columns = sub-subjects, per-cell grade dropdown populated from the applicable scale (sub-subject override → non-scholastic default), Save All upserts everything in one API call (clear = delete). Teacher sidebar got a "Non-Scholastic" link (Sparkles icon).
- [x] `/admin/exams/non-scholastic-assessments` — same grid, classes unfiltered (admin can grade any class). Added to the Exams sidebar group and `/admin/exams` hub tile (`featureKey: "non_scholastic_entry"`).

### Scholastic marks import/export
- [x] `/api/erp/results/export?class_id&exam_type_id&subject_id` — returns CSV (headers: `admission_no, roll_number, student_name, marks_obtained, max_marks, grade`). Blank rows when no mark is saved yet, so the same endpoint doubles as the import template.
- [x] `/api/erp/results/import` — multipart upload (file, class_id, exam_type_id, subject_id, dry_run). Parses CSV/XLSX via the already-installed `xlsx` library. Matches students by `admission_no` first, falls back to `roll_number`. Rejects out-of-range marks (0..max_marks) and duplicate admission numbers. Commit is fail-closed: any row error → zero rows applied, even with dry_run=false. Applies grade via the existing `resolveGradeScaleForClass` + `computeGrade` helpers.
- [x] `src/components/erp/MarksImportDialog.tsx` — reusable upload → preview → confirm dialog with per-row status badges (OK / blank / error) and a "Download template" shortcut that hits the export endpoint. Wired into `/teacher/results/page.tsx` alongside Export and Save All.
- [x] Template download: reuses `/api/erp/results/export` (returning one row per enrolled student with blank marks), accessible from the dialog + from Export button in the results page header.

### Marks-entry UX enhancements (Appendix E)
- [x] **Order by** dropdown on `/teacher/results` — Roll / Name / Admission — sorts the in-memory table without refetching. `student_enrollments` query now pulls `admission_no` so the Admission sort works.
- [x] **Exam Info** button on `/teacher/results` — opens a dialog with date, time, room, invigilator, and notes for the current (class × subject × exam) pulled from `exam_schedules`. Friendly empty state when no schedule row exists yet.
- [x] **Default Max Marks** override — deferred to Phase 4 (Result Master). `result_master_exam_configs.max_marks_override` already models the override, so injecting it into the marks-entry flow becomes one line once Result Master ships. Keeping Phase 2 scoped.

### Permissions
- [x] Added `non_scholastic_entry` to `FeatureKey` + `FEATURE_CATALOG` (maps to `/admin/exams/non-scholastic-assessments`). Editor-grantable.
- [ ] `marks_import_export` — skipped for now. Teachers already have the capability via their existing class-subject grants, and there's no dedicated admin page to gate. Can add later if we expose a standalone admin import page.

### Verification
- [ ] Import of 500-row CSV rejects invalid rows without corrupting valid ones.
- [ ] Export → reimport produces no diff.
- [ ] Non-scholastic does not leak into scholastic totals (Phase 4 final-result engine will exclude).
- [ ] Import cannot save `marks_obtained > max_marks` (DB CHECK holds even if app logic misses).
- [x] `tsc --noEmit`: clean.
- [x] Lint: same total as Phase 1.3 end (25 problems), no new issues introduced.

---

## Phase 3 — Class Tests (dedicated module — sibling of exam_types)

> **Why separate:** admin confirmed (post-planning) that class tests need their own frequent-entry flow: "simpler marking, may or may not appear in final report, own creation / marks entry / reports, linked to Result calculation via weightage." The `kind='class_test'` option on `exam_types` stays for schools that prefer the lightweight path — it coexists with this full module.
>
> **Migration-numbering note:** `migration-021-exam-class-level.sql` was landed independently (adds `exam_types.class_level` with the same taxonomy as `fee_structures`: all / nursery_ukg / i_v / vi_viii / ix_x / xi_xii). Pending migrations below renumber from 022 onward.

### Migrations
- [ ] `migration-022-class-tests.sql`
  - `class_tests(id, class_id, subject_id, name, test_date, max_marks, weightage, term_id nullable, is_published bool, created_by, timestamps)` — single test tied to a subject for a class. `name` is a short label like "Unit 1 Test" or "FA-1".
  - `class_test_results(id, class_test_id, student_id, marks_obtained, grade nullable, remarks nullable, entered_by, timestamps, UNIQUE(class_test_id, student_id))` with `CHECK(marks_obtained >= 0 AND marks_obtained <= max_marks)` (same pattern as `results`).
  - RLS mirrors `results`: teachers enter, admins manage, students/parents read their own when `is_published = true`.

### API
- [ ] `GET/POST /api/erp/class-tests` (filter by class_id + subject_id + term_id).
- [ ] `PATCH/DELETE /api/erp/class-tests/[id]`.
- [ ] `POST /api/erp/class-tests/[id]/marks` — bulk marks upsert with same 0..max_marks validation + grade computation (uses `grading.ts` resolver, same as `results/bulk`).

### Teacher flow
- [ ] `/teacher/class-tests` — teacher picks class → subject → lists their class tests with inline "Enter Marks" button → bulk grid like the existing results entry page. Default to "undefined grade" while marks blank; compute grade from the class's resolved scale.

### Admin UI
- [ ] `/admin/exams/class-tests` — admin CRUD across classes (list, create, delete). Admin can view any teacher's marks. Links into the Result Master so CT weightage contributes to term totals.
- [ ] `/admin/exams/class-tests/[id]` — detail view: marks entry grid + publish toggle.

### Permissions
- [ ] Add `class_tests` feature key (editor-grantable).

### Verification
- [ ] Teacher can only see class tests for subjects they teach.
- [ ] Student/parent see only published class test marks.
- [ ] Deleting a class test cascades to class_test_results (FK ON DELETE CASCADE).
- [ ] Marks validation rejects out-of-range writes at both API + DB layers.

---

## Phase 4 — Result Master + Final Result + richer Report Card

> **Two-level config** per explicit admin spec:
> - **Result Master (Basic)** — subject inclusion, main/optional split, per-subject pass marks, overall pass criteria.
> - **Result Advanced Settings (Power)** — weightage system (CT × Half-Yearly × Annual mixing, supports CCE term-wise composition), best-of rule (best of N class tests), grace marks (subject or total), include/exclude specific subjects from total, rounding, non-scholastic display (show / hide / placement).
>
> **Default composition pattern** (matches Indian CCE): Term 1 = FA-I + FA-II + SA-I; Term 2 = FA-III + FA-IV + SA-II; Final = Term 1 + Term 2. Modeled via a `terms` table + `exam_types.term_id` FK + `class_tests.term_id` FK. Admin can override the shape via weightages.

### Migrations
- [ ] `migration-023-terms.sql`
  - `terms(id, academic_year_id, name, sort_order, UNIQUE(academic_year_id, name))`.
  - Add `term_id uuid REFERENCES terms(id) ON DELETE SET NULL` to `exam_types` and `class_tests`.
  - Backfill: for existing academic years, create "Term 1" + "Term 2" and leave `term_id` null on existing exam_types until admin assigns.
- [ ] `migration-024-result-master.sql`
  - `result_masters(id, class_id, academic_year_id, grade_scale_id nullable, pass_mark_per_subject, pass_mark_overall, grace_marks_per_subject, grace_marks_total, rounding_rule text check in ('none','round','floor','ceil','round_half_up'), non_scholastic_display text check in ('hide','inline','separate_page'), show_rank bool, show_extra_separately bool, best_of_class_tests int nullable, timestamps, UNIQUE(class_id, academic_year_id))`.
  - `result_master_subjects(id, result_master_id, subject_id, role text check in ('main','extra','excluded_from_total'), sort_order, UNIQUE(result_master_id, subject_id))` — note the new `excluded_from_total` role (covers "exclude GK from total" case).

### Final Result engine
- [ ] `src/lib/final-result.ts` — term-aware computation:
  - For each term, per subject: aggregate (class_tests + exam_types) weighted by `class_exam_configs.weightage` / `class_tests.weightage`. Apply "best of" rule if configured (e.g. best 2 of 4 class tests in Term 1).
  - Apply grace marks per subject, then check pass criteria.
  - Roll term totals into Final Result per the admin-configured aggregation.
  - Apply rounding rule last.
  - Rank: pluggable (optional — only if `show_rank`).
  - Unit-testable pure functions; DB fetch is a thin layer on top.

### Report Card PDF rewrite
- [ ] `src/components/pdf/ReportCardPDF.tsx`:
  - Main / Extra / Excluded-from-total subject groupings.
  - Non-scholastic block placement per `non_scholastic_display` setting (hide / inline / separate page). Non-scholastic rows show letter grade only, never mark totals.
  - Term-wise summary rows (T1 / T2) → Final Result block.
  - Rank (if enabled).
  - Upper header banner from `exam_types.upper_header`.
  - Header/footer from `pdf_header_configs` / `pdf_footer_configs` (already wired in Phase 0.4).

### Admin UI
- [ ] `/admin/exams/terms` — CRUD terms per academic year + link exam_types / class_tests to terms.
- [ ] `/admin/exams/result-master` — per class+year editor:
  - Subject picker with role selector (Main / Extra / Excluded from total).
  - Weightage matrix per exam_type × term with sum-to-100% warning.
  - Best-of-class-tests selector (N).
  - Grace marks (subject + total).
  - Pass mark (subject + overall) editors.
  - Rounding rule dropdown.
  - Non-scholastic display control (hide / inline / separate page).
  - Live preview pane rendering a sample student's report card.

### Fallback
- [ ] If no `result_masters` row exists for a class, PDF renders the legacy per-exam layout (the one that ships today). Result Master is opt-in per class — no regression for classes that haven't been configured.

### Permissions
- [ ] `result_master` feature key.

### Verification
- [ ] Pre-config classes render byte-identical PDFs vs today.
- [ ] Post-config: weighted final result matches hand-calculated CCE example for ≥3 students.
- [ ] Best-of rule: 4 class tests with marks [20,40,60,80] at max 100 each → best 2 sum = 140/200 = 70%.
- [ ] Grace marks push a 39% subject to the configured pass threshold only when within grace budget.
- [ ] "Excluded from total" subjects render on the card but don't contribute to term/final totals.
- [ ] Non-scholastic block placement toggles correctly.
- [ ] Rounding rules produce expected integers at the boundary cases.

---

## Phase 5 — Publish workflow (two-stage)

> **Two actions** (confirmed): **Publish Result** = makes marks visible in the parent/student portal, still editable; **Publish Marksheet** = locks the data, generates the final PDF, used for printing & official distribution. Unpublishing a finalized marksheet requires a reason.

### Migrations
- [ ] `migration-025-publish-workflow.sql`
  - `marksheet_publications(id, student_id, exam_type_id, published_at, published_by, version int, snapshot jsonb, unpublished_at nullable, unpublish_reason text nullable, UNIQUE(student_id, exam_type_id, version))`
  - `publish_events(id, event_type text, class_id nullable, exam_type_id, actor_id, acted_at, note)`

### Admin UI
- [ ] `/admin/exams/publish` — two-column view per class+exam:
  - Left: Online Publish — bulk toggle `results.is_published`.
  - Right: Finalize Marksheet — snapshot + lock PDFs. Unpublishing requires reason.

### API
- [ ] `/api/erp/results/publish` (POST).
- [ ] `/api/erp/results/finalize-marksheet` (POST, stores JSON snapshot).
- [ ] Report-card PDF serves from snapshot when a finalized version exists.

### Permissions
- [ ] Add `publish_results`, `publish_marksheet` feature keys.

### Verification
- [ ] Publishing makes marks visible to students/parents immediately.
- [ ] Finalized marksheet PDF byte-identical on repeat downloads.
- [ ] Edits after finalization do NOT change the snapshot.
- [ ] `publish_events` logged for every action.

---

## Phase 6 — White Sheet, Green Sheet, PTM Notes, PTM Format, Blank Marks List

### White Sheet
- [ ] `/admin/exams/white-sheet` — class+exam grid (rows = students by roll, cols = subjects), totals, grade.
- [ ] Driven by `result_masters` (main/extra split).
- [ ] PDF + CSV export.

### Green Sheet
- [ ] `/admin/exams/green-sheet` — class, across all applicable exams in the year.
- [ ] Per-exam totals + final weighted result.
- [ ] PDF + CSV export.

### PTM Notes (A.4 in original requirements — student-wise meeting records)
- [ ] `migration-026-ptm-notes.sql`:
  - `ptm_notes(id, student_id, exam_type_id nullable, meeting_date, attendance text check in ('present','absent'), teacher_remarks, parent_remarks nullable, action_points, recorded_by, created_at, updated_at, UNIQUE(student_id, meeting_date))`.
  - `school_meeting_counts(id, academic_year_id, exam_type_id nullable, class_id nullable, total_meetings int, updated_at)` — mirrors the "Total School Meetings" counter field in the legacy platform.
  - RLS: teachers/admins/editors with `ptm_notes` feature key write; parents can read their own children's notes.
- [ ] API:
  - `GET /api/erp/ptm-notes?class_id&exam_type_id&student_id` + POST bulk upsert.
  - `POST /api/erp/ptm-notes/import` — CSV bulk import (legacy platform has "Import Meetings").
  - `GET /api/erp/ptm-notes/report?class_id&exam_type_id` — PDF of all students' remarks (legacy "Report" button).
- [ ] Teacher UI at `/teacher/ptm-notes` — Class + Section + Exam + "Total School Meetings" counter + Order by filters, bulk grid with per-student date/attendance/teacher remarks/parent remarks/action points columns.
- [ ] Parent portal: expose the student's PTM notes under a new "PTM" tab — read-only.
- [ ] Permission: `ptm_notes`.

### PTM Format (printable template — distinct from PTM Notes)
- [ ] Admin-configurable template (`ptm_formats` table) for the pre-meeting handout.
- [ ] Per-student generation pulls: student details, subject-wise performance snapshot (from `results`), teacher remarks section (blank to write on), parent signature line.
- [ ] PDF download from `/admin/exams/ptm-format` or teacher-initiated download.
- [ ] Permission: `ptm_format`.

### Blank Marks List
- [ ] Subject + class + exam → print-ready blank PDF with roll/name/empty-marks column.

### Permissions
- [ ] Add `white_sheet`, `green_sheet`, `ptm_notes`, `ptm_format`, `blank_marks_list` feature keys.

### Verification
- [ ] Sheets respect result_master config (main vs extra, included/excluded exams).
- [ ] Blank marks list paginates cleanly for 60+ student classes.
- [ ] PTM note attendance persists through edits; parents see only their children.

---

## Phase 7 — Roll Number dynamic reordering

> **Scope expansion:** admin confirmed the requirement is broader than alphabetical-only. Needed: auto-generate on admission, re-assign annually, bulk reorder by admin-chosen sort key (Name / Admission No / Previous result rank), section-wise unique numbering, explicit "Generate Roll No" button per class.

### Migrations
- [ ] `migration-027-roll-number-auto.sql`
  - Add `roll_number_manual bool default false` to `student_enrollments`.
  - Function `recompute_roll_numbers(p_class_id uuid, p_sort_key text DEFAULT 'name')`:
    - `p_sort_key` accepts `'name'` (alphabetical), `'admission_no'` (ascending), `'previous_rank'` (from last applicable result).
    - Sections get independent 1..N numbering.
    - Skip rows where `roll_number_manual = true`.
  - Triggers for auto-recompute on enrollment INSERT / DELETE, student name UPDATE, status UPDATE — all default to `'name'` sort, admin can manually override via the "Generate Roll No" button with a different sort key.

### Backfill
- [ ] One-off: call `recompute_roll_numbers()` for every class with active enrollments.

### Admin UI
- [ ] `/admin/people/students` enrollment edit: show "auto-assigned" with toggle for manual override.
- [ ] "Generate Roll No" button on `/admin/academics/classes/[id]`: opens a small dialog with sort key picker (Name / Admission No / Previous result rank), confirms the impact, then runs `recompute_roll_numbers(class_id, sort_key)`.

### Verification
- [ ] New student mid-year → subsequent roll numbers shift correctly.
- [ ] Rename a student → roll order updates.
- [ ] Set status='passed' → student drops, remaining compact.
- [ ] Manual override persists through unrelated recomputes.
- [ ] Admin-triggered re-sort by admission_no produces expected ordering for a sample class.
- [ ] Different sections of the same class get independent 1..N series.

---

## Phase 8 — Supplementary Exam workflow (NEW — surfaced from legacy-platform screenshots)

> Schools have students who fail some subjects but qualify for a retest ("supplementary"). Legacy platform's Result Advance Settings store `MinForSupplementary=25`, `SupplementarySubs=2` (max 2 subjects supplementary). Our Phase 4 Result Master captures division thresholds and grace marks; the *workflow* for managing supplementary attempts is separate.

### Migrations
- [ ] `migration-028-supplementary.sql`
  - `supplementary_attempts(id, student_id, parent_exam_type_id, subject_id, retest_date, marks_obtained, max_marks, passed bool, entered_by, timestamps, UNIQUE(student_id, parent_exam_type_id, subject_id))`.
  - FK on `exam_types` + `subjects`; cascade appropriately.

### API + UI
- [ ] List of students flagged supplementary (derived from Result Master rules).
- [ ] Per-student retest marks entry.
- [ ] Recompute final division after supplementary passes, update published marksheet.

### Permission: `supplementary_exams`.

_(Detailed design deferred until Phase 4 ships so we can see exactly how the division/grace flow emerges in practice.)_

---

## Appendix — Findings from Legacy Platform Screenshots (for reference)

Reviewed 17 screenshots of an existing school ERP platform. Features already captured above, plus the following inflection points worth calling out separately so they don't get lost:

### A. Marksheet Header/Footer is a rich HTML editor with keyword substitution
Legacy admin builds report-card headers in a WYSIWYG editor using placeholders like `#STUDENTNAME#`, `#FATHERNAME#`, `#CLASS#`, `#Section#`, `#RollNo#`, `#SESSION#`, `#DOB#`, `#OverAllGrade#`, `#Rank#`, `#Division#`, `#ObtMaxMarks#`, `#CGPA#`, `#Remark#`, `#Photo#`, `#House#`, `#Top10Sec#` (top 10 in section photo), `#BoardRegNo#`, `#ATTENDANCE#`, `#AttendancePer#`. At render time the engine substitutes real values. Multiple footer templates exist per faculty ("PRIMARY FOOTER", "REPORT CARD XI", "III TO VIII REPORT CARD").

This is substantially more flexible than our current hardcoded PDF layout. Potential future phase (tentatively after Phase 4):

- **Phase 4a — Keyword-substitution PDF template designer**:
  - Add `marksheet_templates(id, name, faculty_scope class_level, header_html, footer_html, body_html, is_default, timestamps)`.
  - Build a keyword reference panel listing every placeholder + its source column / computed field.
  - Extend `ReportCardPDF` with an HTML-template render path (using `html-pdf-node` or `@react-pdf` with an HTML-to-JSX converter) alongside the current code-driven layout.
  - Admin picks: code template (current) OR HTML template (legacy-parity).
- _Decision deferred until Phase 4 ships — may prove unnecessary if the code template with configurable blocks is sufficient._

### B. Result Advance Setting as Key-Value store per (Session × Faculty × Category)
The legacy Advance Setting page stores rules as name/value pairs grouped by Category ("Marks of Division", likely also "Grace", "Non-Scholastic Thresholds"). Example values:
- `Distinction=75`, `FirstDiv=60`, `SecondDiv=45`, `ThirdDiv=36` (division thresholds)
- `ByGraceSingleSub=5`, `ByGraceFirstSub=2`, `ByGraceSecondSub=2` (grace tiers)
- `MinForPassInMainExam=24`, `MinForSupplementary=25`, `SupplementarySubs=2` (supplementary rules)

**Design note for Phase 4:** consider modeling Result Advance Settings as `result_advance_settings(id, academic_year_id, class_level, category, name, value numeric, value_text text nullable, UNIQUE(academic_year_id, class_level, category, name))` rather than a fixed set of columns — gives admin extensibility to add new rules without schema changes.

### C. Division system — a new output dimension
Distinction / First Division / Second Division / Third Division is a computed classification per student (alongside letter grade + percentage) based on overall percentage thresholds. Needs to be surfaced on the report card. Fold into Phase 4 Result Master.

### D. Supplementary Exam rules alongside Division
Students who miss the pass mark by a narrow margin go to Supplementary. Tracked separately (Phase 8 above). Result Master decides who qualifies.

### E. Marks Entry filter additions (Phase 2)
- **"Default Max Marks"** text field: override `exam_types.max_marks` for a specific class+subject entry session (e.g., practicals might have 20 max in this exam instead of the default 100).
- **"Order by"** dropdown: Name / Roll / Admission No — affects the order students appear in the marks grid.
- **"Exam Info"** button: opens a side panel with the exam schedule (date/time/room for this subject) so the teacher can cross-check while entering marks.

### F. "Import from Previous Year" button on masters
Non-Scholastic Sub-Subject Master (at least) has a one-click import from last session. Implement as a cross-cutting feature on every master that typically carries forward: non-scholastic subjects/sub-subjects, exam types, exam schedules, result masters, grade scales. Ship alongside Phase 3/4 where it becomes most valuable.

### G. Per-class Non-Scholastic sub-subjects
Legacy UI filters sub-subjects per Class (`III` in the screenshot). Our current `non_scholastic_sub_subjects(parent_subject_id, name, …)` has no class scoping — currently global under a subject. Either:
1. Add `class_id uuid nullable` to `non_scholastic_sub_subjects` (null = applies to all classes), OR
2. Add a join table `class_non_scholastic_sub_subjects(class_id, sub_subject_id)`.

Option 2 is cleaner if admins often share sub-subjects across classes (e.g. "Discipline → Punctuality" applies to all). Bring in when Phase 2 non-scholastic entry goes live, so teachers see the right sub-subjects per class.

### H. Change-order UX on masters
Legacy supports drag-to-reorder on masters (visible 4-direction-arrow handle on Non-Scholastic Sub-Subject rows). Our masters already have `sort_order` columns — just need the drag-and-drop UI, add as polish pass per master.

---

## Review section (filled in after implementation)

_TBD — will summarize what shipped, deviations from plan, and follow-ups._
