# Articles fix + Bulk import for Fees & Results

Two independent tracks. Both ship as separate PRs so they can roll out at different times.

---

## Track A — Latest Updates / Articles 404 fix

### Root cause

The website home page section `LatestUpdates` (`apps/website/src/components/home/LatestUpdates.tsx`) renders one of two sources:

1. **Published `articles`** — primary; links to `/articles/[slug]` which is a real dynamic route.
2. **`section_cards`** (fallback) — used when no articles are published; links to whatever `card.link` is, defaulting to `/articles`.

Production currently has **no published articles**, so it falls back to `section_cards`. The visible cards have placeholder `link` values like `"latest update 4"` (no leading `/`). When clicked, Next's `<Link>` treats them as relative paths and resolves to `https://www.nkpublicschool.com/latest%20update%204`, which 404s.

The `/articles` index and `/articles/[slug]` detail routes already exist and work — the page just has no data and the fallback's links are unsafe.

### Fix (two complementary changes)

- **A1.** Harden `LatestUpdates` so a broken `link` field can never produce a bad URL.
  - If `card.link` is empty, not a string, or doesn't start with `/` or `http`, render the card as non-clickable OR route it to `/articles`.
  - Same defensive guard on `apps/website/src/app/articles/page.tsx` is not needed (real DB articles always have slugs from `slugify()`).
- **A2.** Seed 3–4 real articles via the CMS admin so the home page shows live, valid links.
  - Use `apps/cms/src/app/articles/page.tsx` UI (already supports title → slug, markdown, cover image).
  - Suggested seed titles (user can edit):
    - "Admissions open for 2026–27 academic year"
    - "Annual Sports Meet 2026 — schedule & highlights"
    - "NKPS Science Exhibition winners"
    - "Welcome to the new academic session"

### Checklist

- [x] A1. Add link-safety guard in `LatestUpdates.tsx` (sanitize `card.link`)
- [ ] A2. Verify `getPublishedArticles()` returns nothing in production, falling through to cards
- [ ] A3. (Optional) Hide the entire "Latest Updates" section when both sources are empty — already done, just confirm
- [x] A4. Draft 3–4 real article markdowns at `tasks/article-drafts.md` (user to paste into `/admin/articles` CMS)
- [ ] A5. Smoke test home page → click each card → lands on `/articles/<slug>` 200

---

## Track B — Bulk import: Fees & Results (migration from previous software)

Mirror the existing `MarksImportDialog` + `/api/results/import` pattern (already proven in this repo).

### Design principles

- **Dry-run first.** Every upload previews row-by-row with errors before commit. Commit only when zero errors.
- **Idempotent commits.** Re-uploading the same file (same `receipt_number` for fees; same `(student, subject, exam)` for results) updates rather than duplicates.
- **Sample template per importer.** "Download sample" button returns an XLSX with the correct headers, a couple of example rows, and a header comment row explaining each column.
- **5 MB upload cap.** Matches existing `/api/results/import`.
- **RBAC.** Reuse `verifyAdminOrEditor("fees")` and `verifyAdminOrEditor("results")`.
- **Audit trail.** Add a `source` column on `fee_payments` and `results` to mark migrated rows (e.g., `'erp_native'` vs `'historical_import'`) so we can always tell what came from the previous software.

### B1. Fees bulk import (NEW)

**Use case:** import historical fee payment logs from the previous software for current and previous academic years, so dues/no-dues continuity isn't broken when we switch.

**Migration:**
- New file: `scripts/migrations/erp/migration-051-import-source-fees.sql`
  ```sql
  ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'erp_native';
  ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS import_batch_id uuid;
  CREATE INDEX IF NOT EXISTS fee_payments_import_batch_idx ON fee_payments(import_batch_id);
  ```
- Also append to `supabase-schema.sql` (per saved rule "Schema mirrors migrations").
- `source` values: `'erp_native'` (default), `'historical_import'`.
- `import_batch_id` lets admins revert a single upload if needed.

**API:** `apps/erp/src/app/api/fees/bulk-import/route.ts`
- POST multipart: `file`, `academic_year_id`, `dry_run` ("true"|"false"), `mode` ("historical"|"current")
- Columns expected in the file:
  | Column | Required | Notes |
  |---|---|---|
  | `admission_no` | yes | Lookup key. Student must exist. |
  | `academic_year` | yes | e.g. `2024-25`. Must match a row in `academic_years`. |
  | `class_name` | for ambiguity | Resolves enrollment if student spans years |
  | `fee_type` | yes | One of: Tuition / Lab / Annual / Transport / Other |
  | `frequency` | yes | monthly / quarterly / annual / one_time |
  | `period_label` | yes | e.g. `Apr 2024`, `Q1 2024-25`, `2024-25` (human-readable; stored in `remarks`) |
  | `amount_due` | yes | Decimal |
  | `amount_paid` | yes | Decimal. `0` for unpaid; partial allowed |
  | `payment_date` | conditional | Required if `amount_paid > 0`. ISO date |
  | `payment_method` | conditional | cash / cheque / upi / card / bank_transfer / other. Required if paid |
  | `receipt_number` | conditional | Required if paid; used as idempotency key |
  | `remarks` | no | Free text |

- Server flow:
  1. Auth + RBAC check (`fees` feature).
  2. Parse XLSX via SheetJS, normalize headers (same `normalizeKey` helper).
  3. Build lookup maps for `students` (by `admission_no`), `academic_years` (by `name`), `fee_structures` (by `academic_year_id` + `class_name` + `fee_type` + `frequency`).
  4. Per row: validate types, resolve student, resolve-or-create `fee_structure`, resolve-or-create `payment_order` (one per student × fee_structure × period_label).
  5. Collect row results with `ok`, `error`, `matched_student_id`, `resolved_structure_id`.
  6. If dry run OR any row errors → return preview, commit nothing.
  7. Else: create `import_batch_id`, upsert `fee_payments` keyed on `receipt_number` with `source='historical_import'`.
- Returns `{ summary, rows }` shape mirroring `/api/results/import`.

**Sample template API:** `apps/erp/src/app/api/fees/bulk-import/template/route.ts`
- GET — returns an XLSX with: (a) header row, (b) 2 example rows (one paid, one unpaid), (c) a small README sheet explaining each column and allowed values.
- Optional query param `?academic_year_id=xxx&class_id=yyy` → prefills `admission_no`, `student_name` (for reference, ignored at import), `academic_year` for that class's currently-enrolled students.

**UI:** new component `apps/erp/src/components/FeesBulkImportDialog.tsx`
- Trigger: new "Bulk import" button on `/admin/fees` (page already imports `FileSpreadsheet` icon — wire it up).
- Dialog shows: academic year picker, mode toggle (Historical / Current), download-sample button, file picker.
- Click "Preview" → shows table with row results and inline errors.
- Click "Commit" → enabled only when zero errors. Shows progress + success toast.
- After commit: emit toast "Imported N rows. Batch ID: …" and call `onImported()` so the dashboard refetches.

### B2. Results bulk historical import (NEW — multi-row, multi-exam)

The existing `/api/results/import` is great for **one** class+exam+subject at a time (current teachers entering marks). For migration we need a single sheet covering many students × many subjects × many exams × possibly many years.

**Migration:**
- New file: `scripts/migrations/erp/migration-052-import-source-results.sql`
  ```sql
  ALTER TABLE results ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'erp_native';
  ALTER TABLE results ADD COLUMN IF NOT EXISTS import_batch_id uuid;
  CREATE INDEX IF NOT EXISTS results_import_batch_idx ON results(import_batch_id);
  ```
- Mirror to `supabase-schema.sql`.

**API:** `apps/erp/src/app/api/results/historical-import/route.ts`
- POST multipart: `file`, `dry_run`, `default_academic_year_id` (optional — if file omits column)
- Columns:
  | Column | Required | Notes |
  |---|---|---|
  | `admission_no` | yes | |
  | `academic_year` | yes | e.g. `2024-25` |
  | `class_name` | yes | Must match a `classes` row for that year |
  | `exam_type` | yes | e.g. `Term 1`, `Term 2`, `Half Yearly`, `Annual` |
  | `subject` | yes | Subject name (resolved against `class_subjects` for that class) |
  | `marks_obtained` | yes | Number |
  | `max_marks` | yes | Number — overrides exam_type default if different |
  | `grade` | no | If absent, computed from class's grade scale |
  | `remarks` | no | |

- Server flow mirrors existing import but with multi-key resolution per row:
  1. Build lookup maps: students by admission_no, academic_years by name, classes by (academic_year_id, class_name), exam_types by (academic_year_id, name), subjects by (class_id, name).
  2. Per row: validate, resolve all FKs, compute grade if missing, collect result.
  3. Dry-run preview shows the same row-result table.
  4. Commit: upsert into `results` with `onConflict: "student_id,subject_id,exam_type_id"` plus `source='historical_import'`, `import_batch_id=<batch>`.

**Sample template API:** `apps/erp/src/app/api/results/historical-import/template/route.ts` — XLSX with example rows + README sheet.

**UI:** new component `apps/erp/src/components/ResultsHistoricalImportDialog.tsx`
- Triggered from `/admin/exams/results` page — add a "Historical bulk import" button alongside existing filters.
- Same preview-then-commit flow.

### B3. Don't touch the existing `/api/results/import`

The current per-class/per-exam/per-subject importer stays exactly as it is — it's the right tool for live teacher workflow. We're **adding** a new historical importer alongside it, not replacing.

### B4. Export of current state (for round-trip safety)

- `/api/results/export` already exists — verify it covers all years (not just current).
- Add `/api/fees/export` if not present — full payments table CSV with filters (academic_year, class, fee_type).
- Reuse `downloadCSV()` in `apps/erp/src/lib/csv-export.ts`.

### Checklist

**Schema**
- [x] B-S1. Write `migration-051-import-source-fees.sql`; append same DDL to `supabase-schema.sql`
- [x] B-S2. Write `migration-052-import-source-results.sql`; append same DDL to `supabase-schema.sql`

**Fees**
- [ ] B-F1. `/api/fees/bulk-import` route — parse, validate, dry-run, commit
- [ ] B-F2. `/api/fees/bulk-import/template` route — sample XLSX generation
- [ ] B-F3. `FeesBulkImportDialog.tsx` component
- [ ] B-F4. Wire dialog into `/admin/fees` page
- [ ] B-F5. (Optional) `/api/fees/export` for round-trip

**Results**
- [ ] B-R1. `/api/results/historical-import` route
- [ ] B-R2. `/api/results/historical-import/template` route — sample XLSX
- [ ] B-R3. `ResultsHistoricalImportDialog.tsx` component
- [ ] B-R4. Wire dialog into `/admin/exams/results` page

**Validation**
- [ ] B-V1. Manual e2e: download fees template → fill 5 rows (mix of paid/unpaid/errors) → preview shows correct errors → fix → commit → verify rows appear in admin Fees dashboard and student profile
- [ ] B-V2. Same e2e for results template against a sample multi-year multi-subject sheet
- [ ] B-V3. Idempotency check: re-upload the same file → row count unchanged
- [ ] B-V4. RBAC: editor without `fees` capability gets 403 on bulk-import

---

## Order of execution

1. **Track A first** (one afternoon) — small, isolated, fixes a visible production issue. Ship and forget.
2. **Track B in stages:**
   - Schema migrations (B-S1, B-S2) — must run on Supabase before any code that depends on them
   - Fees importer end-to-end (B-F1 → B-F4) — verify on real previous-year data
   - Results importer end-to-end (B-R1 → B-R4)
   - Optional exports last

---

## Open questions for the user

1. **Article seeding (A4)** — should Claude draft initial article copy from school constants/CLAUDE.md, or will the user write them in the CMS directly?
2. **Fee template format** — does the previous software's reports already export CSV/XLSX in a particular shape? If so, share a sample row and we'll match it instead of inventing headers from scratch.
3. **Historical results — class name format** — what string did the old software use for classes? "X-A", "Class 10 - A", "10A"? We'll need a normalizer.
4. **Receipt number uniqueness** — were receipt numbers from the previous software unique across all years, or just within a year? Affects whether idempotency key is `receipt_number` alone or `(academic_year, receipt_number)`.
