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
- [ ] 8. Browser check on dev server
- [ ] 9. PR → CI green → merge to main

## Review
(filled in at the end)
