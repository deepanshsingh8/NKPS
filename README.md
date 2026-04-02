# NK Public School (NKPS)

Official website for **NK Public School** — a Next.js application with a public marketing site, contact and admissions information, and a password-protected **admin panel** for managing gallery images and transfer certificates. Data and files are backed by **Supabase** (PostgreSQL, Auth, and Storage).

---

## Features

- **Public site** — Home, About, Academics, Admissions, Student Life, Facilities, Gallery, Contact, Transfer Certificates lookup
- **Admin dashboard** — Supabase email/password authentication; CRUD for gallery and transfer certificates
- **Contact form** — Submissions stored via API route
- **Animations** — Framer Motion for UI motion; GSAP + ScrollTrigger for scroll-driven effects
- **SEO** — Generated `sitemap.xml` and `robots.txt`

---

## Tech stack

| Layer | Technology |
|--------|------------|
| Framework | [Next.js](https://nextjs.org) (App Router), React 19 |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| UI | shadcn/ui (Base UI primitives) |
| Motion | Framer Motion, GSAP |
| Backend | [Supabase](https://supabase.com) — Auth, Postgres, Storage |
| Forms / validation | React Hook Form, Zod |

---

## Prerequisites

- **Node.js** 20+ (recommended; matches typical Next.js 16 requirements)
- **npm** (lockfile: `package-lock.json`)
- A **Supabase** project with schema and storage aligned to this repo (see [Database](#database--supabase))

---

## Getting started

```bash
git clone <your-repo-url>
cd NKPS
npm install
```

Create environment variables (see below), then:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment variables

Copy the example file and fill in real values:

```bash
cp .env.example .env.local
```

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous (public) key — safe for the browser |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes for server features | Service role key — **never** expose to the client; used in API routes and admin operations |
| `ANTHROPIC_API_KEY` | Optional | Used by `src/app/api/chat/route.ts` if you enable the chat feature |

**Security:** Do not commit `.env.local`. The service role key bypasses Row Level Security; keep it server-only.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the development server with hot reload |
| `npm run build` | Production build |
| `npm run start` | Run the production server (after `build`) |
| `npm run lint` | Run ESLint |

---

## Database & Supabase

- **Schema:** `supabase-schema.sql` — tables, policies, and related definitions for this project.
- **Tables (high level):** `gallery_images`, `transfer_certificates`, `contact_submissions` (and any additional objects defined in the schema file).
- **Storage buckets:** `gallery` (images), `transfer-certificates` (PDFs).

Apply the schema in the Supabase SQL editor (or via migrations) and create matching buckets with policies consistent with your security model.

**Supabase client layout:**

- `src/lib/supabase/client.ts` — browser client
- `src/lib/supabase/server.ts` — server components / server actions
- `src/lib/supabase/admin.ts` — service role client (API routes only)
- `src/lib/supabase/middleware.ts` — session refresh for middleware

---

## Project structure (overview)

```
src/
  app/                 # App Router: pages, layouts, API routes
  components/
    layout/            # Navbar, Footer, TopBar, PageHeader, …
    home/              # Hero, stats, testimonials, …
    about/, academics/ # Section-specific UI
    admin/             # Admin shell (e.g. sidebar)
    shared/            # Reusable sections, motion, cards
    ui/                # shadcn/ui components
  lib/
    constants.ts       # School copy, contact, staff, facilities, …
    validations.ts     # Zod schemas
    animations.ts      # Framer Motion variants
middleware.ts          # Protects /admin/*; redirects to /admin/login
```

**Types:** `src/types/index.ts` — shared TypeScript models for database entities.

---

## Routes

**Public:** `/`, `/about`, `/academics`, `/admissions`, `/student-life`, `/facilities`, `/gallery`, `/contact`, `/transfer-certificates`

**Admin:** `/admin` (dashboard), `/admin/login`, `/admin/gallery`, `/admin/transfer-certificates`

**Generated:** `/sitemap.xml`, `/robots.txt`

---

## Admin access

1. Configure Supabase Auth (email/password).
2. Create a user in the Supabase dashboard (or your sign-up flow, if enabled).
3. Visit `/admin/login` and sign in. Unauthenticated requests to `/admin/*` are redirected to the login page via `middleware.ts`.

---

## Design conventions

- **Colors (Tailwind):** `navy-900` (primary), `blue-600` (accent), `gold-500` (secondary accent), `cream-50` (backgrounds).
- **Typography:** Playfair Display (`font-heading`) for headings; Inter (`font-sans`) for body text.
- **Icons:** Lucide React; brand icons (e.g. social) live in `SocialIcons.tsx` where custom SVGs are used.

---

## Contributing / development notes

Internal notes for AI-assisted development live in `CLAUDE.md` and `AGENTS.md` (Next.js version-specific guidance). For day-to-day work, follow existing patterns in `src/lib` and `src/components`.

---

## License

This project is **private** (`"private": true` in `package.json`). Add a public license file only if you intend to open-source the repository.
