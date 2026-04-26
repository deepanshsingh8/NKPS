# NKPS Modules

This codebase is split into four modules so it can be deployed in three productization tiers:

| Tier | Modules deployed | Suitable for |
|---|---|---|
| **Website** | `website` + `shared` | School with a public site, no admin |
| **Website + CMS** | `website` + `cms` + `shared` | School that wants content management (gallery, articles, TC uploads, contact) |
| **Website + CMS + ERP** | All four | Full school management (students, exams, fees, timetable, attendance, etc.) |

## Code modules

```
src/
  app/              ← Next.js routes (consumer/glue layer; can import from any module)
  middleware.ts     ← edge auth gate
  shared/           ← Foundation used by every deployment
    components/     ← ui primitives, providers, sidebar shell, dashboard view, page primitives
    lib/            ← Supabase clients, types, validations, email, permissions, utils
    hooks/          ← cross-module React hooks
    types/          ← TypeScript definitions
  website/          ← Public marketing site (always present)
    components/     ← about, academics, home, layout (Navbar/Footer), seo
    lib/            ← disclosure, site-media (read-side)
  cms/              ← Content management (optional — Tier 2+)
    components/     ← CmsSidebar
    lib/            ← (currently empty — CMS logic lives in app/cms/* and app/api/cms/*)
  erp/              ← School operations (optional — Tier 3 only)
    components/     ← ErpSidebar, dialogs, bulk uploads, result-master/, timetable/, portal/, pdf/
    lib/            ← admit-card-qr, fees, grading, final-result, report-card, etc.
```

Module boundaries are enforced by ESLint (`eslint.config.mjs`):
- A module file can only import from itself + `@/shared/*`.
- `src/app/` is unrestricted (it's the consumer layer).

## Database modules

Run the corresponding sections from `supabase-schema.sql` for the tier you want.

### Base (every deployment)
Required for auth, profiles, and the calendar (used by website + ERP):

| Table | Purpose |
|---|---|
| `profiles` | Per-user role + display info (mirrors `auth.users`) |
| `editor_permissions` | Per-feature CMS/ERP grants for editor role |
| `calendar_events` | Public school calendar (academic-calendar page reads it) |
| `notifications` | Cross-module notification fanout |

### CMS (Tier 2+)
Adds content-management tables:

| Table | Purpose |
|---|---|
| `gallery_images` | Photo gallery items |
| `gallery_events` | Gallery event grouping (with cover photos) |
| `articles` | News / blog posts |
| `site_media` | Per-page media slots (hero images, etc.) |
| `section_cards` | Configurable cards on home/about pages |
| `transfer_certificates` | TC PDFs (uploaded externally; stored URL + metadata) |
| `contact_submissions` | Contact form submissions |
| `disclosure_items` | Mandatory public disclosure (text fields) |
| `disclosure_documents` | Mandatory public disclosure (uploaded PDFs) |
| `disclosure_board_results` | Board exam results table for disclosure page |
| `staff_members` | Public staff directory (also linked from `teachers` if ERP is present) |

Storage buckets needed: `gallery`, `transfer-certificates`, `site-media`, `staff-photos`, `disclosure-documents`.

### ERP (Tier 3)
Adds school-operations tables. Several have FKs into base/CMS tables:

| Table | Purpose |
|---|---|
| `academic_years` | Year-by-year scoping for everything below |
| `streams` | Class streams (Science / Commerce / Arts) |
| `classes` | Class sections (e.g. "VII-B", "IX-Science-A") |
| `subjects` | Subject catalog |
| `class_subjects`, `stream_subjects` | Subject mappings |
| `students`, `student_subjects`, `student_enrollments` | Student records |
| `parents`, `student_parents` | Parent records + linkage |
| `teachers` | Teaching staff (FK to `profiles` if portal account exists) |
| `attendance` | Daily attendance log |
| `exam_types`, `exam_schedules` | Exam catalog + scheduling |
| `result_masters`, `result_master_subjects` | Exam configuration (pass marks, weightages, grading) |
| `class_grade_scales`, `grade_scales`, `grade_bands` | Grade boundaries |
| `class_exam_configs` | Per-class exam-specific overrides |
| `results` | Computed marks per (student, subject, exam) |
| `marksheet_publications` | Per-class publication state for results |
| `class_tests`, `class_test_results` | In-class assessments (lighter than full exams) |
| `non_scholastic_subjects`, `non_scholastic_sub_subjects`, `non_scholastic_sub_subject_classes`, `non_scholastic_assessments` | Co-scholastic grading |
| `student_remarks` | PTM / report-card remarks |
| `ptm_notes`, `ptm_formats` | PTM workflow + report formats |
| `supplementary_attempts` | Supplementary exam attempts |
| `fee_structures`, `fee_payments`, `payment_orders` | Fees |
| `timetable_periods`, `substitutions`, `teacher_absences`, `school_meeting_counts` | Timetable + substitution workflow |
| `pdf_header_configs`, `pdf_footer_configs`, `admit_card_templates` | PDF customization |
| `registration_requests` | Self-registration flow |
| `publish_events` | Audit log for marksheet publications |

Storage bucket needed: `avatars` (for teacher/student/parent profile photos).

### Cross-module FKs

A few CMS tables reference ERP tables when both modules are deployed:

- `transfer_certificates.student_id` → `students(id)` (ON DELETE SET NULL — TCs survive student deletion)
- `staff_members` rows can be cross-linked to `teachers` in ERP deployments

For **CMS-only deployments**, skip the FK constraint on `transfer_certificates.student_id` (the column can remain `NULL` for all rows). The `staff_members` table stands alone.

## Deployment recipes

### Fresh install — Tier 1 (Website only)

1. In Supabase: run the **Base** section from `supabase-schema.sql`.
2. Create the `gallery` and `staff-photos` storage buckets (the public site uses these).
3. Deploy the Next.js app with default config.

### Fresh install — Tier 2 (Website + CMS)

1. Run **Base** + **CMS** sections.
2. Create all CMS storage buckets (above).
3. Deploy with the CMS routes enabled (no separate flag — CMS is detected from data presence).

### Fresh install — Tier 3 (Website + CMS + ERP)

1. Run **Base** + **CMS** + **ERP** sections.
2. Create all storage buckets.
3. Apply all migrations 001–046 in numeric order (these are incremental refinements on top of the consolidated schema).
4. Deploy.

### Upgrading an existing tier

- **Tier 1 → Tier 2**: run only the CMS section, then create CMS storage buckets. No data migration needed.
- **Tier 2 → Tier 3**: run the ERP section + apply migrations 001–046, then create the `avatars` bucket.

## Migration history

Migrations live in `scripts/migration-*.sql`. They are numbered chronologically (001 onwards). Each one was applied to production at a known point in time; they're preserved as history rather than re-grouped by module so the audit trail stays intact.

For new deployments, prefer the consolidated `supabase-schema.sql` over replaying migrations — it captures the full state as of migration 046.

## Adding a new feature

When adding a feature, decide which module it belongs to:

- **Public-facing display only?** → `website/`
- **Content management (admin can create/edit)?** → `cms/`
- **School operations (students, staff, exams, fees, etc.)?** → `erp/`
- **Used by ≥ 2 modules?** → `shared/`

If the feature spans modules (e.g. a CMS-managed banner that the website displays), put the read function in `shared/lib/` and the management UI in `cms/`.
