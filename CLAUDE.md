@AGENTS.md

# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## Project Overview

NK Public School (NKPS) — a **turborepo with three Next.js apps** sharing one
Supabase project: a public website, a CMS, and a full school ERP (students,
staff, exams, fees, timetable, attendance, transport, plus teacher/student/parent
portals).

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Framer Motion,
GSAP, Supabase (auth, Postgres, storage). Package manager is **pnpm** — npm will
not resolve the workspace links.

`MODULES.md` is the fuller map (deployment tiers, env vars, Vercel setup).

## Commands

```bash
pnpm install

pnpm run dev            # all three apps via turbo
pnpm run dev:website    # → http://localhost:3001
pnpm run dev:cms        # → http://localhost:3002
pnpm run dev:erp        # → http://localhost:3003

pnpm run build          # all three
pnpm run typecheck
pnpm run lint           # also enforces the module boundary
pnpm run check:guide    # every sidebar link must have a guide entry
```

Run one app with `pnpm --filter @nkps/erp run <script>`. There is **no test
suite**: the four commands above plus a browser pass are the regression net.
A full `pnpm run build` needs Supabase env vars — without them the website app
fails at `supabaseUrl is required`, which is environmental, not a code fault.

## Repo layout

```
apps/website/   public marketing site        (nkpublicschool.com)
apps/cms/       content management           (cms.nkpublicschool.com)
apps/erp/       school operations            (erp.nkpublicschool.com)
packages/shared/  everything used by ≥2 apps
```

**ESLint enforces the module boundary**: an app may import only from itself and
`@nkps/shared/*`. There is no path between two apps — shared code goes in
`packages/shared` or it does not get shared.

### apps/erp

```
src/app/(admin)/   admin pages with the sidebar — academics, people, exams,
                   fees, timetable, attendance, transport, reports,
                   registrations, calendar
src/app/teacher/   teacher dashboard      src/app/student/   student dashboard
src/app/parent/    parent dashboard       src/app/portal/    portal login flows
src/app/api/       every ERP + portal + staff route
src/lib/           ERP business logic — fees, grading, final-result,
                   report-card, teacher-scope, admin-tables, …
src/proxy.ts       the auth gate (multi-role). NOT middleware.ts.
```

`apps/cms/src/proxy.ts` is the CMS equivalent (admin/editor only).

### packages/shared

`src/lib/supabase/{client,server,admin,middleware}.ts` — browser client, server
component client, service-role client (API routes only), session-refresh helper.

Other load-bearing modules: `permissions.ts` (feature catalog), `verify-admin.ts`,
`admin-proxy.ts`, `admin-api.ts`, `validations.ts` (Zod), `row-dependencies.ts`,
`constants.ts` (`CLASS_ORDER`, `classSortIndex`), `guide/screens.ts`,
`stream-alias.ts`, `teacher-options.ts`, `types/index.ts`.

## Database

Consolidated schema: `supabase-schema.sql`. It is **fresh-install only** and is
not re-runnable — most `CREATE POLICY` statements in it are unguarded.

Historical migrations: `scripts/migrations/{base,cms,erp,cross}/migration-NNN-*.sql`,
**globally numbered**, applied in ascending order. See
`scripts/migrations/README.md`. Every migration must be safe to re-run, and every
change must be mirrored into `supabase-schema.sql`.

`MODULES.md` lists the tables per tier.

### Admin writes go through a proxy

Client code calls `adminApi()` → `POST /api/admin`, gated by
`apps/erp/src/lib/admin-tables.ts`:

- `TABLE_FEATURE_KEY` — which feature key may touch the table.
- `ALLOWED_COLUMNS` — the writable columns. **`allowedTables` is the key set of
  `ALLOWED_COLUMNS`, not of `TABLE_FEATURE_KEY`**, so an entry in the first map
  alone grants nothing. A column missing here is rejected as "Invalid data
  fields", which is a silent-looking bug: add the column when you add it to the
  table.

The proxy is single-table. Anything spanning two tables needs its own route
calling `verifyAdminOrEditor(featureKey)`.

### Editor permissions (per-feature admin access)

Admins have everything; editors get only the features granted to them.

- Catalog: `packages/shared/src/lib/permissions.ts` — keys, labels, URL prefixes,
  admin-only paths. **An admin path with no `PATH_FEATURE_OVERRIDES` mapping is
  open to any editor**, so map every new page.
- Storage: `editor_permissions` `(editor_id, feature_key)`.
- Enforced in three places: the proxy page gate
  (`packages/shared/src/lib/supabase/middleware.ts`), the API gate
  (`verifyAdminOrEditor`), and the sidebar filter.
- Granted on `/people/users`, which is admin-only forever, along with
  `/registrations` and the exam master screens (`ADMIN_ONLY_PREFIXES`).

### Teacher authorization

Derives from `class_subjects` + `classes.class_teacher_id` via
`get_my_class_ids()` and `lib/teacher-scope.ts` — **not** from the timetable. No
RLS policy reads `timetable_periods`, so a timetable co-teacher gains no
marks-entry or attendance rights.

### Timetable shape

`timetable_periods` is **one row per (class, day, period, group)**, not per cell
(migration 119). `group_no = 0` is the primary group; 1..n are parallel tracks —
Games split into basketball/badminton/cricket, or an XI/XII period running two
optional subjects side by side. A cell has at most one primary group.

`is_shared` exempts a row from the `timetable_teacher_no_overlap` exclusion
constraint, which is how one coach can be on the field for four sections at
once. Everything else still cannot be in two places at one time.

Two diagnostic views: `timetable_teacher_clashes` (every row in it should be a
deliberate shared activity) and `timetable_assignment_drift` (primary groups
only — parallel groups differ from the canonical assignment by design).

## Conventions

- **Guide registry.** `pnpm run check:guide` fails if a sidebar `href` has no
  entry in `packages/shared/src/lib/guide/screens.ts`. Update the entry when a
  screen's controls change, not only when adding a page.
- **Styling.** Tailwind v4, custom theme: navy-900 (primary dark), blue-600
  (accent), gold-500 (secondary accent), cream-50 (backgrounds). Playfair
  Display for headings (`font-heading`), Inter for body (`font-sans`).
- **shadcn/ui** on base-ui primitives, not Radix. There is no `asChild` — use the
  `render` prop or a controlled `open`/`onOpenChange`.
- **Icons.** Lucide React throughout; brand icons are hand-rolled SVGs in
  `SocialIcons.tsx` because lucide-react dropped them.
- **Animations.** Framer Motion for transitions and scroll reveals; GSAP +
  ScrollTrigger for parallax.
- **Env.** Each app reads its own `.env.local` with `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; symlink all three
  to a root file for local dev.
- **Where does a feature go?** Public display → `website`. Content management →
  `cms`. School operations → `erp`. Used by two or more → `packages/shared`.
