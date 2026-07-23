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
