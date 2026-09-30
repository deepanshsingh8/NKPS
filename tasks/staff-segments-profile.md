# Staff: four segments + full staff profile

Source: "Staff Details in ERP 2026.docx" + "Teacher Registration Form_Detailed Proforma.xlsx"
(school's requested amendments, 2026-09-28).

## Decisions
- **Segments** (tabs on /people/staff), one table in `staff-roles.ts` drives tab + login:
  | Tab | Categories | Login |
  |---|---|---|
  | Admin | management (Principal/VP), admin (CBSE portal, OA, front office) | staff |
  | Teaching | pgt, tgt, prt, motherTeachers, 4 coordinators | teacher |
  | Additional Staff | additionalStaff (Scout & Guide, NCC, coach, PTI, …) | **teacher** (user: yes) |
  | Drivers & Helpers | busDriver, peon | none (user: keep 4th tab) |
- Additional Staff now get a teachers record so PTI/coach can be timetabled.
- Live data: Office Assistant + Front Desk rows sit in `additionalStaff` with *staff* logins →
  migration moves them to `admin` (subject-matched, explicit list).
- **Profile fields** live in a new 1:1 `staff_details` table, NOT on `staff_members`:
  staff_members is readable by every teacher login (mig 128); PAN/bank/Aadhaar must be
  admin + editors-with-`staff` only. Writes go through `/api/staff/[id]/profile`.
- Child tables `staff_trainings` (capacity-building programmes) and `staff_notices`
  (notices issued by Management/Principal/VP + clarification), same RLS.
- One field registry `packages/shared/src/lib/staff-profile-fields.ts` drives zod schema,
  profile page sections, and bulk-upload columns (same pattern as student-template).
- Single "Full Name" kept (proforma uses it; docx's first/middle/last conflicts) —
  "Name as per Aadhaar" / "Name as per bank" captured instead.
- Class Teacher / Classes Taught are NOT stored — derived from ERP assignments, already shown.
- Gender + date of joining mirror to the linked teachers row (one-way). Aadhaar does NOT
  (teachers is readable by every teacher login).
- Migration is written, not applied — user applies.

## Tasks
- [x] 1. staff-roles.ts: category rules table, 4 groups, additionalStaff → teacher
- [x] 2. Rename isTeachingStaffCategory → staffNeedsTeacherRecord at call sites
- [x] 3. Staff page tabs/labels; drivers link still `?group=support`
- [x] 4. Field registry + zod schema (`staffProfileSchema`, trainings, notices)
- [x] 5. Migration 131: staff_details, staff_trainings, staff_notices, RLS, data move; mirror to schema; pglast parse
- [x] 6. API: GET/PUT `/api/staff/[id]/profile` (details + trainings + notices), teacher mirror
- [x] 7. Profile page `/people/staff/[id]` (view + edit per section), name links to it
- [x] 8. Bulk upload: registry columns → staff_details upsert
- [x] 9. Guide entry + permissions check for /people/staff/[id]
- [~] 10. typecheck ✓, lint 0 errors ✓, check:guide ✓, erp build ✓, schema unit run (tsx) ✓, pglast ✓ — browser pass pending: needs admin sign-in + migration 131 applied

## Review
- Category → tab/login/label is one `CATEGORY_RULES` table; page + bulk upload lost
  their duplicated category lists.
- Profile is registry-driven: 75 fields, 5 sections, one list → zod, page, Excel.
- Sensitive fields isolated in `staff_details` (RLS admin + staff editors); teachers
  can still read staff_members (mig 128) and never see PAN/bank/Aadhaar.
- `promoteStaffToTeacher` now copies gender + joining date from the profile.
- Bulk import: unknown-format profile cells are skipped with a visible warning list
  instead of failing the row; substring header matching no longer lets a later
  column ("Father's Name") overwrite an earlier claim ("Name").
- Open: Librarian/Counsellor/Art & Craft stay Additional Staff (teacher login) — not
  in the school's list; VP has a teacher login but sits in management with no
  teachers row (pre-existing).
