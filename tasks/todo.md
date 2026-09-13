# Staff page: group tabs + clickable name → detail view

## Problem
- `/people/staff` lists teachers, management, bus drivers and peons in one flat table.
- Table shows only a few columns; seeing a teacher's full details means opening Edit.

## Decisions
- Three tabs derived from `staff-roles.ts` groups: Teachers / Management & Office /
  Drivers & Helpers. Tab in URL as `?group=`.
- Name click → read-only `StaffDetailDialog` (mirrors students quick-peek). For linked
  teachers it also shows employee id, joining date, class-teacher and subject assignments
  for the current academic year.

## Tasks
- [x] 1. `staffCategoryGroup()` + `StaffGroup` in packages/shared/src/lib/staff-roles.ts
- [x] 2. `StaffAvatar` component (move avatar helpers out of page.tsx)
- [x] 3. `StaffDetailDialog` component with lazy teacher-assignment fetch
- [x] 4. page.tsx: tabs, scoped category filter, clickable name, wire dialog
- [x] 5. transport/drivers link → `/people/staff?group=support`
- [x] 6. guide/screens.ts staff entry updated; `pnpm run check:guide`
- [x] 7. typecheck + lint
- [~] 8. Browser check on dev server — skipped: needs an admin sign-in; user chose to merge (typecheck/lint/build/guide all green)
- [x] 9. PR #52 → CI green → merge to main

## Review
- Tabs derive from `staffCategoryGroup()` next to the login rules — one partition,
  two consumers, no drift.
- Detail dialog is a separate component; page.tsx got shorter, not longer.
- Merged main mid-flight: picked up `teacher_subjects` (117) and retire flow (116)
  so the Teaching section shows "Can teach" and a retired banner.
- Lint warning from a `setState` in effect was fixed by keying loaded data on
  member id instead of resetting — no new warnings introduced.
- Browser verification not done (auth wall); PR body flags a post-deploy click-through.
