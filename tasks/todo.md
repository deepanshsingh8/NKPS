# Dashboard greeting: hydration mismatch on the date label

## Problem
- `DashboardView.tsx` formats the greeting date with `toLocaleDateString("en-IN", …)`
  during SSR and again on the client. Node's and the browser's ICU disagree on
  `en-IN` punctuation (`Monday, 14 September` vs `Monday 14 September`), React
  throws away the whole server-rendered dashboard and repaints it on the client.
- Same block: `getGreeting()` uses `getHours()` in the runtime's local zone. Fine
  under `next dev` (one machine), but Vercel is UTC and users are IST — 09:00 IST
  is 03:30 UTC, so prod would SSR "Working late" and hydrate "Good morning".

## Decisions
- Option 2 from the issue: assemble the parts by hand. `lib/date.ts` already does
  exactly this (`formatToParts` in `SCHOOL_TIME_ZONE`) for `toISODate`; add the
  long-date sibling there rather than inlining a second copy in the component.
- Pin both the date and the greeting hour to `SCHOOL_TIME_ZONE`, the codebase's
  existing convention for "what day/time is it at the school".

## Tasks
- [x] 1. `formatLongDate()` + `hourInTimeZone()` in packages/shared/src/lib/date.ts
- [x] 2. DashboardView: use them for `todayLabel` and `getGreeting`
- [x] 3. typecheck + lint
- [~] 4. Browser check: no hydration warning on ERP + CMS `/` — partial: the
  dashboard is behind the Supabase login and I don't enter credentials. Verified
  the property hydration depends on instead (below); sign in once to see the
  console stay clean end-to-end.

## Review
- `formatWeekdayDate` and `hourInTimeZone` live next to `toISODate` in
  `lib/date.ts` and use its exact pattern (formatToParts, `SCHOOL_TIME_ZONE`) —
  one convention for "what day/time is it at the school", not a second one.
- Proof the mismatch is gone: ran the helpers in Node 22 (the SSR side) and in
  Chrome 152 (the in-app browser) for five instants — now, both sides of IST
  midnight, 09:00 IST and 12:00 IST. Output is byte-identical: e.g.
  `"Monday 14 September" / 0` at 18:30Z and `"Sunday 13 September" / 23` at
  18:29:59Z. `hourCycle: "h23"` gives `0` at midnight, never `24`.
- Same run with `TZ=UTC` (Vercel) shows why the greeting needed the fix too:
  `getHours()` = 3 at 09:00 IST → "Working late" on the server, "Good morning"
  in the browser. `hourInTimeZone` = 9 on both.
- Dev server compiled the shared package cleanly; console on the reachable
  route has no hydration messages. Typecheck green, lint 0 errors, no warnings
  in touched files.
- Dev-only: symlinked the main checkout's `.env.local` into the worktree
  (root + `apps/erp` + `apps/cms`, mirroring the main checkout). Gitignored.
