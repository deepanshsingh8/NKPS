# NK Public School — Technical Documentation

> **Scope.** Everything up to "Future Expansion Possibilities" describes the
> **public website** as originally built, when the repo was a single Next.js app.
> The repo is now a turborepo of three apps (`apps/website`, `apps/cms`,
> `apps/erp`) and the ERP alone carries far more than this document covers.
> For the current layout, commands and conventions see `CLAUDE.md`; for the
> deployment tiers, table lists and env vars see `MODULES.md`. The
> **ERP subsystems** section at the end of this file documents the two areas
> whose data model is easiest to get wrong.

## Project Overview

A complete website rebuild for NK Public School (CBSE, Jaipur), replacing the legacy PHP site with a modern, interactive, high-performance web application featuring an admin panel for content management.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    FRONTEND                          │
│              Next.js 15 (App Router)                 │
│         React 19 + TypeScript + Tailwind CSS         │
│                                                      │
│  Public Pages (SSG/SSR)    Admin Panel (CSR + Auth)  │
│  ├── Homepage              ├── Dashboard             │
│  ├── About                 ├── Gallery CRUD          │
│  ├── Academics             ├── TC CRUD               │
│  ├── Admissions            └── Contact Messages      │
│  ├── Student Life                                    │
│  ├── Facilities            API Routes                │
│  ├── Gallery ◄─────────┐   ├── POST /api/contact     │
│  ├── Contact            │   └── POST /api/revalidate  │
│  └── Transfer Certs ◄──┤                             │
│                         │                            │
└─────────────────────────┼────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│                   SUPABASE (Backend)                 │
│                                                      │
│  ┌──────────┐  ┌────────────┐  ┌──────────────────┐ │
│  │   Auth   │  │ PostgreSQL │  │     Storage      │ │
│  │          │  │            │  │                  │ │
│  │ Email/   │  │ gallery_   │  │ gallery/         │ │
│  │ Password │  │   images   │  │   (images)       │ │
│  │          │  │ transfer_  │  │ transfer-certs/  │ │
│  │ JWT +    │  │   certs    │  │   (PDFs)         │ │
│  │ Sessions │  │ contact_   │  │                  │ │
│  │          │  │   subs     │  │                  │ │
│  └──────────┘  └────────────┘  └──────────────────┘ │
│                                                      │
│  Row Level Security (RLS)                            │
│  - Public: read gallery_images, transfer_certificates│
│  - Authenticated: full CRUD on all tables            │
│                                                      │
└─────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│                   DEPLOYMENT                         │
│                                                      │
│  Vercel (Frontend)          Supabase Cloud (Backend) │
│  - Automatic SSL            - Managed PostgreSQL     │
│  - Edge Network CDN         - Managed Auth           │
│  - Serverless Functions     - Managed Storage CDN    │
│  - Image Optimization       - Auto Backups           │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## Tech Stack — Detailed Breakdown

### 1. Next.js 15 (App Router) — Framework

**What it does:** Server-side rendering (SSR), static site generation (SSG), file-based routing, API routes, middleware, and image optimization.

**Why chosen over CRA:**
| Feature | Create React App | Next.js 15 |
|---------|-----------------|------------|
| Rendering | Client-only SPA | SSR + SSG + CSR |
| SEO | Poor (empty HTML) | Excellent (pre-rendered HTML) |
| Image optimization | Manual | Built-in (`next/image`) |
| API routes | Needs separate server | Built-in (`app/api/`) |
| Auth middleware | Manual | Built-in (`middleware.ts`) |
| Performance | Larger bundle, slow FCP | Code splitting, fast FCP |
| Font optimization | Manual | Built-in (`next/font`) |

**Key features used:**
- **App Router** — file-based routing with layouts, loading states, error boundaries
- **Server Components** — pages render on server for fast initial load
- **Client Components** — interactive elements (`"use client"`) for animations and forms
- **Middleware** — auth guard protecting `/admin` routes
- **API Routes** — `app/api/contact/route.ts` for form submissions
- **next/image** — automatic WebP conversion, lazy loading, responsive srcset
- **next/font** — self-hosted Google Fonts (zero layout shift)
- **Metadata API** — per-page SEO (title, description, Open Graph, Twitter cards)

### 2. TypeScript 5 — Language

Type safety across the entire codebase. Supabase generates database types automatically, providing end-to-end type safety from database to UI.

### 3. Tailwind CSS v4 — Styling

Utility-first CSS framework. Custom theme configuration:

```
Colors:  Navy (#0A1628) → Blue (#2563EB) → Gold (#D4A843) → Cream (#FDFBF7)
Fonts:   Playfair Display (headings) + Inter (body)
Radius:  rounded-2xl for cards (claymorphism style)
Shadows: Custom soft shadows for 3D card effects
```

### 4. shadcn/ui — UI Component Library

Pre-built, accessible, customizable components for the admin panel. NOT a dependency — components are copied into the project and owned by us.

**Components used:** Button, Card, Dialog, Input, Label, Select, Table, Tabs, Toast, Accordion, Skeleton, Badge, Sheet, ScrollArea, Separator

### 5. Framer Motion 12 — Animations

React animation library for:
- Page transitions (fade in/out between routes)
- Component mount/unmount animations
- Hover and tap interactions
- Mobile navigation drawer (AnimatePresence)
- Staggered list reveals

### 6. GSAP 3 + ScrollTrigger — Advanced Animations

Industry-standard animation library for scroll-based effects:
- **Parallax backgrounds** — hero images move at different scroll speeds
- **Text reveals** — headings animate character by character on scroll
- **Counter animations** — numbers count up when entering viewport
- **Stagger reveals** — cards appear one by one as user scrolls
- **Smooth scrub** — animations tied to scroll position

**Why GSAP over pure Framer Motion:** GSAP's ScrollTrigger provides precise scroll-linked animations with better performance and more control than Framer Motion's scroll APIs.

### 7. Supabase — Backend as a Service

**What it provides:**

#### Authentication
- Email/password login for admin users
- JWT tokens with secure cookie sessions
- Session refresh via `@supabase/ssr` middleware
- No user registration — admin created manually in Supabase dashboard

#### PostgreSQL Database
- `gallery_images` — stores image metadata (URL, category, alt text, sort order)
- `transfer_certificates` — stores TC metadata (student name, file URL, academic year)
- `contact_submissions` — stores form submissions (name, email, phone, message)
- Row Level Security (RLS) enforces access control at the database level

#### Storage
- `gallery` bucket — public, stores uploaded images (JPG, PNG, WebP)
- `transfer-certificates` bucket — public, stores uploaded PDFs
- CDN-backed URLs for fast file delivery
- File size limits configured per bucket

**Why Supabase over custom backend:**
- Free tier handles this project's scale (500MB database, 1GB storage, 50K auth users)
- Zero server management
- Real-time capabilities for future features
- Built-in RLS eliminates most backend auth code
- Official Next.js SDK (`@supabase/ssr`)

### 8. React Hook Form + Zod — Form Handling

- **React Hook Form** — performant form state management (no re-renders on every keystroke)
- **Zod** — schema-based validation with TypeScript type inference
- Used for: contact form, admin gallery upload form, admin TC upload form

### 9. Lucide React — Icons

Consistent SVG icon set used across the entire site. Tree-shakeable — only icons actually used are included in the bundle.

---

## Security Model

### Authentication Flow
```
User visits /admin → middleware.ts checks Supabase session
  ├── No session → redirect to /admin/login
  └── Valid session → allow access
        └── Session expired → auto-refresh via @supabase/ssr
```

### Row Level Security (RLS)
```sql
-- Public can read gallery images and TCs
CREATE POLICY "Public read" ON gallery_images FOR SELECT USING (true);
CREATE POLICY "Public read" ON transfer_certificates FOR SELECT USING (true);

-- Only authenticated users can insert/update/delete
CREATE POLICY "Auth write" ON gallery_images FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Auth write" ON transfer_certificates FOR ALL USING (auth.role() = 'authenticated');
```

### Storage Security
- Gallery and TC buckets are public-read (files accessible via URL)
- Upload/delete requires authenticated Supabase client
- File type validation on upload (images: jpg/png/webp, TCs: pdf only)
- File size limits enforced

### API Security
- `/api/contact` validates input with Zod before database insertion
- Rate limiting via Vercel Edge middleware (future enhancement)
- No sensitive data exposed in client-side code
- Environment variables for all secrets (never committed)

---

## Performance Strategy

| Technique | Implementation |
|-----------|---------------|
| **SSG** | Content pages pre-rendered at build time |
| **ISR** | Gallery page revalidates on admin upload |
| **Image optimization** | `next/image` auto-converts to WebP, generates srcset |
| **Font optimization** | `next/font` self-hosts, eliminates FOIT/FOUT |
| **Code splitting** | App Router automatically splits per-route |
| **Lazy loading** | Below-fold images and heavy components |
| **CDN** | Vercel Edge Network (frontend) + Supabase CDN (storage) |
| **Bundle size** | shadcn/ui is copy-pasted (no full library import), lucide tree-shakes |

**Target Lighthouse scores:** Performance 90+, Accessibility 90+, Best Practices 90+, SEO 90+

---

## Data Flow Diagrams

### Gallery Image Upload (Admin)
```
Admin selects images → ImageUploader component
  → Upload to Supabase Storage (gallery bucket)
  → Get public URL
  → Insert row into gallery_images table (URL, alt, category)
  → Call /api/revalidate to bust Next.js cache
  → Gallery page shows new image on next visit
```

### Contact Form Submission (Public)
```
User fills form → React Hook Form validates with Zod
  → POST to /api/contact
  → API route validates again (server-side)
  → Insert into contact_submissions table
  → Return success response
  → UI shows success toast
  → Admin sees new message in dashboard
```

### Transfer Certificate Download (Public)
```
User visits /transfer-certificates
  → Next.js fetches from transfer_certificates table (SSR/ISR)
  → Renders searchable table
  → User clicks download → direct link to Supabase Storage CDN
```

---

## Environment Variables

```bash
# .env.local (never committed)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...  # server-only, for API routes
```

- `NEXT_PUBLIC_*` variables are exposed to the browser (safe — anon key has RLS restrictions)
- `SUPABASE_SERVICE_ROLE_KEY` is server-only, never sent to client, bypasses RLS for admin operations

---

## Deployment

### Vercel (Frontend)
1. Push to GitHub → Vercel auto-deploys
2. Environment variables set in Vercel dashboard
3. Custom domain configured via DNS
4. Automatic SSL, CDN, edge caching

### Supabase (Backend)
1. Project created at supabase.com
2. Database schema applied via SQL editor
3. Storage buckets created via dashboard
4. RLS policies configured
5. Admin user created via Auth dashboard

---

## Future Expansion Possibilities

The architecture supports incremental addition of:
- **Parent Portal** — new route group `/parent/` with Supabase Auth (parent role)
- **Online Payments** — Razorpay/Stripe integration via API routes
- **Attendance System** — new Supabase table + admin UI
- **Result Portal** — PDF generation + student auth
- **Push Notifications** — Supabase Realtime + service workers
- **Mobile App** — React Native sharing the same Supabase backend

---

## ERP subsystems

Two ERP areas have a data model that reads wrongly if you assume the obvious
shape. Both are documented here because a wrong assumption about either is
silent — the query returns rows, they are just the wrong rows.

### Timetable: one row per group, not per cell

`timetable_periods` used to be one row per (class, day, period), holding one
subject and one teacher. Since **migration 119** it is one row per
**(class, day, period, group)**.

```
timetable_periods
  class_id, day_of_week, period_number   the cell
  group_no      smallint  0 = primary group, 1..n = parallel tracks
  group_label   text      'Basketball', 'Badminton', 'IP', 'P.Ed'
  is_shared     boolean   this teacher is with several classes at once
  subject_id, teacher_id, start_time, end_time, room, is_break

  UNIQUE (class_id, day_of_week, period_number, group_no)
  UNIQUE (class_id, day_of_week, period_number) WHERE group_no = 0
```

The requirement behind it is a Games period run as three parallel groups
(basketball, badminton, cricket) with three coaches, and an XI/XII optional
slot where subjects 5 and 6 are taught side by side by two teachers.

**Why sibling rows rather than a child table.** A co-teacher living in a
`timetable_period_teachers` child table would be invisible to every
`.eq("teacher_id", …)` query in the ERP — twelve of them — and each failure
would be silent: `api/teacher-absences` reporting "no affected periods" for an
absent co-teacher so no substitute is ever arranged;
`lib/substitution-availability.ts` clearing a substitute who is genuinely
double-booked; `api/substitutions/sheet` mapping one teacher per period and
dropping the second. A group being a row means `teacher_id` is already
per-group, so all of that keeps working unchanged.

**`is_shared` and the overlap constraint.** Migration 071 added a GiST
exclusion constraint, `timetable_teacher_no_overlap`: a teacher cannot occupy
two time-overlapping periods on one weekday. That is right for ordinary
teaching and wrong for games — the basketball coach really is on the field for
VI-A, VI-B, VII-A and VII-B at the same time. The constraint's predicate carries
`AND is_shared IS NOT TRUE`, so marking a row shared exempts it. Nothing else is
exempt.

Two views keep the consequences visible, both granted to `authenticated` only:

| View | Reads |
|---|---|
| `timetable_teacher_clashes` | Every teacher occupying two overlapping periods. In a healthy timetable each row is a deliberate shared activity; a row where neither side is shared is a bug. |
| `timetable_assignment_drift` | Timetable teachers differing from the canonical `class_subjects` teacher. Compares **primary groups only** — parallel groups have their own teachers by design. |

**Writing to it.** Through `adminApi()` → `/api/admin`, so `group_no`,
`group_label` and `is_shared` must appear in `ALLOWED_COLUMNS.timetable_periods`
(`apps/erp/src/lib/admin-tables.ts`) or the write is rejected as "Invalid data
fields". The generate and Excel-commit routes upsert on
`class_id,day_of_week,period_number,group_no`; the old three-column conflict
target no longer exists and PostgREST errors outright if it is used.

**Not modelled.** Which students are in which group (for XI/XII that lives in
`elective_slot_options` / `student_elective_picks`); per-group attendance
(`attendance` is unique per student/class/date, with no period reference); and
per-group results. A timetable co-teacher also gains **no** portal rights —
authorization comes from `class_subjects` and `classes.class_teacher_id` via
`get_my_class_ids()`, and no RLS policy reads `timetable_periods`.

### Subject assignment: who teaches what, and where it is authoritative

Three tables, easy to confuse:

| Table | Key | Means |
|---|---|---|
| `class_subjects` | `UNIQUE(class_id, subject_id)` | This class studies this subject, and **one** teacher is its teacher of record. Authoritative for teacher authorization (migration 069). |
| `stream_subjects` | `(stream_id, subject_id)` | The subject set of a stream *or a wing*. |
| `teacher_subjects` | `UNIQUE(teacher_id, subject_id)` | This teacher is qualified in this subject. Drives dropdown ordering only; grants nothing. |

`teacher_subjects` (**migration 117**) was seeded from both `class_subjects` and
the timetable, because in practice `class_subjects.teacher_id` is often
unpopulated — teachers get assigned via the timetable instead. It is kept
current by an insert-only trigger on `class_subjects.teacher_id`: assigning a
teacher adds the subject to their profile, un-assigning never removes it, since
dropping VI-B Maths does not mean they stopped knowing Maths. It is deliberately
**not** seeded from `staff_members.subject`, which is free text holding values
like "Principal" and "Mother Teacher".

Read access is `TO authenticated`, not public: the table is keyed on a person,
and an anonymous read would enumerate every teacher UUID in the school — the
leak migration 098 was written to close.

**Wings** (**migration 118**) are `streams` rows with `kind = 'wing'` and a
`class_names text[]` band such as `{'VI','VII','VIII'}`. The band is stored as
class *names* rather than ids so a wing survives the academic-year rollover.
Wings are filtered out of every stream picker and every importer's name lookup —
but **not** out of id→name label lookups, or a row already storing a wing would
render blank. `POST /api/subjects/apply-wing` pushes a wing's subject set onto
every class and section in its band; it never deletes, and its
`ON CONFLICT DO NOTHING` leaves an already-staffed row's teacher alone, which is
what makes it safe to re-run.

All four assignment paths — the class dialog, the wing apply, `bulk-assign` and
`quick-setup` — go through `assignSubjectsToClasses()` in
`apps/erp/src/lib/class-subject-assign.ts`. Add a fifth caller there rather than
a fifth implementation.
