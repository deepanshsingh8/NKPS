# Security Hardening — Audit Remediation

## Batch 1 — SQL migration (highest impact)
- [x] C1: Lock `profiles` privileged columns (REVOKE/GRANT + guard trigger)
- [x] H1: `handle_new_user` must not trust client-asserted role
- [x] H2: Storage write policies → service-role only; `avatars` per-user; TC bucket private (SQL + doc)
- [x] Mirror migration into supabase-schema.sql (migration-061 + schema)

## Batch 2 — Code fixes
- [x] M1: forgot-password — drop attacker-controlled `Origin`
- [x] M2: escape HTML in all email templates
- [x] M3: add CSP header (3 apps) + JSON-LD `</script>`-safe
- [x] H3: drop SVG + storage-layer MIME/size enforcement (migration 061)
- [x] L1: upload-url — correct featureKey + rate limit
- [x] L3: open redirect — validate `next` param
- [x] L4: delete paths — derive object key from DB row, harden extractStoragePath
- [x] L5: avatar — add must_change_password gate
- [x] M4: rate-limit — trusted client IP

## Verification
- [x] typecheck / build / lint pass (turbo, all 3 apps; 0 lint errors)

## Operator follow-up (cannot be done in code)
- [ ] In Supabase Dashboard → Storage → Policies: DELETE the old permissive
      "Allow authenticated users" INSERT/UPDATE/DELETE policies on the content
      buckets, else migration-061's restrictive policies are bypassed (RLS is
      OR-combined). Confirm `transfer-certificates` bucket shows Private.
- [ ] Supabase → Auth → Providers: disable public email signups (defense for H1).
- [ ] Set `TRUSTED_IP_HEADER` env to the platform's trusted client-IP header.
- [ ] After deploy, watch browser console for CSP violations; tighten/extend.
