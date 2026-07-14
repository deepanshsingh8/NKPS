# Floating Doodles — visibility + coverage + cursor repulsion

## Goal
Recently-added FloatingDoodles are barely visible (~13% opacity), inconsistent, and only
on a few sections. Make them **bold/prominent**, **present on every page**, with **global
drift + local cursor repulsion** ("making space for the mouse").

## Decisions (locked, from user)
- Motion: **Both combined** — subtle global parallax drift + local proximity repulsion.
- Visibility: **Bold/prominent** — ~40–45% opacity, thicker strokes.

## Plan
- [ ] Rewrite `packages/shared/src/components/FloatingDoodles.tsx`
  - [ ] Bump opacity ~40–45% + thicker stroke
  - [ ] Keep subtle global parallax drift (useMouseMotion)
  - [ ] Add per-doodle proximity repulsion (cursor pushes nearby doodles away, springs back)
  - [ ] Measure rest-center from an untransformed wrapper; recompute on scroll/resize
  - [ ] Respect prefers-reduced-motion; aria-hidden; pointer-events-none; z-0
- [ ] Wire into every remaining page consistently (one+ plain-bg section each):
      home (more sections), student-life, alumni, for-parents, gallery,
      academic-calendar, mandatory-public-disclosure, transfer-certificates, articles
- [ ] Verify: typecheck/build + drive pages in browser (visibility + repulsion)

## Review — DONE
**Component** (`packages/shared/src/components/FloatingDoodles.tsx`):
- Opacity bumped ~13% → **40% (dark) / 45% (light)**, stroke 1.25 → **1.6**, default count 12 → 14.
- **Global drift** (useMouseMotion, depth parallax) + **local cursor repulsion**: each doodle
  within 200px of the cursor is pushed away (spring, snaps back) — "makes space for the mouse".
- Perf: layer rect measured **once per layer** on scroll/resize (rectRef), NOT per-icon —
  no dozens of forced layouts per scroll frame. Repulsion math is O(1) per doodle per move.
- Still aria-hidden, pointer-events-none, z-0, respects prefers-reduced-motion.

**Coverage** — now on **every one of the 15 routes**:
- Home: QuickLinks (existing) + **StatsCounter** (tone=light) + **Testimonials** (new)
- About: VisionMission/FounderTribute/AchievementsCounter (existing)
- academics, admissions, contact, facilities (existing)
- NEW: alumni, student-life, transfer-certificates, gallery, for-parents,
  academic-calendar, mandatory-public-disclosure, articles list, article detail

**Verified:** typecheck ✅, production build (15 routes) ✅, SSR HTML shows doodle SVGs on
every route (14 per section, correct tone). Live cursor-repulsion animation not driven in
browser (Chrome extension not connected) — logic verified by reasoning + renders correctly.
