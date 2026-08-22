# Student Custom Report Builder

Port the old ERP's `Student Custom Report` (ScholarsERP → `/CustomReport/Create`)
into our ERP as a general, session-aware report builder.

Source material: `Updations on New ERP.docx`, four screenshots of the old
screen, and a live read of the old page's DOM (field list, filter names, form
target) on 2026-08-22.

---

## 1. What the old screen actually is

A **one-shot ad-hoc report builder over the student master**. No saved
templates — `/CustomReport` 404s, only `/CustomReport/Create` exists, and
`Display` POSTs the whole form to `/CustomReport/ShowRecords`.

Two halves:

**Left — filters, in 4 tabs.** Tab state is cosmetic: all tabs post together as
one filter set, and `SortedBy` / `ThenBy` are repeated on every tab bound to
the *same* two fields.

| Tab | Filters (form field names) |
|---|---|
| Name & Date | `StudentName` (contains), `FatherName` (contains), `DOAFrom`/`DOATo`, `DOBFrom`/`DOBTo` |
| Class | `ClassMasterIdList` (**multi-select, required**), `SectionId`, `ClassSubjectId`, `SessionId` (2005-06 → 2026-27), + three checkbox toggles `IsDayScholar`, `IsHostelor`, `IsTransportStudent` (all default on) |
| Advanced | `RTE` (Both/RTE/Non-RTE), `BPL` (Both/BPL/Non-BPL), `CategoryId`, `ReligionId`, `GenderId`, `ChildStatusId` (Staff Ward / Single Child / Single Girl Child), `HouseId` |
| Others | `ReStudy`, `StudentStatusId` (All/Active/Deactive/Supplementary/Class Jump/TC_Deactive), `StudentType` (Both/New/Old), `InstallmentModeId`, `CounsellorId`, `StaffReferenceId`, `DiscountSchemeId`, `BoardType` |
| (all tabs) | `SortedBy`, `ThenBy` — both drawn from the full 111-field list |

**Right — "Display/Print Fields".** A scrolling list of **111 checkboxes** with
`Select All`. `SR No` and `Student Name` are checked *and disabled* — always in
the output. The checked set becomes the output columns, in registry order (not
tick order). The list ends with `Blank-1`, `Blank-2`, `Blank-3` — deliberately
empty columns so a printed sheet has space to write in by hand.

The whole value of the screen is: **pick your rows, pick your columns, get a
sheet.** Everything else is detail.

### 1.1 Full old-ERP field list (111)

```
SR No · Reg. No. · Date of Admission · Student Name · Father's Name · Mother's Name ·
Father's Title · Mother's Title · Date of Birth · Father's Mobile No · Mother's Mobile No ·
Class · Section · Category · Admission No · Enroll No/ PEN No · Roll No · First Name ·
Middle Name · Last Name · Gender · Board Roll No · Student Mobile No · Student Email ·
Student Aadhar · Father's Occupation · Father's Email · Father's Aadhar No ·
Mother's Occupation · Mother's Email · Mother's Aadhar No · Father Annual Income ·
Mother Annual Income · Sms Mobile No · Guardian Name · Guardian Relation · Guardian Mobile ·
FeeDeposited By · Counsellor Name · Session · Caste · Religion · Medium · Rural Or Urban ·
Disability Type · Blood Group · House Name · Nationality · Mother Tongue · Home Address ·
District · State · Office Addres · Date of Ad. in Class · Date of Deactive · Hostel Name ·
Stoppage Name · Pre School Record · Weight · Height · Previous School Name ·
Previous School Address · Previous School Standard · Previous Class · Previous Year ·
Previous yr. Board RollNo · Previous School Board Name · Pre.Maximum Marks ·
Pre.Obtain Marks · Pre.Percentage · Pre.Result · Reason Of Leaving · Photo Student ·
CBSE Reg. No. · Subjects · Discount Scheme · Admission In Class · Admission In Session ·
Student Status · OldNew · Deactive Remarks · Student Type · Child Status · Form No ·
Meeting Total · Meeting Present · No.of Students · Date of Result · Class Result · Remarks ·
Machine Id · CautionMoney ReceiptNo · CautionMoney Receipt Date · CautionMoney Amount ·
Counsellor Remark · Mother Office Address · Mailing Address · Place Of Birth ·
Installment Mode · Staff Reference · Admission Confirm Date · IsRTE · IsBPL · Board Type ·
APAAR No · Registration Date · NIC · JanAadhar · Blank-1 · Blank-2 · Blank-3
```

---

## 2. Coverage against our schema

Our `packages/shared/src/lib/student-template.ts` registry already carries **65
fields**, and `student_enrollments` / `classes` / `academic_years` / `bus_stops`
supply most of the joined ones. So roughly **80 of 111 map cleanly today**.

### 2.1 Direct (no work beyond wiring)

`admission_no` (SR No / Admission No), `full_name`, `father_name`,
`mother_name`, `date_of_birth`, `gender`, `category`, `religion`,
`minority_group`, `blood_group`, `mother_tongue`, `nationality`,
`aadhar_number`, `name_as_per_aadhar`, `jan_aadhar_number`, `phone`, `email`,
`father_mobile` / `_occupation` / `_qualification` / `_annual_income`,
`mother_*` equivalents, `guardian_name` / `_relation` / `_mobile`, `address` +
`present_pincode`, `permanent_address` + `permanent_pincode`, `height_cm`,
`weight_kg`, `is_rte`, `is_bpl`, `is_ews`, `is_cwsn` + `cwsn_impairment_type`
(→ Disability Type), `medium_of_instruction`, `distance_band`,
`parent_highest_education`, `is_staff_ward` (→ Child Status, partly),
`participates_ncc/nss/scouts/competitions`, `admission_date`,
`admission_class` (→ Admission In Class), `board_roll_number`,
`board_percentage`, `last_session_attendance`, `photo_url`, all nine
`previous_school_*` fields + `previous_class_studied`.

Joined / derived: `Class`, `Section`, `Stream`, `Roll No`, `Session`,
`Student Status` (`student_enrollments.status`), `Date of Ad. in Class`
(`enrollment_date`), `Date of Deactive` + `Deactive Remarks`
(`status_changed_at` / `status_reason`, migration 087), `Stoppage Name`
(`bus_stop_id` → `bus_stops.name`), `Subjects` (`student_subjects`),
`Meeting Total` / `Meeting Present` (`school_meeting_counts`),
`Class Result` / `Date of Result` (`final-result.ts`, `marksheet_publications`).

### 2.2 Derivable, no migration

- **First / Middle / Last Name** — split `full_name`. Lossy but matches how the
  old ERP prints it. Compute in the field registry, never store.
- **OldNew** — "New" if `admission_date` falls inside the selected session's
  `start_date`…`end_date`, else "Old".
- **Admission In Session** — the `academic_years` row containing
  `admission_date`.
- **Day Scholar / Transport Student** — `student_enrollments.has_transport`.

### 2.3 No home in our schema — needs a decision

| Old field | Note |
|---|---|
| Reg. No. · Form No · Registration Date · Admission Confirm Date | We have `registration_requests`, but no link from `students` back to it |
| Enroll No / PEN No · APAAR No · CBSE Reg. No. · NIC | Government/board identifiers. **PEN and APAAR are UDISE+ mandatory** — these are the ones worth adding regardless of this feature |
| Father's Title · Mother's Title | Mr./Mrs./Dr. salutation |
| House Name | No `houses` table at all |
| Hostel Name · Hosteler | School has no hostel — recommend **drop** |
| District · State (of the student) | Present address is one free-text column |
| Office Address · Mother Office Address · Mailing Address | |
| Place Of Birth · Rural Or Urban · Caste (distinct from Category) | |
| Sms Mobile No | We have three mobile columns and no "which one gets the SMS" flag |
| Counsellor Name · Counsellor Remark · Staff Reference · Student Type | Admissions-CRM concepts we don't model |
| Discount Scheme · Installment Mode · FeeDeposited By | Partly reachable via fee concessions + migration 085 instalment schedule |
| Caution Money Receipt No / Date / Amount | Not modelled |
| Machine Id | Biometric device id — recommend **drop** |
| Board Type | School is CBSE-only — recommend **drop** |
| Re-Study · Class Jump · Supplementary · TC_Deactive statuses | Our enum is `active/passed/failed/terminated/exited`; supplementary lives in `supplementary_attempts`. Needs a mapping table, not new columns |
| Pre.Maximum Marks / Obtain Marks / Percentage / Result | We store `board_percentage` only |
| Blank-1/2/3 | **Keep this.** Pure output-side, zero schema cost |

---

## 3. Design for our ERP

### 3.1 Principle

Same discipline as `student-template.ts`: **one registry drives every surface.**
The checkbox list, the Sort By / Then By dropdowns, the CSV headers, the XLSX
headers and the PDF columns must all be generated from one array, so they can
never drift.

### 3.2 New shared module — `packages/shared/src/lib/report-fields.ts`

```ts
export type ReportSource = "students" | "enrollment" | "class" | "transport"
  | "subjects" | "result" | "meeting" | "derived" | "blank";

export interface ReportField {
  key: string;                       // stable id, used in URLs + saved presets
  label: string;                     // checkbox label + column header
  group: "Identity" | "Family" | "Contact" | "Enrolment" | "Address"
       | "Category & Welfare" | "Previous School" | "Transport"
       | "Academics" | "Other";
  source: ReportSource;
  columns?: string[];                // db columns this field needs (projection)
  sortable?: boolean;                // eligible for Sort By / Then By
  always?: boolean;                  // SR No + Name — checked and disabled
  width?: number;                    // PDF/XLSX column width hint
  resolve(row: ReportRow, ctx: ReportContext): string | number | null;
}
```

Built by **re-exporting `STUDENT_TEMPLATE_FIELDS`** (mapped into `ReportField`)
and appending the joined/derived/blank ones. That guarantees a field added to
the student registry shows up in the report builder for free — the registry
memory rule already in force for the six existing consumers.

`columns[]` matters: the API projects **only** the columns the selected fields
need. A report of "Name + Class" must not pull Aadhaar numbers out of Postgres.

### 3.3 New shared module — `packages/shared/src/lib/report-filters.ts`

One zod schema, shared by the client form and the API:

```ts
{
  session_id: string,                      // academic_year_id — REQUIRED
  class_ids: string[],                     // multi, empty = all
  section: string | null,
  subject_id: string | null,
  stream_id: string | null,
  name_contains, father_name_contains,
  admission_date_from/to, dob_from/to,
  gender, category, religion, minority_group,
  is_rte: "both"|"yes"|"no",  is_bpl, is_ews, is_cwsn, is_staff_ward,
  has_transport: "both"|"yes"|"no",
  statuses: EnrollmentStatus[],            // multi, default ["active"]
  fields: string[],                        // ReportField keys, ordered
  sort_by: string | null, sort_dir, then_by: string | null, then_dir,
}
```

Deliberate departures from the old screen:

- **Session is required, class is not.** The old ERP forced a class and let the
  session default. Ours inverts it: every row's class/roll/status is
  session-scoped, so the session is the one filter that must be present. A
  whole-school report is a legitimate and common need.
- **Status is a multi-select**, not a single "All/Active/Deactive" dropdown —
  our enum has five values plus alumni.
- Day Scholar / Hosteler / Transport become one tri-state `has_transport`.

### 3.4 The correctness trap — session-scoped enrollment

`/api/students` picks a **representative** enrollment per student (current year
→ active → most recently updated). **The report must not reuse that.** For a
report on session 2023-24 the class, section, roll number, status and transport
must come from *that session's* enrollment row, or every historical report
silently prints today's class against a three-year-old cohort.

So: `student_enrollments` filtered by `academic_year_id = session_id` is the
**driving table**; `students` is joined onto it. A student with no enrollment in
the chosen session is simply not in the report. This also delivers the doc's
second ask ("session-wise record of student") as a side effect.

### 3.5 API

- `POST /api/reports/students/run` → `{ rows, total, columns }`, paginated
  (`page`, `page_size`, cap 200) for the on-screen preview.
- `GET  /api/reports/students/export?format=csv|xlsx|pdf&…` → file download.

Auth notes, both learned the hard way in this codebase:

- `verifyAdminOrEditor()` is **Bearer-only**. The preview route is called via
  `adminFetch` so it can use it. The export route is hit by a plain browser
  navigation (cookies, no Bearer), so it must use the cookie-client + explicit
  `editor_permissions` lookup pattern from
  `apps/erp/src/app/api/green-sheet/csv/route.ts`, then run the query on
  `createAdminClient()`.
- Filtering, projection, sorting and paging all happen **server-side**. Do not
  ship the full student master to the browser and filter there — that is what
  the students page does today and it is already at its limit at ~900 rows.

CSV goes through `csvEscape` (formula-injection hardening already in
`@nkps/shared/lib/utils`). XLSX uses `xlsx` (already a root dependency, already
used by `/api/students/[id]/export`). PDF uses `@react-pdf/renderer` with the
existing `pdf_header_configs` / `pdf_footer_configs` so a printed report carries
the school letterhead like every other printed artefact.

### 3.6 Saved presets — `report_presets` (migration 088)

The single biggest complaint about the old screen is re-ticking 111 checkboxes
every time you want the same list. So:

```sql
CREATE TABLE report_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  entity text NOT NULL DEFAULT 'students',
  filters jsonb NOT NULL,
  fields text[] NOT NULL,
  sort jsonb,
  is_shared boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

Private by default, `is_shared` makes it visible to every admin/editor with the
`reports` feature. Session id is stored in `filters` but **overridden by the
picker at run time**, so "Class-wise contact sheet" works in any year.

Ship two seeded shared presets so the screen isn't empty on day one: *Contact
Sheet* (Name, Class, Father, Father's Mobile, Mother's Mobile) and *UDISE
Extract* (the UDISE+ mandated columns).

Per the schema-mirrors-migrations rule, migration 088 must be appended to
`supabase-schema.sql` in the same commit.

### 3.7 UI — `/reports/students`

Layout mirrors the old screen because it's genuinely good for this job: filters
left, field picker right, actions bottom-left.

- **Filters**, 4 tabs — `Basics` (session, class multi-select, section, stream,
  name/father contains, date ranges), `Demographics` (gender, category,
  religion, minority, RTE/BPL/EWS/CWSN/Staff-ward tri-states), `Enrolment`
  (statuses multi, transport, subject, admission-date window, New/Old),
  `Sorting` (Sort By / Then By + direction).
  Unlike the old screen the sort controls live in **one** place.
- **Field picker** — grouped by `ReportField.group` with a **search box** (111
  unlabelled checkboxes in a 200px scroller is the worst part of the old UI),
  per-group Select All, a global Select All, a "Selected (n)" counter, and
  drag-to-reorder on the selected list so column order is the user's, not the
  registry's.
- **Actions** — `Preview` (first 100 rows in a real table), then
  `Export CSV` / `Export Excel` / `Print PDF`. Preview first, export second:
  the old screen makes you guess.
- Filter + field state lives in the URL via `useUrlState` (same as the students
  page) so a report is a shareable link.
- Selects use the shared `Select` wrapper — pass `SelectItem`s with labels and
  let it derive `items`; never render a raw UUID (both existing rules).

### 3.8 Permissions & navigation

- New `FeatureKey: "reports"` in `packages/shared/src/lib/permissions.ts`,
  `{ key: "reports", label: "Reports", href: "/reports", group: "erp" }`.
- A report can expose every column in the student master, so `reports` is a
  **strictly stronger grant than `students`**. Decide explicitly whether an
  editor may hold it; recommendation is yes, but audit the field list first.
- Sidebar: one new **top-level `Reports` group** with `Student Report` as its
  first child (per the sidebar-grouping rule — never one top-level entry per
  feature). Fee / Attendance / Result reports slot in as siblings later.
- After adding the route, diff page routes against sidebar hrefs — a passing
  build does not prove the nav is complete.

---

## 4. Plan

### Phase 0 — Decisions
- [x] Which §2.3 gap fields get columns — **all four sets** (see §6.1)
- [x] Editors may hold the `reports` grant — **yes, after a PII review of the field list**
- [x] Launch formats — **CSV + XLSX + PDF together**
- [x] Branch strategy — built in an isolated worktree off `origin/main`
      (which was 4 commits ahead of local). No overlap with the export branch
      materialised: `csv-export.ts` and `STUDENT_CSV_COLUMNS` are untouched.

### Phase 1 — Schema gaps first
Moved ahead of the registry: all four gap sets were approved (§6.1), and the
registry is what drives every downstream surface. Adding the columns *after*
the registry means editing seven consumers twice.

> Numbering: 088 was already taken by `migration-088-subject-delete-integrity`
> on `origin/main`, so this work starts at 089.

- [x] Migration 089 — 29 student columns across four groups: government/board
      IDs (`pen_number`, `apaar_number`, `cbse_registration_no`, `nic_number`),
      contact & identity (`father_salutation`, `mother_salutation`, `district`,
      `state`, `place_of_birth`, `office_address`, `mother_office_address`,
      `mailing_address`, `sms_mobile_source`, `caste`, `area_type`),
      admissions desk (`registration_no/_date`, `form_no`,
      `admission_confirm_date`, `counsellor_name/_remark`, `staff_reference`,
      `student_type`, `caution_money_receipt_no/_date/_amount`), and
      previous-school marks (`_max_marks`, `_obtained_marks`, `_result`)
- [x] Migration 090 — `houses` master + `student_enrollments.house_id`
      (per-session, not per-student), case-insensitive unique name, 4 seeded
      houses, streams-style RLS
- [x] Mirror both into `supabase-schema.sql`
- [x] Extend `student-template.ts` (29 entries + 5 enum sets, all `extra: true`
      so the mandated two-profile export layout is untouched) and
      `validations.ts` (`udiseProfileFields`)
- [x] Register `houses` + `student_enrollments.house_id` in the admin-proxy
      `TABLE_FEATURE_KEY` / `ALLOWED_COLUMNS` maps
- [x] Verified: registry↔zod drift guard passes (94 fields, no gaps, no dupes);
      messy enum input normalizes to values the DB CHECKs accept; `tsc --noEmit`
      clean
- [x] `/academics/houses` UI for the houses master (CRUD, colour picker,
      deactivate-vs-delete warning) + `/academics/houses` → `classes` in
      `PATH_FEATURE_OVERRIDES` (an unmapped admin path is open to any editor)
- [x] House assignment on the student form — a Select beside class and roll,
      persisted to the enrollment by POST/PATCH `/api/students`

> Scope note: the admissions-CRM fields land as **plain student columns for
> reporting**, not a counsellor/lead-management subsystem. If they turn out to
> need workflow (assignment, follow-ups, conversion tracking) that is a
> separate feature, not part of this one.

### Phase 2 — Shared foundations
- [x] `packages/shared/src/lib/report-fields.ts` — 116 fields (old ERP had 111),
      built off `STUDENT_TEMPLATE_FIELDS` + joined/derived/blank fields
- [x] `scripts/_verify-report-fields.mts` — duplicate keys, `columns[]` validity,
      `resolve()` totality over a sparse row, sort/always/sensitive invariants,
      and that every field key seeded by migration 091 actually resolves.
      Caught `day_scholar` projecting off the wrong table on its first run.
- [x] `packages/shared/src/lib/report-filters.ts` — zod filter schema + defaults,
      shared verbatim by the form and the API

### Phase 3 — Query + API
- [x] `apps/erp/src/lib/report-query.ts` — session-scoped, enrollment-driven,
      projects only the selected fields' columns
- [x] `POST /api/reports/students/run` — Bearer-gated preview, paginated
- [x] `POST /api/reports/students/export` — cookie-gated download; csv + xlsx
      (POST not GET: the field list does not fit a URL, and a name search in a
      query string lands in access logs). **PDF still to do.**
- [x] PII gate: sensitive fields stripped server-side for non-admins, and the
      count of withheld columns surfaced to the caller rather than silently dropped
- [x] Export audit line (actor, session, format, field list, row count)
- [ ] Promote the audit line to a table, modelled on `call_logs`
- [ ] Verify against real data: a historical session (e.g. 2023-24) returns
      that session's class/roll, not today's — needs a logged-in admin

### Phase 4 — UI
- [x] `/reports/students` — 4 filter tabs + grouped searchable field picker
      (the fix for 111 unlabelled checkboxes) + preview table
- [x] `/reports` index page
- [x] Session in the URL; shared `Select` wrapper with labels; no raw UUIDs
- [x] Sidebar `Reports` group (grouped, not a new top-level entry) +
      `permissions.ts` `reports` key + middleware gate verified (307 → /login)

### Phase 5 — Print (in the first release)
- [x] `ReportPDF` — landscape A4, registry-driven column widths, letterhead
      from `pdf_header_configs`, repeating header row, page numbers
- [x] `Blank-1/2/3` render as empty ruled cells
- [x] Guard rail: amber warning above 12 columns; PDF button disabled and the
      route 400s above 20, naming Excel as the alternative

### Phase 6 — Presets
- [x] Migration 091 `report_presets` (+ mirrored into `supabase-schema.sql`)
- [x] `/api/reports/presets` CRUD — ownership and `is_shared` enforced in the
      route (the service-role client bypasses RLS, so the policies are the
      backstop, not the control)
- [x] Save / load / delete in the UI; two seeded system presets (Contact Sheet,
      UDISE+ Extract). Loading a preset takes the session from the picker, not
      from the preset, so a saved report works in any year.

### Phase 7 — Beyond students
- [ ] Same engine, new registries: Fee Report, Attendance Report, Result Report
- [ ] Extract the shared page shell once the second entity exists — not before

---

## 5. Risks

- **Session-scoping (§3.4)** is the one that produces *plausible wrong output*
  rather than an error. Test it explicitly against a multi-session student.
- **PII surface.** One screen that can export every column of the student
  master. Column projection is a security control, not an optimisation; log
  exports (who, filters, field list, row count) the way `call_logs` does.
- **Row volume.** ~900 students/session today. CSV/XLSX are fine; PDF is not,
  above a few hundred rows × a dozen columns. Cap and say so.
- **Registry drift.** Adding a student field in six places instead of the
  registry already breaks the existing consumers; this adds a seventh.
- **Overlap with the in-flight export branch.** `csv-export.ts`,
  `/api/students/[id]/export` and `STUDENT_CSV_COLUMNS` are all touched by both.
  Branch off the export branch, don't race it.

---

## 6. Decisions (settled 2026-08-22)

### 6.1 Gap fields — all four sets approved
Govt/board IDs (PEN, APAAR, CBSE reg no), a `houses` master, contact/identity
extras (salutations, district/state, place of birth, office + mailing
addresses, SMS-preferred mobile), **and** the admissions-CRM set (counsellor
name/remark, staff reference, student type, form no, admission confirm date,
caution money).

Still dropped as genuinely inapplicable: hostel/hosteler (no hostel), machine
id (no biometric device), board type (CBSE-only school).

House is modelled on `student_enrollments`, not `students` — students change
house between sessions, and a session-scoped report has to print the house they
held *that* year.

The CRM fields ship as flat student columns for reporting only. They give the
report parity with the old ERP; they do not make us an admissions CRM.

### 6.2 Formats — CSV + XLSX + PDF in the first release
Phase 5 is therefore part of v1, not a follow-up.

### 6.3 Editor access — grantable, with a PII gate
`reports` is a normal editor-grantable feature, but:
- the field list gets a PII review before the grant is offered;
- sensitive fields (Aadhaar, Jan Aadhaar, parent incomes, addresses) are
  stripped **server-side** for non-admins — hiding them in the picker is UI
  polish, not a control;
- every export is logged (who, filters, field list, row count).

### 6.4 Still open
1. **Preset scope** — private-only, or private + shared? Recommendation: both,
   `is_shared` writable by admins only.
2. **Old-status mapping** — do Re-Study / Class Jump / Supplementary /
   TC_Deactive need to be reportable as distinct statuses, or is our five-value
   enum plus `supplementary_attempts` enough?
3. **Branch strategy** — this touches `csv-export.ts`,
   `/api/students/[id]/export` and `STUDENT_CSV_COLUMNS`, all in flight on the
   export branch. Branch off it rather than off `main`?
