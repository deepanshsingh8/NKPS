# Fix staff → portal-user creation

## Problem
- Auto-create on staff add used `role:"teacher"` with no `teacherId` → `createPortalUser`
  silently fell through to **student**.
- Bulk "Create Users" always promoted staff to **teacher** regardless of category
  (front desk became a teacher).
- No category → role mapping; `staff` role never used.
- Staff page can't tell who already has a login (never queries `profiles`).
- Convert-to-teacher (GraduationCap) shown for non-teaching staff too.

## Decisions
- Teaching (pgt/tgt/prt/motherTeachers/*Coordinator) → **teacher** (+ linked teacher record)
- Office-type (management/admin/additionalStaff) → **staff**
- busDriver/peon → **no login**
- Keep auto-create-on-add, but with correct role by category

## Tasks
- [x] 1. Shared helper `staffPortalRole(category)` + `isTeachingStaffCategory` (packages/shared/src/lib/staff-roles.ts)
- [x] 2. `createPortalUser`: accept `"staff"`; validate required links up front; trust role (no student fallback)
- [x] 3. `/api/staff` POST auto-create: branch by category (teacher+promote / staff / skip)
- [x] 4. `/api/staff/bulk`: capture inserted ids; create logins with correct role by category
- [x] 5. `/api/portal/bulk-create`: look up category per staff id; teacher(+promote) / staff / skip
- [x] 6. `/api/staff/[id]/convert-to-teacher`: reject non-teaching categories
- [x] 7. Staff page: fetch profiles-by-email → know who has a login; per-row "Create login" button
      (hidden if login exists or category has no login); gate GraduationCap to teaching categories
- [x] 8. CreatePortalUsersDialog / bulk flow: skip rows that already have a login
- [x] 9. typecheck (4 pkgs pass) + lint (0 errors); welcome email uses role as label ("Staff") — OK

## Review
- No schema/migration needed — the `staff` role already exists in the profiles CHECK constraint.
- Root cause of the "student" account: createPortalUser derived role from the link id and fell
  through to "student" when staff-create passed role="teacher" with no teacherId. Now it validates
  and trusts the role.
- Existing wrongly-created users are NOT auto-fixed: fix each on /people/users by changing role to
  "staff" (works; only teacher/parent need a linked record).

---

## Streams consolidation + Subjects rename (2026-08-22)

- [x] Fold the standalone `/academics/streams` master into the existing **Streams** tab on
      Subjects & Assignments — the two overlapped almost entirely.
      Ported across: `sort_order` (create + edit dialogs), usage counts (classes / fee rows shown
      on each stream card), the duplicate-name guard, and the in-use delete guard.
- [x] Delete `apps/erp/src/app/(admin)/academics/streams/page.tsx`, its sidebar entry, and its
      `PATH_FEATURE_OVERRIDES` mapping in `permissions.ts`.
- [x] Rename sidebar "Subjects" → "Subjects & Assignments" (matches the page's own h1); same in
      `FEATURE_CATALOG` and the `/academics` hub tile.
- [x] Verify: `pnpm typecheck` clean, erp lint 0 errors, erp build clean, `/academics/streams`
      no longer in the route table.

### Review

Streams keep their own tab (not their own page) because everything that makes a stream useful —
which subjects it carries — already lived there. The standalone page only added guards, so the
guards moved rather than the screen. Nothing else in the codebase linked to `/academics/streams`.

Follow-up (§6 Math review banner): fixed rather than left alone. A per-class audit showed the
banner was wrong twice over. Class X is the only place the CBSE Standard(041)/Basic(241) split
applies — IX teaches one common Mathematics, XI–XII pair Mathematics(041) with Applied
Mathematics(241) — so flagging IX–XII marked two correct rows (IX-A, XII-A) as broken, and since
XII-A is correct as-is the banner could never reach zero. The subject names it named
(`Mathematics — Standard` / `— Advanced`, from migration 049) do not exist in this DB either; the
live rows are Mathematics Standard (041), Mathematics Basic (241), Applied Maths (241). Now scoped
to Class X, names the CBSE codes rather than local subject names, and lists affected classes.
Zero data changes were needed — no Class X has a maths subject linked at all.

Separate, larger data gap (not addressed): only 3 of 32 classes in 2026-27 have ANY maths subject
linked — LKG-A, IX-A, XII-A. Mathematics Standard, Mathematics Basic and Applied Maths are linked
to zero classes. Subject assignment is broadly incomplete, not just for maths.
