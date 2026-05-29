# Stress-test fixes — CRITICAL + HIGH

Branch: `stress-test-fixes`. Build/typecheck/lint were green before changes.

## CRITICAL
- [x] C1. Articles RLS: lock INSERT/UPDATE/DELETE to admin/staff (migration 060). CMS writes via service-role so no breakage.
- [x] C2. Contact-email stored XSS: HTML-escape user fields in `email.ts` `buildContactNotificationEmail` (+ rejected-email reason/name).
- [x] C3. Transport override bypass: require `override_reason` when coords are absent (server + client UI). `students/transport/route.ts` + `AdminFeesContent.tsx`.

## HIGH
- [x] H4. gallery_images RLS SELECT: restrict to standalone (null event) + public-event images (migration 060).
- [x] H5. Parent/student fee balance: count `waiver_amount` as paid + scope `fee_structures` to academic year + is_active.
- [x] H6. Refund receipt: REFUNDED banner + footer + "since refunded" label in FeeReceiptPDF.
- [x] H7. Historical results import: `ignoreDuplicates` (no batch_id overwrite / no clobber of finalized marks); per-cell over-max validation (no chunk abort); report skipped_existing + invalid_marks. (Fees importer already uses ON CONFLICT DO NOTHING + reports conflicts.)
- [x] H8. Fee change-request approve: added `refund_amount <= amount_paid` invariant. (Unbounded amount_paid is by-design F6 drift — left, noted.)

## Verify
- [x] Mirrored RLS migration into supabase-schema.sql.
- [x] V. typecheck + lint + build all green.

## Subagent-introduced work (surfaced to user; decisions 2026-05-29)
- Group B (KEEP, minus TC flip): `migration-061` profile role-escalation guard (real extra CRITICAL),
  storage write hardening, welcome-email escaping. TC bucket stays a MANUAL Studio toggle (flip line removed).
  Migration 061 still needs the manual dashboard step (delete old permissive storage policies) to be effective.
- Group C (KEEP): website admissions-first homepage/nav redesign (Navbar/Footer/HeroSlider/QuickLinks/constants).
- Open follow-ups from `tasks/security-hardening.md` Batch 2 (NOT done): forgot-password Origin, CSP headers,
  JSON-LD `</script>` escaping, SVG sanitize, upload-url featureKey/rate-limit, open-redirect `next` validation.

## Deferred / noted (not in CRITICAL+HIGH scope)
- Dry-run preview doesn't list invalid marks (commit path safely skips+reports them).
- Fees within-batch: two distinct payments sharing one source receipt# still collapse (inherent to receipt# dedup key).
- MEDIUM items from audit (report-card rounding mode, JSON-LD escaping, transport slab boundary/amount re-bill, geocode rate-limit) — separate pass.
