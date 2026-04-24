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
| Weightage | Per-class-per-exam via new join table `class_exam_configs`. Not a single column on `exam_types`. |
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
- [ ] `migration-016-exam-type-extensions.sql`
  - Add to `exam_types`: `kind text default 'term_exam' check in ('term_exam','class_test','practical')`, `upper_header text`.
  - Add `class_exam_configs(id, class_id, exam_type_id, is_applicable bool default true, weightage numeric, max_marks_override numeric, sort_order, UNIQUE(class_id, exam_type_id))`.
- [ ] `/admin/exam-types` UI: add Kind dropdown + Upper Header text field.

### 0.4 PDF templates
- [ ] `migration-017-pdf-templates.sql`
  - `pdf_header_configs(id, template_key text, school_name, address_lines jsonb, logo_url, affiliation, motto, colors jsonb, is_active, timestamps)`
  - `pdf_footer_configs(id, template_key, left_text, center_text, right_text, show_signatures, signature_labels jsonb, is_active, timestamps)`
  - Seed `template_key='report_card'` with current hardcoded values.
- [ ] `src/lib/pdf-templates.ts` — loader with hardcoded fallback.
- [ ] `/admin/exams/header-footer` — CRUD UI + logo upload.

### 0.5 Non-Scholastic masters
- [ ] `migration-018-non-scholastic-masters.sql`
  - `non_scholastic_subjects(id, name, sort_order, is_active, created_at)`
  - `non_scholastic_sub_subjects(id, parent_subject_id, name, grade_scale_id, sort_order, is_active, created_at)`
- [ ] `/admin/exams/non-scholastic-masters` — two-tab page.

### 0.6 Permissions
- [ ] Extend `src/lib/permissions.ts` with feature keys: `grade_master`, `pdf_templates`, `non_scholastic_master`.

### Verification before marking Phase 0 done
- [ ] Direct API POST with `marks_obtained > max_marks` returns 400.
- [ ] DB rejects out-of-range inserts even if API is bypassed.
- [ ] Existing `/teacher/results` marks entry still works; grade letters unchanged for same percentages.
- [ ] Existing report card PDF byte-identical vs pre-change for old data.
- [ ] Old exam_types rows default to `kind='term_exam'` with no behavior change.

---

## Phase 1 — Exam Timetable + Admit Card

### Migrations
- [ ] `migration-019-exam-schedules.sql`
  - `exam_schedules(id, exam_type_id, class_id, subject_id, exam_date, start_time, end_time, room, invigilator_teacher_id, sort_order, timestamps, UNIQUE(exam_type_id, class_id, subject_id))`
- [ ] `migration-020-admit-card-settings.sql`
  - Seed `pdf_header_configs`/`pdf_footer_configs` rows for `template_key='admit_card'`.
  - `admit_card_settings(id, exam_type_id, show_photo, show_dob, show_father_name, show_address, show_schedule, instructions text, signatures jsonb, is_active, UNIQUE(exam_type_id))`.

### Pages
- [ ] `/admin/exams/timetable` — grid editor per exam+class, duplicate-checker, conflict warning.
- [ ] `/admin/exams/admit-cards` — per-student or bulk (class-level) generation.
- [ ] Student dashboard: "Download Admit Card" once `is_active` is true and schedule exists.

### PDF + API
- [ ] `src/components/pdf/AdmitCardPDF.tsx` — driven from settings + schedule + header/footer configs.
- [ ] `/api/erp/admit-cards/pdf` — single student.
- [ ] `/api/erp/admit-cards/bulk` — class-level (multi-page PDF).

### Permissions
- [ ] Add `exam_timetable`, `admit_cards` feature keys.

### Verification
- [ ] Admit card renders for a sample student across different exams.
- [ ] Bulk generation for a 50-student class < 20s.
- [ ] RLS blocks cross-student admit card downloads.

---

## Phase 2 — Non-Scholastic entries + Marks import/export

### Migrations
- [ ] `migration-021-non-scholastic-assessments.sql`
  - `non_scholastic_assessments(id, student_id, exam_type_id, sub_subject_id, grade_label, remarks, entered_by, timestamps, UNIQUE(student_id, exam_type_id, sub_subject_id))`

### Non-Scholastic UI
- [ ] `/teacher/non-scholastic` — per-class per-exam grid for selected sub-subjects.
- [ ] `/admin/exams/non-scholastic-assessments` — admin override/view.

### Scholastic marks import/export
- [ ] `/api/erp/results/export` — CSV/XLSX per class+exam+subject.
- [ ] `/api/erp/results/import` — CSV upload with dry-run preview + row-level errors.
  - Reuses Phase 0 `max_marks` validator so import cannot bypass bounds.
- [ ] `src/components/erp/MarksImportDialog.tsx` — multi-step UI (upload → preview → confirm).
- [ ] Template download next to import button.

### Permissions
- [ ] Add `non_scholastic_entry`, `marks_import_export` feature keys.

### Verification
- [ ] Import of 500-row CSV rejects invalid rows without corrupting valid ones.
- [ ] Export → reimport produces no diff.
- [ ] Non-scholastic does not leak into scholastic totals.
- [ ] Import cannot save `marks_obtained > max_marks` (DB CHECK holds even if app logic misses).

---

## Phase 3 — Result Master + richer Report Card + Final Result

The biggest phase. Everything above plugs into the Report Card here.

### Migrations
- [ ] `migration-022-result-master.sql`
  - `result_masters(id, class_id, academic_year_id, include_non_scholastic, show_rank, grade_scale_id, pass_mark_per_subject, grace_marks_max, show_extra_separately, timestamps, UNIQUE(class_id, academic_year_id))`
  - `result_master_subjects(id, result_master_id, subject_id, role text check in ('main','extra'), sort_order, UNIQUE(result_master_id, subject_id))`

### Final Result computation
- [ ] `src/lib/final-result.ts` — given (student_id, academic_year_id):
  - Look up student's class → result_master → applicable exams via `class_exam_configs`.
  - Per subject: weighted sum of (marks_obtained / max_marks × weightage).
  - Apply grade scale from result_master (override) or default.
  - Return per-subject + overall + rank.
- [ ] Compute on-demand; add caching if slow (>500ms).

### Report Card PDF rewrite
- [ ] `src/components/pdf/ReportCardPDF.tsx` — render from `result_masters`:
  - Main vs Extra subject split
  - Non-scholastic block (if enabled)
  - Final Result section (cross-exam weighted summary)
  - Rank (if enabled)
  - Upper header banner from `exam_types.upper_header`
  - Header/footer from configs
- [ ] Fallback: if no result_master exists for the class, render old layout unchanged.

### Admin UI
- [ ] `/admin/exams/result-master` — per class+year config with subject picker (main/extra), weightage editor (with "sum ≠ 100%" warning), pass/grace marks, grade scale override, live preview pane.

### Permissions
- [ ] Add `result_master` feature key.

### Verification
- [ ] Pre-config classes render identical PDFs to before.
- [ ] Post-config: weighted final result matches hand-calculated example for ≥3 students.
- [ ] Rank calculation stable for ties.
- [ ] Non-scholastic block appears/disappears per `include_non_scholastic`.

---

## Phase 4 — Publish workflow (two-stage)

### Migrations
- [ ] `migration-023-publish-workflow.sql`
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

## Phase 5 — White Sheet, Green Sheet, PTM Format, Blank Marks List

### White Sheet
- [ ] `/admin/exams/white-sheet` — class+exam grid (rows = students by roll, cols = subjects), totals, grade.
- [ ] Driven by `result_masters` (main/extra split).
- [ ] PDF + CSV export.

### Green Sheet
- [ ] `/admin/exams/green-sheet` — class, across all applicable exams in the year.
- [ ] Per-exam totals + final weighted result.
- [ ] PDF + CSV export.

### PTM Format
- [ ] Admin-configurable template (`ptm_formats` table).
- [ ] Generates per-student PTM sheet with marks + attendance + remarks.

### Blank Marks List
- [ ] Subject + class + exam → print-ready blank PDF with roll/name/empty-marks column.

### Permissions
- [ ] Add `white_sheet`, `green_sheet`, `ptm_format`, `blank_marks_list` feature keys.

### Verification
- [ ] Sheets respect result_master config (main vs extra, included/excluded exams).
- [ ] Blank marks list paginates cleanly for 60+ student classes.

---

## Phase 6 — Roll Number dynamic reordering

### Migrations
- [ ] `migration-024-roll-number-auto.sql`
  - Add `roll_number_manual bool default false` to `student_enrollments`.
  - Function `recompute_roll_numbers(p_class_id uuid)`:
    - Alphabetical by `students.full_name ASC` over active enrollments.
    - Skip rows where `roll_number_manual = true`.
  - Triggers:
    - `AFTER INSERT OR DELETE ON student_enrollments` → recompute for affected class.
    - `AFTER UPDATE OF full_name ON students` → recompute for all active-enrollment classes of that student.
    - `AFTER UPDATE OF status ON student_enrollments` → recompute (status change adds/removes from active set).

### Backfill
- [ ] One-off: call `recompute_roll_numbers()` for every class with active enrollments.

### Admin UI
- [ ] `/admin/students` enrollment edit: show "auto-assigned (alphabetical)" with toggle for manual override.

### Verification
- [ ] New student mid-year → subsequent roll numbers shift correctly.
- [ ] Rename a student → roll order updates.
- [ ] Set status='passed' → student drops, remaining compact.
- [ ] Manual override persists through unrelated recomputes.

---

## Review section (filled in after implementation)

_TBD — will summarize what shipped, deviations from plan, and follow-ups._
