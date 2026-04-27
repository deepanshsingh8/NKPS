# NKPS Modules

NKPS is a turborepo with three independent Next.js apps and one shared package.
The repo can be deployed in three productization tiers:

| Tier | Apps deployed | Suitable for |
|---|---|---|
| **Website** | `apps/website` + `packages/shared` | School with a public site, no admin |
| **Website + CMS** | `apps/website` + `apps/cms` + `packages/shared` | School that wants content management (gallery, articles, TC uploads, contact) |
| **Website + CMS + ERP** | All three apps + `packages/shared` | Full school management (students, exams, fees, timetable, attendance, portal/teacher/student/parent dashboards) |

## Repo layout

```
.
├── apps/
│   ├── website/           ← public marketing site                (subdomain: nkps.com)
│   │   └── src/
│   │       ├── app/       ← public routes (/, /about, /academics, …)
│   │       ├── components/ ← website-only React components
│   │       └── lib/       ← website-only data helpers (site-media, disclosure)
│   │
│   ├── cms/               ← content management (subdomain: cms.nkps.com)
│   │   └── src/
│   │       ├── app/       ← admin routes (/, /articles, /gallery, /contact, …)
│   │       ├── components/ ← CmsSidebar
│   │       ├── proxy.ts   ← CMS auth gate (admin/editor only)
│   │       └── …
│   │
│   └── erp/               ← school operations (subdomain: erp.nkps.com)
│       └── src/
│           ├── app/
│           │   ├── (admin)/   ← admin pages with sidebar (/, /people, /exams, …)
│           │   ├── portal/    ← portal login + password flows
│           │   ├── teacher/   ← teacher dashboard
│           │   ├── student/   ← student dashboard
│           │   ├── parent/    ← parent dashboard
│           │   ├── auth/      ← Supabase auth callbacks
│           │   └── api/       ← all ERP + portal + staff API routes
│           ├── components/    ← ErpSidebar, dialogs, bulk uploads, pdf/, etc.
│           ├── lib/           ← ERP business logic (final-result, fees, grading, …)
│           └── proxy.ts       ← ERP auth gate (multi-role)
│
├── packages/
│   └── shared/            ← code consumed by every app
│       └── src/
│           ├── components/ ← ui primitives, providers, sidebar shell, dashboard view
│           ├── lib/        ← Supabase clients, validations, email, permissions, utils
│           ├── hooks/      ← useUnreadCount, useMousePosition
│           └── types/      ← TypeScript types
│
├── pnpm-workspace.yaml    ← declares apps/* and packages/* as workspaces
├── turbo.json             ← build/dev/lint pipelines
├── eslint.config.mjs      ← module-boundary enforcement
└── supabase-schema.sql    ← consolidated DB schema (see DB section below)
```

## Module-boundary enforcement

ESLint blocks cross-app imports. Each app can only import from itself + `@nkps/shared/*`. There's no path between, e.g., `apps/website` and `apps/cms` — the only way they share code is through `packages/shared`.

Run `pnpm run lint` to verify. Zero violations is the goal.

## Database modules

Run the corresponding sections from `supabase-schema.sql` for the tier you want.

### Base (every deployment)
Required for auth, profiles, and calendar:

| Table | Purpose |
|---|---|
| `profiles` | Per-user role + display info (mirrors `auth.users`) |
| `editor_permissions` | Per-feature CMS/ERP grants for editor role |
| `calendar_events` | Public school calendar (academic-calendar page reads it) |
| `notifications` | Cross-module notification fanout |

### CMS (Tier 2+)
Adds content-management tables: `gallery_images`, `gallery_events`, `articles`, `site_media`, `section_cards`, `transfer_certificates`, `contact_submissions`, `disclosure_items`, `disclosure_documents`, `disclosure_board_results`, `staff_members`.

Storage buckets: `gallery`, `transfer-certificates`, `site-media`, `staff-photos`, `disclosure-documents`.

### ERP (Tier 3)
Adds `academic_years`, `streams`, `classes`, `subjects`, `class_subjects`, `stream_subjects`, `students`, `student_subjects`, `student_enrollments`, `parents`, `student_parents`, `teachers`, `attendance`, `exam_types`, `exam_schedules`, `result_masters`, `result_master_subjects`, `class_grade_scales`, `grade_scales`, `grade_bands`, `class_exam_configs`, `results`, `marksheet_publications`, `class_tests`, `class_test_results`, `non_scholastic_*`, `student_remarks`, `ptm_notes`, `ptm_formats`, `supplementary_attempts`, `fee_structures`, `fee_payments`, `payment_orders`, `timetable_periods`, `substitutions`, `teacher_absences`, `school_meeting_counts`, `pdf_header_configs`, `pdf_footer_configs`, `admit_card_templates`, `registration_requests`, `publish_events`.

Storage bucket: `avatars`.

### Cross-module FKs

- `transfer_certificates.student_id` → `students(id)` (ON DELETE SET NULL — TCs survive student deletion). For CMS-only deployments, skip the FK constraint.
- `staff_members` rows can be linked to `teachers` in ERP deployments.

## Local development

```bash
# install once
pnpm install

# run a single app (each on its own port)
pnpm run dev:website    # → http://localhost:3001
pnpm run dev:cms        # → http://localhost:3002
pnpm run dev:erp        # → http://localhost:3003

# run all three concurrently via turbo
pnpm run dev

# build all three
pnpm run build

# typecheck and lint
pnpm run typecheck
pnpm run lint
```

Each app needs its own `.env.local` with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. For local dev, symlink them all to a root `.env.local`:
```bash
ln -sf ../../.env.local apps/website/.env.local
ln -sf ../../.env.local apps/cms/.env.local
ln -sf ../../.env.local apps/erp/.env.local
```

## Production deployment (subdomains)

Each app deploys to its own Vercel project on its own subdomain:

| Subdomain | Vercel project | Root directory |
|---|---|---|
| `nkps.com` | `nkps-website` | `apps/website` |
| `cms.nkps.com` | `nkps-cms` | `apps/cms` |
| `erp.nkps.com` | `nkps-erp` | `apps/erp` |

### Vercel project setup (per app)

1. Import the GitHub repo into Vercel.
2. **Root directory**: set to `apps/website`, `apps/cms`, or `apps/erp` accordingly.
3. **Framework preset**: Next.js (auto-detected).
4. **Install command**: `pnpm install --frozen-lockfile` (Vercel detects from `packageManager`).
5. **Build command**: leave blank (uses `next build` from the app's package.json).
6. **Environment variables**: copy `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` into each project. The website app additionally needs `ANTHROPIC_API_KEY` (chatbot), `NEXT_PUBLIC_GA_ID` (analytics), `NEXT_PUBLIC_GSC_VERIFICATION` (Search Console). The ERP app additionally needs `RESEND_API_KEY` (welcome emails), `SITE_URL` (links in emails).

### Supabase configuration for subdomain auth

Auth cookies must be visible across all three subdomains. In Supabase Studio → Authentication → URL Configuration:

1. **Site URL**: `https://nkps.com`
2. **Redirect URLs** (allowlist): `https://nkps.com/**`, `https://cms.nkps.com/**`, `https://erp.nkps.com/**`, `http://localhost:3001/**`, `http://localhost:3002/**`, `http://localhost:3003/**`
3. **Cookie domain**: set to `.nkps.com` (note the leading dot) so cookies set by one subdomain are read by the others.

Email templates (password reset, signup confirmation) should point to `https://erp.nkps.com/auth/callback` since the ERP app owns auth callback routes.

### Cross-subdomain redirects

Legacy `/admin/*`, `/cms/*`, `/erp/*` URLs from the pre-monorepo era can be redirected at the website level via Vercel `vercel.json` rewrites. Add to `apps/website/vercel.json`:

```json
{
  "redirects": [
    { "source": "/admin/login", "destination": "https://erp.nkps.com/login", "permanent": true },
    { "source": "/admin/articles", "destination": "https://cms.nkps.com/articles", "permanent": true },
    { "source": "/admin/gallery", "destination": "https://cms.nkps.com/gallery", "permanent": true },
    { "source": "/admin/(.*)", "destination": "https://erp.nkps.com/$1", "permanent": true },
    { "source": "/cms", "destination": "https://cms.nkps.com", "permanent": true },
    { "source": "/cms/(.*)", "destination": "https://cms.nkps.com/$1", "permanent": true },
    { "source": "/erp", "destination": "https://erp.nkps.com", "permanent": true },
    { "source": "/erp/(.*)", "destination": "https://erp.nkps.com/$1", "permanent": true },
    { "source": "/portal/(.*)", "destination": "https://erp.nkps.com/portal/$1", "permanent": true }
  ]
}
```

(These can be added incrementally as old links surface. They're not on the critical path for go-live.)

## Adding a new feature

When adding a feature, decide which app it belongs to:

- **Public-facing display only?** → `apps/website`
- **Content management (admin can create/edit articles, gallery, etc.)?** → `apps/cms`
- **School operations (students, staff, exams, fees, portal)?** → `apps/erp`
- **Used by ≥ 2 apps?** → `packages/shared`

If a feature spans apps (e.g., a CMS-managed banner that the website displays), put the read function in `packages/shared/src/lib/` and the management UI in `apps/cms`.
