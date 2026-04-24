# Phase 3 — Result Master + Advanced Settings

**Status:** Plan draft — awaiting user sign-off before implementation.

**Scope:** Admin-configurable rules per (class + academic year) that drive the Report Card PDF. Covers both basic rules and six advanced "power controls."

**Hard constraints (same as Phase 0):**
- Existing `/teacher/results`, `/student/results`, `/parent/results` unchanged.
- Existing Report Card PDF must render **byte-identical** for any class that has no `result_master` row — zero regression for pre-Phase-3 data.
- Migration mirrored in `supabase-schema.sql` in the same turn.
- New feature key in `src/lib/permissions.ts` (admin-only, like Grade Master).

---

## 1. Scope matrix — user requirements → implementation

### Basic Rules (from Result Master page)
| Requirement | Where it lives |
|---|---|
| Subjects included in result | `result_master_subjects` rows (absence = excluded entirely) |
| Main vs Optional subjects | `result_master_subjects.role` (`'main' \| 'optional'`) |
| Passing marks per subject | `result_masters.pass_mark_pct_default` + per-subject `pass_mark_pct_override` |
| Overall pass criteria | `result_masters.pass_criteria` (`'all_main_subjects' \| 'overall_percentage'`) + `overall_pass_pct` |

### Advanced Settings (Power Controls)
| # | Requirement | Where it lives |
|---|---|---|
| 1 | Weightage (CT / Half-Yearly / Annual mixing) | Existing `class_exam_configs.weightage` (Phase 0.3). Phase 3 adds UI only. |
| 2 | Best of N class tests | `result_masters.class_test_best_of` (nullable int; NULL = all) |
| 3 | Grace marks (subject-level or total) | `result_masters.grace_marks_per_subject_max`, `grace_marks_total_max`, `grace_marks_condition` |
| 4 | Include/Exclude subjects (e.g., exclude GK from total) | Not in `result_master_subjects` → excluded; `role='optional'` → shown but not in total |
| 5 | Rounding rules (39.5 → 40) | `result_masters.rounding_mode`, `rounding_precision` |
| 6 | Non-scholastic display (show/hide/placement) | `result_masters.include_non_scholastic`, `non_scholastic_placement` |

---

## 2. Migrations

### `scripts/migration-022-result-master.sql`

```sql
-- result_masters: one row per (class, academic_year)
CREATE TABLE result_masters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,

  -- Basic rules
  pass_mark_pct_default numeric(5,2) NOT NULL DEFAULT 33
    CHECK (pass_mark_pct_default >= 0 AND pass_mark_pct_default <= 100),
  pass_criteria text NOT NULL DEFAULT 'all_main_subjects'
    CHECK (pass_criteria IN ('all_main_subjects', 'overall_percentage')),
  overall_pass_pct numeric(5,2)
    CHECK (overall_pass_pct IS NULL OR (overall_pass_pct >= 0 AND overall_pass_pct <= 100)),

  -- Display
  show_rank boolean NOT NULL DEFAULT false,
  show_extra_separately boolean NOT NULL DEFAULT true,
  include_non_scholastic boolean NOT NULL DEFAULT false,
  non_scholastic_placement text NOT NULL DEFAULT 'below'
    CHECK (non_scholastic_placement IN ('below', 'above', 'separate_page')),

  -- Grading override (NULL = use class_grade_scales or global default)
  grade_scale_id uuid REFERENCES grade_scales(id) ON DELETE SET NULL,

  -- Grace marks (all in percentage points)
  grace_marks_per_subject_max numeric(5,2) NOT NULL DEFAULT 0
    CHECK (grace_marks_per_subject_max >= 0 AND grace_marks_per_subject_max <= 100),
  grace_marks_total_max numeric(5,2) NOT NULL DEFAULT 0
    CHECK (grace_marks_total_max >= 0 AND grace_marks_total_max <= 100),
  grace_marks_condition text NOT NULL DEFAULT 'failing_only'
    CHECK (grace_marks_condition IN ('failing_only', 'any_subject')),

  -- Rounding
  rounding_mode text NOT NULL DEFAULT 'none'
    CHECK (rounding_mode IN ('none', 'half_up', 'half_down', 'ceil', 'floor')),
  rounding_precision integer NOT NULL DEFAULT 0
    CHECK (rounding_precision BETWEEN 0 AND 2),

  -- Best-of rule (applies to exam_types.kind = 'class_test')
  class_test_best_of integer
    CHECK (class_test_best_of IS NULL OR class_test_best_of > 0),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(class_id, academic_year_id)
);

-- result_master_subjects: which subjects appear + how
CREATE TABLE result_master_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  result_master_id uuid NOT NULL REFERENCES result_masters(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'main'
    CHECK (role IN ('main', 'optional')),
  pass_mark_pct_override numeric(5,2)
    CHECK (pass_mark_pct_override IS NULL OR (pass_mark_pct_override >= 0 AND pass_mark_pct_override <= 100)),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(result_master_id, subject_id)
);

-- RLS: authenticated read, admin write (same pattern as grade_scales)
ALTER TABLE result_masters ENABLE ROW LEVEL SECURITY;
ALTER TABLE result_master_subjects ENABLE ROW LEVEL SECURITY;
-- (policy definitions match grade_scales — read for authenticated, write for admin role)

-- updated_at trigger on result_masters (reuse existing update_updated_at_column())
```

**Mirror to `supabase-schema.sql` in the same commit.**

---

## 3. Final-result computation (`src/lib/final-result.ts`)

Pure, deterministic function. Given `(student_id, academic_year_id, supabase)`:

### Step-by-step algorithm
1. **Load config bundle** (one fetch each):
   - `result_master` row (with subjects) for student's class + year.
   - `class_exam_configs` for the class (applicable exams + weightages).
   - All `results` for student + year, grouped by `exam_type_id`.
   - Resolved grade scale via `resolveGradeScaleForClass` (respecting result_master override).

2. **Filter applicable exams** — only exams where `class_exam_configs.is_applicable=true` AND a matching `results` row exists.

3. **Best-of rule** — if `class_test_best_of` is set:
   - Group applicable exams by `kind='class_test'`.
   - Compute each CT's per-subject-weighted percentage.
   - Keep top-N by overall percentage; drop the rest.
   - Redistribute dropped CTs' weightage evenly among kept ones (so total weight stays the same).

4. **Per-subject weighted computation** — for each subject in `result_master_subjects`:
   ```
   subject_pct = Σ (exam_pct × exam_weight) / Σ exam_weight
   ```
   where only applicable (post-best-of) exams that have a result for that subject contribute.

5. **Grace marks** — iterate subjects:
   - If `grace_marks_condition='failing_only'`: only apply grace if `subject_pct < pass_mark_pct`.
   - If `grace_marks_condition='any_subject'`: applies unconditionally.
   - Cap per-subject grace at `grace_marks_per_subject_max`.
   - Maintain a running total; cap total at `grace_marks_total_max`.
   - Track grace applied per subject for audit/display.

6. **Rounding** — apply `rounding_mode` + `rounding_precision` to:
   - Each `subject_pct` (post-grace).
   - The overall aggregate percentage.
   - **Not** raw marks (those stay exact for auditability).

7. **Pass/fail per subject** — compare rounded subject_pct to `pass_mark_pct_override ?? pass_mark_pct_default`.

8. **Overall pass/fail** — per `pass_criteria`:
   - `'all_main_subjects'`: student passes iff every `role='main'` subject passes.
   - `'overall_percentage'`: compare aggregate main-subject percentage to `overall_pass_pct`.

9. **Grade resolution** — `computeGrade(final_pct, bands)` using resolved scale.

10. **Rank** (if `show_rank`) — computed at PDF-generation time for class cohort, not per student. (Separate helper `computeRanksForClass`.)

### Return shape
```ts
interface FinalResult {
  student_id: string;
  class_id: string;
  academic_year_id: string;
  main_subjects: FinalSubject[];
  optional_subjects: FinalSubject[];
  overall: {
    main_total_pct: number;      // rounded
    main_total_pct_raw: number;  // pre-rounding, for debugging
    grade: string | null;
    passed: boolean;
    pass_reason: string;         // human-readable e.g. "All 5 main subjects ≥ 33%"
    grace_applied_total: number;
  };
  rank?: number | null;
  config_applied: {
    result_master_id: string;
    grade_scale_name: string;
    best_of_applied: boolean;
    rounding_summary: string;
  };
}

interface FinalSubject {
  subject_id: string;
  subject_name: string;
  role: 'main' | 'optional';
  exam_contributions: Array<{
    exam_type_id: string;
    exam_name: string;
    marks_obtained: number;
    max_marks: number;
    pct: number;
    weight: number;
  }>;
  raw_pct: number;       // pre-grace, pre-rounding
  grace_applied: number;
  final_pct: number;     // rounded, post-grace
  grade: string | null;
  passed: boolean;
}
```

### Fallback path
- If **no `result_master`** exists for (class, year) → return `null`. Caller renders legacy layout.
- If result_master exists but **zero subjects** → return error object; admin UI flags as incomplete.

---

## 4. Report Card PDF rewrite (`src/components/pdf/ReportCardPDF.tsx`)

### Strategy: branch on presence of `finalResult` prop
- `ReportCardPDF` gets an **optional** `finalResult?: FinalResult` prop.
- If absent → existing rendering path (unchanged). **This is the regression guarantee.**
- If present → new sections:
  - **Main subjects table** — per-exam columns + weighted final column.
  - **Optional subjects mini-table** (if `show_extra_separately` and any exist).
  - **Final Result block** — overall %, grade, pass/fail badge, grace applied summary.
  - **Non-scholastic block** — placed per `non_scholastic_placement`. (Reads `non_scholastic_assessments` once Phase 2 lands; until then renders "Not yet recorded.")
  - **Rank** (if `show_rank` and rank passed in).
  - **Upper header banner** — from `exam_types.upper_header` when rendering a single-exam snapshot (not applicable to final-result view).

### Wiring
- `src/lib/report-card.ts` gains a helper `buildReportCardData` that conditionally calls `computeFinalResult`. Returns `{ ...existingData, finalResult }`.
- `/api/erp/results/report-card/pdf/route.tsx` passes `finalResult` through to the PDF component.

---

## 5. Admin UI — `/admin/exams/result-master`

### Layout
- **Top bar:** Class + Academic Year selector (URL-synced).
- **Empty state:** "No config for this class/year. [Create Result Master]" button.
- **Configured state:** Four tabs.

### Tab 1 — Basic Rules
- Pass mark % per subject (default)
- Pass criteria radio: `all_main_subjects` | `overall_percentage`
- Overall pass % (shown only if `overall_percentage`)
- Save button

### Tab 2 — Subjects
- Table: all class-level subjects
- Per row: Include checkbox | Role dropdown (Main/Optional) | Pass mark override (% — blank = use default) | Sort order (drag handle)
- Save button

### Tab 3 — Advanced Settings
- **Weightage section** — reads/writes `class_exam_configs`. Lists exam types applicable to the class; rows: exam name | kind badge | is_applicable toggle | weightage % | sort order. "Sum ≠ 100%" warning chip.
- **Best of Rule section** — number input for `class_test_best_of` with inline hint ("e.g., 2 = take best 2 of all class tests in the year"). Shows current count of class_tests for context.
- **Grace Marks section** — three fields (per-subject max %, total max %, condition dropdown).
- **Rounding section** — mode dropdown + precision + live preview showing "39.5 → {result}" for each mode.
- **Non-Scholastic section** — include toggle + placement dropdown (disabled + hint if no non-scholastic assessments exist yet).
- **Grade Scale section** — dropdown of scholastic scales + "Use class default" option.
- Save button (per section or whole-form — TBD; recommend whole-form for atomicity).

### Tab 4 — Preview
- Student picker (from class roster).
- Renders live `FinalResult` computation as a card + "Download sample PDF" button.
- Shows `config_applied` summary so admin sees which rules fired.

---

## 6. API routes

All admin-only via `verifyAdmin`.

- `GET /api/erp/result-masters?class_id=&academic_year_id=` — fetch single config with subjects + class_exam_configs joined.
- `POST /api/erp/result-masters` — create (master + subjects in one transaction).
- `PATCH /api/erp/result-masters/[id]` — update master fields.
- `PUT /api/erp/result-masters/[id]/subjects` — wholesale replace subjects list (atomic).
- `PUT /api/erp/result-masters/[id]/exam-configs` — wholesale replace `class_exam_configs` rows for the class (writes to existing table).
- `DELETE /api/erp/result-masters/[id]` — soft-guard: confirm dialog in UI, cascade deletes subjects.
- `GET /api/erp/result-masters/[id]/preview?student_id=` — runs `computeFinalResult` and returns JSON (no PDF).

---

## 7. Permissions + discoverability

- [ ] Add `result_master` to `ADMIN_ONLY_PREFIXES` at `/admin/exams/result-master`.
- [ ] No feature_key needed (admin-only, same as Grade Master).
- [ ] Tile on `/admin/exams` hub landing page (admin-only).
- [ ] Link in sidebar Exams group (admin-only via href with no feature_key).

---

## 8. Types (`src/types/index.ts`)

New interfaces:
- `ResultMaster` — mirrors table columns.
- `ResultMasterSubject` — mirrors table columns.
- `FinalResult`, `FinalSubject` — as defined in section 3.

---

## 9. Implementation order (subagent-delegatable chunks)

Break into small, testable increments. Each bullet = one working commit.

1. **Migration 022 + schema mirror** — DB layer only, no code wiring.
2. **Types + final-result lib (pure function, no UI)** — `src/lib/final-result.ts` + unit-style smoke test in a throwaway `scripts/` file.
3. **API routes** — CRUD + preview endpoint. Test via curl.
4. **Admin UI scaffold** — page + tabs + top bar, loads existing config or empty state. Read-only first.
5. **Admin UI — Basic + Subjects tabs** — CRUD working.
6. **Admin UI — Advanced tab** — all 6 power controls, wiring to `class_exam_configs` for weightage.
7. **Admin UI — Preview tab** — calls preview API, renders result card.
8. **Report Card PDF rewrite** — conditional branch on `finalResult` prop. Extensive manual testing for no-config fallback parity.
9. **Wire PDF route to pass `finalResult`** — final integration.
10. **Sidebar + landing tile + ADMIN_ONLY_PREFIXES** — discoverability.

### Testing gates (per Phase 0 checklist pattern)
- [ ] Class without result_master → PDF byte-identical to pre-Phase-3 (diff test).
- [ ] Class with result_master → weighted final result matches hand calculation for 3 sample students (doc checkpoint).
- [ ] Grace marks: failing_only skips grace when subject passes.
- [ ] Grace marks: total cap respected across subjects.
- [ ] Best-of 2 of 4 class tests: dropped 2 don't affect final, weightage redistributes.
- [ ] Rounding: 39.5 → 40 under `half_up`; → 39 under `half_down` / `floor`.
- [ ] `pass_criteria='all_main_subjects'` fails student with one main subject below threshold.
- [ ] `pass_criteria='overall_percentage'` uses main-subject aggregate only.
- [ ] Non-scholastic placement honored in PDF layout.
- [ ] Deleting result_master → PDF reverts to fallback cleanly.

---

## 10. Open questions for user before we start

1. **Best of Rule scope** — should it apply only to `kind='class_test'`, or also to `'practical'`? (I've modeled class-test-only; easy to extend.)
2. **Weightage redistribution in Best-of** — when we drop the worst CTs, should their weight redistribute to kept CTs, or be forfeited (lowering the CT contribution)? I've assumed redistribute. This is the typical interpretation but worth confirming.
3. **Grace marks scope** — apply to `main` subjects only, or also `optional`? I've assumed main only (optional subjects don't affect pass/fail).
4. **Rank computation** — include optional subjects in the aggregate used for ranking? I've assumed main only.
5. **Rounding target** — applied to per-subject percentage + overall, not raw marks. Confirm that's right?
6. **Pass criteria interaction with grace** — does grace apply *before* or *after* checking pass_criteria? I've assumed before (grace helps the student pass).
7. **Academic year granularity** — one result_master per (class, year). Any future need for multiple masters per year (e.g., different rules for Half-Yearly vs Annual snapshot)? Current design says no — rules are year-wide.
8. **Migration of existing `show_extra_separately` / optional subjects** — any existing "optional subject" concept in the data? (Map says no.)

---

## 11. Review section

_To be filled in after implementation — deviations, follow-ups, lessons._
