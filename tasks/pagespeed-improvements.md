# PageSpeed / Lighthouse improvements (website app)

Measured 2026-06-12 via local Lighthouse against https://nkpublicschool.com
(PSI API quota was exhausted; same engine, same audits).

## Scores

| | Performance | Accessibility | Best Practices | SEO |
|---|---|---|---|---|
| Mobile | **63** (LCP 14.4s, SI 10.2s, TBT 80ms, CLS 0) | 92 | 96 | 100 |
| Desktop | **79** (LCP 2.2s, SI 3.7s) | 92 | 96 | 100 |

Root cause for performance: **images**. Page weight is 7.7MB mobile / 14.2MB
desktop; ~6.6MB (mobile) / ~12.3MB (desktop) of that is avoidable image bytes.
`images.unoptimized: true` (commit c5142c1, deliberate — Vercel Hobby quota)
ships full-resolution Supabase originals: facilities_preview_1 = 1.76MB,
student_achievement card = 1.56MB (loaded twice), logo.png = 259KB at 40px.
TBT/CLS are already excellent — this is purely a payload problem.

## Plan

### Image strategy (the big one) — decision needed
- [ ] **(B) Compress at upload** in `packages/shared/src/lib/supabase/upload.ts`
      (single choke point for all CMS uploads): canvas/createImageBitmap →
      WebP, max 1920px, q≈0.8, + `cacheControl: "31536000"` on upload.
- [ ] **(B) One-time migration script** (`scripts/optimize-storage-images.mjs`,
      sharp + service key): re-encode existing `site-media` / `gallery`
      objects to WebP ≤1920px, re-upload with 1-year cacheControl.
- [ ] **(A) Re-enable Next image optimizer for the website app only** (drop
      `unoptimized: true` in `apps/website/next.config.ts`; keep it in
      cms/erp which are auth-gated, low-traffic). Config already minimizes
      transformation count: webp-only, single quality, 31-day cache TTL,
      12 size buckets.

### Quick wins (no decision needed)
- [ ] Resize `apps/website/public/images/logo.png` (709×714, 264KB) to ~120px
      (~10KB) — rendered at 40×40 in Navbar.
- [ ] Add `<link rel="preconnect">` to the Supabase origin in
      `apps/website/src/app/layout.tsx` (-300ms mobile LCP).
- [ ] `cacheControl` on uploads (covered in B) — fixes "efficient cache
      lifetimes" (current TTL 3600s on all storage images).

### Accessibility 92 → 100 (both form factors, same 2 audits)
- [ ] **color-contrast:** gold-600 `#B8941F` text on white/cream = 2.88:1
      (needs 4.5:1). Add `--color-gold-700: #8A6D12` (4.9:1 white, 4.75:1
      cream-50, 4.5:1 cream-100) and switch text usages:
      `SectionHeading` eyebrow label, `LatestUpdates` date badge,
      `NewsAchievements` alumni badge, plus same-pattern eyebrows in
      for-parents / transfer-certificates / contact / alumni / LeadershipGrid.
      (Icon-only gold-600 usages are fine — graphics need only 3:1.)
- [ ] **target-size:** testimonial indicator dots are 10×10px buttons —
      give the button a 24×24 hit area (`flex h-6 w-6 items-center
      justify-center`), dot stays 10px visually.

### Noted, not actioned
- Redirect `nkpublicschool.com → www` costs ~900ms in the mobile lab run.
  Inherent to apex→canonical redirect; real users following site links never
  pay it. No code fix.
- Render-blocking CSS 387ms / unused JS 171KB — normal Next.js overhead,
  low ROI.
- Hero heading animates from opacity 0 — doesn't hurt LCP (image is the LCP
  element); leaving as-is.

## Expected outcome
- B alone: mobile ≈ 80s, desktop ≈ 90s.
- A + B (recommended): mobile ≈ 85–92, desktop ≈ 95+, a11y 100/100.

## Review — implemented 2026-06-12

All changes are in the `website` app (+ shared upload path). Typecheck + build
pass clean (0 errors/warnings, 29 pages). Verified on a local production build
(`next start`) with Lighthouse.

### Local prod-build scores (before → after)
| | Performance | Accessibility |
|---|---|---|
| Desktop | 79 → **92–99** | 92 → **100** |
| Mobile | 63 → **76** | 92 → **100** |

Mobile metrics: FCP 2.4s→1.2s, LCP 14.4s→7.2s, Speed Index 10.2s→1.9s, CLS 0.
`modern-image-formats` now passes (optimizer active, serving WebP + srcset).

### What shipped
- **A** — removed `unoptimized:true` from `apps/website/next.config.ts` only.
- **B (upload)** — `packages/shared/src/lib/image-compress.ts` + wired into
  `upload.ts`: raster uploads downscale to ≤1920px, re-encode to WebP, store with
  1-year cache-control. Added `webp` to erp `staff-photos` allowlist.
- **B (backfill)** — `scripts/optimize-storage-images.mjs`. Dry run:
  **189 objects, 103 MB → 30 MB (−71%)**. NOT yet applied (production mutation).
- a11y: `--color-gold-700 #8A6D12` for AA text; switched eyebrow/badge/date/
  designation labels; footer disclosure link gray-500→gray-400; testimonial
  dots given 24px hit targets.
- quick wins: Supabase `preconnect` in layout; logo.png 264KB→17KB.

### Action items for the user (outside the code)
1. **Run the backfill** to optimize the 189 existing images (the single biggest
   real-world LCP win — the current hero/section originals are still full-size):
   `node --env-file=.env.local scripts/optimize-storage-images.mjs --apply`
2. Deploy. Localhost LCP (7.2s) is pessimistic — it pays a cold optimizer fetch
   per image; Vercel's CDN caches the optimized result after first hit.
3. (Optional) The apex→www redirect costs ~900ms in the lab run. If the canonical
   is `www`, consider serving the apex 308 at the edge/DNS so it's a single hop.
