# Website: Admissions-first hero, nav & CTA cleanup

Goal: make the public homepage lead with admission conversion (not staff login),
simplify the navbar, and remove ERP/CMS jargon for prospective parents.

Decisions (proposed by an audit agent and built without prior approval; the user
RETROACTIVELY accepted keeping this work on 2026-05-29): navbar → 6 primary +
"More" dropdown; login label → "Login". The original "confirmed with user"
wording was inaccurate — there was no pre-confirmation.

## Tasks

- [x] 1. `constants.ts` — split `NAV_LINKS` into primary 6 + add `NAV_MORE_LINKS` (3)
- [x] 2. `Navbar.tsx` — desktop: 6 primary pills + "More" dropdown (Student Life, Gallery, Articles); rename "ERP Login" → "Login"
- [x] 3. `Navbar.tsx` — mobile menu: list all 9 links; rename ERP button → "Login"
- [x] 4. `Footer.tsx` — add Student Life + Articles to Resources so moved links stay discoverable
- [x] 5. `QuickLinks.tsx` — featured "Admissions Open 2026-27", "Student & Parent Login", "Academic Calendar"; remove public CMS login; new heading
- [x] 6. `HeroSlider.tsx` — persistent "Admissions Open 2026-27 →" pill above headline (links /admissions)
- [x] 7. Verify: website typecheck (`tsc --noEmit`) clean + `pnpm --filter @nkps/website build` passes (28 routes)

## Review

Shipped the admissions-first homepage cleanup:
- **Navbar**: 6 primary pills (Home, About, Academics, Admissions, Facilities, Contact) + a
  "More" dropdown (Student Life, Gallery, Articles) with outside-click + route-change close.
  "ERP Login" → "Login" (desktop pill + mobile). Mobile menu inlines all 9 links.
- **QuickLinks**: removed the public CMS-login card (also a small security win); featured card is
  now "Admissions Open 2026-27" → /admissions; "ERP Login" → "Student & Parent Login"; heading
  "Access Your Portal" → "Get Started at NKPS".
- **Hero**: persistent pulsing "Admissions Open 2026-27 →" pill above the headline, on every
  CMS-driven slide, linking to /admissions.
- **Footer**: Resources now surfaces Student Life + Articles (the links moved out of top nav) so
  nothing is orphaned; Gallery/Contact/Transfer Certificates/For Parents retained.

No DB/migration changes. Hero slider content stays CMS-driven; the pill is additive.
Not done (future quick wins from the audit): admissions enquiry funnel, GA4/GSC verification.
