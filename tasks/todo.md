# Per-Editor Feature Permissions

Goal: Let an admin pick exactly which admin features each individual editor can see and use. Some editors get only Site Media, some only Fees + Calendar, some only Exams + Timetable, etc.

**Hard constraint: must not break anything that works today.**
- Admins keep full access (no change in behavior).
- Existing single editor (if any) keeps the routes they have now until permissions are explicitly assigned — covered by a backfill in the migration.
- All non-editor roles (teacher/student/parent) untouched.

---

## Design summary

**One new table** `editor_permissions` keyed by `(editor_id, feature_key)`. Presence of a row = granted. Absence = denied.

**Two enforcement points** (both required):
1. **Sidebar** hides links the editor can't access (UX).
2. **Server** rejects requests for features the editor lacks (security — sidebar is bypassable by typing the URL).

**Server enforcement happens in two places:**
- **Middleware** (`src/lib/supabase/middleware.ts`) — page-level guard. Maps URL prefix → feature_key, checks `editor_permissions`, redirects denied editors to `/admin`.
- **API routes** — extend `verifyAdminOrEditor()` to accept an optional `featureKey` param. Routes that editors can hit pass their feature_key; admins always pass.

**Granularity (v1):** view + edit per feature, no separate read-only mode. Can be added later if anyone asks.

**Feature catalog** (single source of truth in `src/lib/permissions.ts`):

| feature_key | URL prefix | Label |
|---|---|---|
| `gallery` | `/admin/gallery` | Gallery |
| `transfer_certificates` | `/admin/transfer-certificates` | Transfer Certificates |
| `contact` | `/admin/contact` | Contact Messages |
| `site_media` | `/admin/site-media` | Site Media |
| `disclosure` | `/admin/disclosure` | Disclosure |
| `staff` | `/admin/staff` | Staff |
| `students` | `/admin/students` | Students |
| `classes` | `/admin/classes` | Classes |
| `subjects` | `/admin/subjects` | Subjects |
| `academic_years` | `/admin/academic-years` | Academic Years |
| `exam_types` | `/admin/exam-types` | Exam Types |
| `fees` | `/admin/fees` | Fees |
| `timetable` | `/admin/timetable` | Timetable |
| `calendar` | `/admin/calendar` | Calendar |
| `attendance` | `/admin/attendance` | Attendance |
| `results` | `/admin/results` | Results |
| `registrations` | `/admin/registrations` | Registrations |

**Always-allowed for editors (not in catalog, no permission needed):**
- `/admin` (dashboard landing)
- `/admin/login` (login)

**Admin-only forever (never grantable to editors):**
- `/admin/users` — managing users could let an editor grant themselves anything. Stays admin-only.

---

## Tasks

### Phase 1 — Schema & catalog
- [ ] Write `scripts/migration-009-editor-permissions.sql`:
  - `CREATE TABLE editor_permissions (editor_id uuid REFERENCES profiles(id) ON DELETE CASCADE, feature_key text NOT NULL, granted_at timestamptz DEFAULT now(), granted_by uuid REFERENCES profiles(id), PRIMARY KEY (editor_id, feature_key))`
  - Index on `editor_id`
  - RLS: enable; admin-only read/write policy (service role bypasses anyway, so this is belt-and-braces)
  - **Backfill**: for every existing `profiles.role = 'editor'`, insert rows for the current hardcoded allowlist (`gallery`, `transfer_certificates`, `site_media`, `disclosure`, `staff`, `calendar`) so no editor loses access on deploy
- [ ] Append the same `CREATE TABLE` to `supabase-schema.sql` so fresh installs get it
- [ ] Create `src/lib/permissions.ts` exporting:
  - `FEATURE_KEYS` array (the 17 keys above)
  - `FEATURE_CATALOG` array of `{ key, label, href }` for UI
  - `featureKeyForPath(pathname: string): string | null` — maps `/admin/gallery/anything` → `"gallery"`, returns null for `/admin` (always-allowed) and `/admin/users` (admin-only)
  - `ADMIN_ONLY_PREFIXES = ["/admin/users"]`

### Phase 2 — Server enforcement (auth)
- [ ] Extend `src/lib/verify-admin.ts`:
  - `verifyAdminOrEditor(featureKey?: string)` — if caller passes a key AND user is an editor, query `editor_permissions` for that `(editor_id, featureKey)`. If missing, return null. Admins skip the check.
  - Keep the no-arg call working (back-compat for any route I miss)
- [ ] Update `src/lib/supabase/middleware.ts`:
  - After the existing role check (line 116), if `role === 'editor'`:
    - If pathname is in `ADMIN_ONLY_PREFIXES` → redirect to `/admin`
    - Else compute `featureKeyForPath(pathname)`. If non-null, query `editor_permissions`. If no row → redirect to `/admin`.
  - Cache check is per-request only; no global cache (correctness > a few ms)
- [ ] Audit the 19 API routes from grep results. For each that an editor could plausibly hit, pass the matching feature_key:
  - `api/admin/site-media` → `"site_media"`
  - `api/admin/disclosure-documents` → `"disclosure"`
  - `api/admin/section-cards` → check what feature it serves
  - `api/admin/contact*` → `"contact"`
  - `api/gallery` → `"gallery"`
  - `api/transfer-certificates` → `"transfer_certificates"`
  - `api/staff*` → `"staff"`
  - `api/erp/students*` → `"students"`
  - `api/erp/registrations*` → `"registrations"`
  - `api/admin/dashboard*` → leave un-keyed (dashboard is always-allowed)
  - `api/admin/upload-url` → leave un-keyed (used by multiple features; access is gated by which page can call it)
  - `api/portal/bulk-create` → check who calls it; likely admin-only

### Phase 3 — Sidebar (UX)
- [ ] Refactor `src/components/admin/AdminSidebar.tsx`:
  - Replace hardcoded `EDITOR_ALLOWED_HREFS` with a fetch of the editor's permissions on mount (alongside existing role fetch — single round-trip)
  - Map permissions → set of allowed hrefs using `FEATURE_CATALOG`
  - Always include `/admin` for editors. Never include `/admin/users` for editors.
  - Loading state: show role-but-no-links until perms load (or skeleton — pick whichever is least jarring; current code already shows everything for admin until role loads, mirror that)

### Phase 4 — Permissions UI for admins
- [ ] On `/admin/users` editor row, add an "Edit Permissions" action (button or link to a drawer/modal). Existing user management page is the right host — don't create a separate top-level page.
- [ ] Build a permissions editor component:
  - Lists all 17 features as checkboxes, grouped Content / ERP to mirror sidebar
  - Pre-checks current permissions
  - "Save" calls a new API route
- [ ] New API route `src/app/api/admin/editor-permissions/route.ts`:
  - `GET ?editor_id=xxx` → returns array of feature_keys (admin-only via `verifyAdmin()`)
  - `PUT` body `{ editor_id, feature_keys: string[] }` → replaces the editor's permissions atomically (delete all + insert new, in one transaction). Validates feature_keys against `FEATURE_KEYS`. Admin-only.
- [ ] Hide the "Edit Permissions" button for non-editor users (admins/teachers/students don't need it)

### Phase 5 — Verification (don't skip)
- [ ] Migration applied locally; check backfill row count matches existing editor count × 6 features
- [ ] Type check + lint clean
- [ ] Manual flow as admin: log in, edit an editor, uncheck `staff`, save. Confirm row disappears from `editor_permissions`.
- [ ] Manual flow as that editor: log in, confirm Staff link is hidden in sidebar, confirm typing `/admin/staff` redirects to `/admin`, confirm relevant API call returns 401/403.
- [ ] Re-grant `staff`, confirm access restored without re-login (next page nav picks it up).
- [ ] Confirm admin user still sees and can access everything.
- [ ] Confirm a teacher/student/parent login is unaffected (they still go to their own portals).

### Phase 6 — Document
- [ ] Add a short note in `CLAUDE.md` under "Backend: Supabase" mentioning the `editor_permissions` table and `src/lib/permissions.ts` as the feature catalog.
- [ ] Append a Review section to this file after merge: what changed, files touched, any surprises.

---

## Risks / things to watch

1. **Backfill correctness** — if I miss it, every existing editor immediately loses everything. Mitigation: SQL `INSERT ... SELECT` from `profiles WHERE role = 'editor'` cross-joined with the current 6 hardcoded features.
2. **Middleware DB query on every page nav** — adds one query per `/admin/*` request for editors. Acceptable; admin traffic is low. If it becomes a problem later, cache in a JWT claim.
3. **Section-cards & upload-url APIs** — shared utilities. Don't gate them by a single feature_key; let the page-level middleware do the work, and keep API auth at the looser `verifyAdminOrEditor()` level.
4. **`api/admin/section-cards`** — need to read it to understand which feature it belongs to before deciding its key (or leave un-keyed).
5. **Race during permission update** — admin saves new perms while editor is mid-session. Editor's next request reflects new state (no caching), so worst case they see a 401 on a stale link. Acceptable.
6. **Don't lock yourself out** — never let an admin demote themselves to editor through this UI. Add a guard on the user-edit page if it doesn't already exist.

---

## Out of scope (v1)

- Read-only vs edit permissions (just view-or-not for now)
- Per-record permissions (e.g. "can edit gallery but only their own uploads")
- Audit log of who granted what (we capture `granted_by` and `granted_at` in the table for future use)
- Bulk permission templates ("apply this template of features")

---

## Review

### Files added
- `scripts/migration-009-editor-permissions.sql` — table, RLS, backfill
- `src/lib/permissions.ts` — feature catalog, path→key mapping, admin-only paths
- `src/app/api/admin/editor-permissions/route.ts` — GET / PUT for admins
- `src/components/admin/EditorPermissionsDialog.tsx` — checkbox UI
- Added `editor_permissions` table block to `supabase-schema.sql`

### Files modified
- `src/lib/verify-admin.ts` — `verifyAdminOrEditor(featureKey?)` now checks grants when key provided
- `src/lib/supabase/middleware.ts` — editor feature gate + admin-only path block
- `src/components/admin/AdminSidebar.tsx` — dynamic permission fetch replaces hardcoded `EDITOR_ALLOWED_HREFS`
- `src/app/admin/users/page.tsx` — "Permissions" button on editor rows, dialog wired in
- `src/app/api/admin/route.ts` — per-table feature gating via `TABLE_FEATURE_KEY`
- Feature-keyed: `admin/contact/unread-count`, `admin/disclosure-documents`, `admin/site-media`, `admin/section-cards`, `gallery`, `transfer-certificates`, `staff`, `staff/bulk`
- `CLAUDE.md` — added "Editor permissions" section under Backend

### Behavior guarantees
- **Admins**: zero behavior change. `verifyAdminOrEditor(key)` short-circuits to true for admins; middleware skips the feature check for admins.
- **Existing editors**: backfill inserts the 6 previously-hardcoded features so no one loses access on deploy.
- **Other roles**: untouched; still route to their own portals.
- Build + typecheck pass clean; pre-existing lint warnings in unrelated files.

### Known v1 limitations (intentional, not blockers)
- Routes still using `verifyAdmin()` (admin-only) or inline cookie-auth remain admin-only: `api/erp/students/*`, `api/erp/registrations/*` (except proxy calls), `api/admin/contact`, `api/portal/bulk-create`, `api/erp/users`. An editor granted `students` or `registrations` will see the page but mutations via those specific endpoints will 403.
- However, editors granted ERP features **can** perform table CRUD through the `/api/admin` proxy, which most admin pages use. So `classes`, `subjects`, `fees`, `exam_types`, `calendar`, `timetable`, `attendance`, `results`, `academic_years` permissions fully work.
- Follow-up (not urgent): migrate the remaining `verifyAdmin()` routes to `verifyAdminOrEditor("students" | "registrations")` if editors need full access to those pages' specialized endpoints.

### Manual test plan
1. Run migration 009 in Supabase SQL editor.
2. As admin: go to `/admin/users`, click Permissions on an editor row. Uncheck `Staff` → Save.
3. Log in as that editor: Staff link disappears from sidebar. Visiting `/admin/staff` directly redirects to `/admin`. API call to `/api/staff` returns 401.
4. Back as admin: re-grant `Staff`. Editor's next nav shows the link again.
5. Verify admin still sees/does everything. Verify a teacher/student/parent login still lands in their correct portal.
6. Verify `/admin/users` redirects an editor to `/admin` regardless of any granted feature.
