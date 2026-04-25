# CMS / ERP Split — Concrete Plan

## Goal
Split the single `/admin/*` panel into two distinct admin experiences sharing one Supabase backend:
- `/cms/*` — content management (gallery, articles, site-media, disclosure, transfer-certificates, contact)
- `/erp/*` — school operations (people, academics, exams, fees, timetable, calendar, attendance)

Public website gets two login buttons. Same `auth.users`, `profiles`, and `editor_permissions` tables — no DB migration needed.

## Why this is tractable
The codebase is already conceptually split:
- `FeatureDef` already carries `group: "content" | "erp"` (`src/lib/permissions.ts:43`).
- `AdminSidebar` already has separate `contentLinks` and `erpItems` arrays (`src/components/admin/AdminSidebar.tsx:66, 84`).
- Permissions are feature-keyed, not section-keyed, so revoking ERP from a CMS-only editor is already a no-op.
- API routes are already separated under `/api/erp/*` vs `/api/gallery|contact|transfer-certificates/*`.

The split is mostly URL relocation + sidebar/layout duplication, not architectural surgery.

## Open decisions (need user input before implementation)

1. **One shared login page or two?**
   - **One** (recommended): single `/staff/login` page; post-login redirect based on role + which side they came from (via `?next=/cms` or `?next=/erp` query). Simpler, less code.
   - **Two**: cosmetic `/cms/login` and `/erp/login` pages — visually distinct, but same auth backend. Pure aesthetics.
2. **URL scheme:** `/cms/*` + `/erp/*` (recommended — clean, short) **or** `/admin/cms/*` + `/admin/erp/*` (preserves `/admin` as ancestor)?
3. **Old `/admin/*` URLs:** permanent 301 redirects to new homes (recommended) or hard-delete and let bookmarks 404?

---

## Implementation phases

### Phase 1 — Permissions & path scheme (foundation)
- [ ] Update `FeatureDef.href` values in `src/lib/permissions.ts:52-82` from `/admin/...` to `/cms/...` or `/erp/...`
- [ ] Update `ADMIN_ONLY_PREFIXES` (`src/lib/permissions.ts:96-103`) to new ERP paths
- [ ] Add helper `featureGroupForPath(pathname): "cms" | "erp" | null`
- [ ] Add helper `loginPathForGroup(group): string` (returns `/cms/login` or `/erp/login` or shared)

### Phase 2 — Middleware rewrite
- [ ] Rewrite `src/lib/supabase/middleware.ts:25-29` `isProtectedRoute` to check `/cms` + `/erp` instead of `/admin`
- [ ] Update unauthenticated redirect target (line 73) to choose `/cms/login` vs `/erp/login` based on requested path
- [ ] Replace `pathname.startsWith("/admin")` editor checks (lines 117, 126) with `/cms` + `/erp` equivalents
- [ ] Cross-side bouncing for editors: if editor with only CMS perms hits `/erp/*`, redirect to `/cms`
- [ ] Update `middleware.ts:9-21` matcher: replace `/admin/:path*` and `/api/admin/:path*` with `/cms/:path*`, `/erp/:path*`, `/api/cms/:path*` (already have `/api/erp/:path*`)

### Phase 3 — Sidebar + layout split
- [ ] Create `src/components/cms/CmsSidebar.tsx` — copy `AdminSidebar`, keep only `contentLinks`, drop ERP section, change header label "NKPS CMS"
- [ ] Create `src/components/erp/ErpSidebar.tsx` — same copy, keep only `erpItems`, header label "NKPS ERP"
- [ ] Optional refactor: extract a shared `<AdminSidebarShell>` so the two new sidebars don't duplicate 400+ lines of rendering code. Recommended.
- [ ] Create `src/app/cms/layout.tsx` rendering `<CmsSidebar>`
- [ ] Create `src/app/erp/layout.tsx` rendering `<ErpSidebar>`
- [ ] Create `src/app/cms/page.tsx` (CMS-scoped dashboard — counts: pending contact messages, gallery item count, recent articles)
- [ ] Create `src/app/erp/page.tsx` (ERP-scoped dashboard — counts: students, pending registrations, upcoming exams)

### Phase 4 — Move route directories
- [ ] `src/app/admin/content/*` → `src/app/cms/content/*` (or flatten — `/cms/gallery` reads better than `/cms/content/gallery`)
- [ ] `src/app/admin/transfer-certificates/*` → `src/app/cms/transfer-certificates/*`
- [ ] `src/app/admin/contact/*` → `src/app/cms/contact/*`
- [ ] `src/app/admin/academics/*` → `src/app/erp/academics/*`
- [ ] `src/app/admin/attendance/*` → `src/app/erp/attendance/*`
- [ ] `src/app/admin/calendar/*` → `src/app/erp/calendar/*`
- [ ] `src/app/admin/exams/*` → `src/app/erp/exams/*`
- [ ] `src/app/admin/fees/*` → `src/app/erp/fees/*`
- [ ] `src/app/admin/people/*` → `src/app/erp/people/*`
- [ ] `src/app/admin/registrations/*` → `src/app/erp/registrations/*`
- [ ] `src/app/admin/timetable/*` → `src/app/erp/timetable/*`

### Phase 5 — Internal href updates (the tedious part)
- [ ] `grep -rn "/admin/" src/` and update every internal `<Link href>`, `router.push`, server-action `redirect()`, API JSON `redirect_url`, etc.
- [ ] Pay special attention to: dashboard widgets, breadcrumbs, bulk-action redirects, post-create navigations, error fallback routes.
- [ ] Update `src/lib/verify-admin.ts:148` if it references admin paths.
- [ ] Add Next.js redirects in `next.config.js`:
  ```js
  redirects: async () => [
    { source: "/admin", destination: "/cms", permanent: true },
    { source: "/admin/login", destination: "/cms/login", permanent: true },
    { source: "/admin/content/:path*", destination: "/cms/:path*", permanent: true },
    { source: "/admin/exams/:path*", destination: "/erp/exams/:path*", permanent: true },
    // ... one entry per moved subtree
  ]
  ```

### Phase 6 — Login pages
Pick from Open Decision #1:
- **If shared:** create `src/app/staff/login/page.tsx` accepting `?next=` query, redirect old `/admin/login` to it.
- **If split:** clone `src/app/admin/login/page.tsx` to `src/app/cms/login/page.tsx` and `src/app/erp/login/page.tsx`. Each posts to Supabase and lands on its own dashboard.

### Phase 7 — Public website buttons
- [ ] Identify Navbar / footer login link locations (likely `src/components/layout/Navbar.tsx`, possibly Footer).
- [ ] Replace single "Admin Login" with two buttons: "CMS" → `/cms/login`, "ERP" → `/erp/login` (or one "Staff" → chooser).

### Phase 8 — API routes (optional symmetry)
- [ ] Decide whether to rename `/api/gallery`, `/api/contact`, `/api/transfer-certificates` to `/api/cms/*` for symmetry with `/api/erp/*`. Pure cosmetics — skip if it adds risk. If skipped, document the asymmetry.
- [ ] `/api/admin/dashboard` and `/api/admin/editor-permissions` stay where they are (cross-cutting concerns).

### Phase 9 — Delete + verify
- [ ] Once new tree is fully wired, delete old `src/app/admin/` (except possibly a stub `page.tsx` that 301s to `/cms`).
- [ ] Update `CLAUDE.md` and `AGENTS.md` to reflect the new architecture.
- [ ] Update editor-permissions admin UI labels if they reference `/admin/...` paths.

### Phase 10 — Smoke tests
- [ ] Admin: log in via `/cms/login` → land on `/cms`, sidebar shows CMS only. Navigate to `/erp` directly → allowed (admin sees both sides).
- [ ] Editor with CMS-only perms: log in → land on `/cms`. Try `/erp/exams/results` → redirected to `/cms`.
- [ ] Editor with ERP-only perms: log in via either side → land on `/erp`.
- [ ] Editor with mixed perms: lands on requested side, can navigate the other side via direct nav.
- [ ] Old `/admin/exams/results` URL → redirects to `/erp/exams/results`.
- [ ] Public site CMS / ERP buttons land on respective login pages.

---

## File-level effort estimate

| Area | Files touched | Effort |
|---|---|---|
| Permissions catalog | `src/lib/permissions.ts` | 30 min |
| Middleware | `src/lib/supabase/middleware.ts`, `middleware.ts` | 1 hr |
| Sidebar split (with shared shell) | 3 files | 2–3 hrs |
| New layouts + dashboards | 4 files | 3 hrs |
| Folder moves (`mv` + import-path tweaks) | ~80 page files | half day |
| Internal href grep+replace | ~150 occurrences | 4 hrs |
| Login page(s) | 1–2 files | 1 hr |
| Public site buttons | 1–2 files | 30 min |
| `next.config.js` redirects | 1 file | 30 min |
| Smoke testing | — | half day |
| Docs | `CLAUDE.md`, `AGENTS.md` | 30 min |

**Total: ~4–6 working days** for a single developer, sequential. Can be parallelized somewhat by doing Phase 3 (sidebar) and Phase 4 (route moves) concurrently.

---

## Risks & mitigations

- **Stale internal links** — easy to miss a `<Link href="/admin/...">` deep in some component. Mitigation: build a comprehensive grep-replace map; ship `/admin/*` redirects so misses don't 404.
- **Supabase auth cookie scope** — single domain, single cookie. No issue. Logging in once gives access to both sides.
- **Editor sessions in flight at deploy time** — they'll land on `/admin/*`, hit redirect, end up on the right side. Seamless.
- **Bookmark / external link breakage** — covered by 301 redirects in `next.config.js`. Keep them for at least a release cycle.
- **Linter / type-check noise** — moving files with circular imports occasionally breaks. Plan for one round of `npm run build` cleanup after Phase 4.

---

## Decision required before starting
1. Single shared login or two cosmetic logins?
2. URL scheme: `/cms` + `/erp` or `/admin/cms` + `/admin/erp`?
3. Keep redirects forever or drop them after a deprecation window?
4. Rename `/api/gallery` etc. to `/api/cms/*` for symmetry, or leave alone?

Once these are answered, this plan is ready to execute.
