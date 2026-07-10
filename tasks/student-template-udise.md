# Student Template Restructure (UDISE+ General/Enrolment profiles)

Plan: ~/.claude/plans/there-is-a-template-peppy-bubble.md
Template: STUDENT_UPLOAD_TEMPLATE (2) (1).xlsx — General Profile (21 particulars) +
Enrolment Profile (12 particulars), ~50 leaf fields. One students table; flat bulk
upload sheet; per-student two-column xlsx export.

- [x] 1. Migration 072 (44 new student columns + CHECKs) + appended to supabase-schema.sql — **⚠ apply via Supabase Studio SQL editor (user)**
- [x] 2. Shared field registry `packages/shared/src/lib/student-template.ts` + Student type + zod schemas (drift guard throws at module init)
- [x] 3. api/students: POST via registry whitelist + PATCH validation hardening (no more raw spread)
- [x] 4. api/students/bulk: column projection (absent column = untouched, blank cell = clear), subjects replace-resolution into student_subjects, warnings[], created/updated counts, 500-row chunks
- [x] 5. StudentBulkUpload.tsx: 65-column registry template, longest-first claim-once alias mapper, per-kind normalization, mapping summary panel, row-expand preview, chunked submit, warnings in results
- [x] 6. GET /api/students/[id]/export — two-section xlsx with merged S.No. cells + "Download Profile" button in detail dialog
- [x] 7. StudentFormFields (General/Enrolment collapsible sections, registry-rendered fields, 3-state booleans) + detail dialog sectioned into the two profiles
- [x] 8. csv-export.ts columns generated from registry (headers round-trip through bulk upload)
- [x] 9. Typecheck + build + lint (0 new errors) + offline registry tests (65/65 header round-trip, legacy 17-col sheet maps, alias collisions resolved)

## Review

- **Single source of truth:** `packages/shared/src/lib/student-template.ts` defines all 65
  bulk-sheet fields (44 new DB columns + reused + virtual enrollment/derived keys). It drives
  the bulk template headers/aliases/normalization, both zod schemas (via a module-init drift
  guard), API whitelists (`studentsInsertKeys`/`buildStudentRecord`), the export layout, the
  admin form sections, and the CSV columns. Adding a field = registry entry + migration +
  one zod line.
- **Update semantics changed (documented in dialog):** re-upload now writes only columns
  present in the sheet; blank cell in a present column clears the value.
- **Subjects:** comma-separated column matched (name/nickname, case-insensitive) to the
  class's subjects; non-blank cell REPLACES student_subjects; blank leaves untouched;
  unmatched tokens → warnings; elective-pick desync warned.
- **`nationality` derives "Indian National (Y/N)"** — YES→'Indian', NO→null, blank→untouched.
- **Deviations from template:** template item 12 kept as ONE column (parent_highest_education).
  Extras kept in sheet but excluded from the profile export: Phone, Email, Religion, Roll No.

## Pending (user)

1. **Run `scripts/migrations/erp/migration-072-student-profile-udise.sql` in Supabase Studio
   SQL editor** — nothing new works at runtime until then (idempotent, safe to re-run).
2. After migration: manual E2E — download new template → fill a few rows (incl. subjects w/
   a typo, Y/N variants, DD/MM/YYYY) → upload → check mapping panel/warnings/counts →
   open a student → both profile sections → Download Profile → verify against the template →
   sparse re-upload (adm/name/class + height only) → confirm other fields untouched.
