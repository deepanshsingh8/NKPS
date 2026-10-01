# Application Hardening + Email Activation — 2026-10

Audit inputs: Supabase security advisors (both projects, 2026-10-01), a full
read of all 172 API routes, and the email/auth flow map. Predecessor:
`tasks/security-hardening.md` (its operator follow-ups are still open — see P0).

## P0 — Live exposure (production DB / dashboard; needs explicit go-ahead)

- [x] **Murlipura (`dcdvxhdxodflkpmhhqoj`) is missing migration 127.** Verified
      live: anon can SELECT + UPDATE/INSERT/DELETE through
      `teachers_needing_review` (→ `teachers`) and `public_staff_directory`
      (→ `staff_members`), and read every user's name/email via
      `profile_link_health`. Diff Murlipura's schema against
      `supabase-schema.sql`, apply 127 and anything else missing (128–131?)
      in order.
      *Done 2026-10-01:* marker diff showed 127–130 missing (114 present,
      131 present out of order). Applied 127 (minus the DROP of
      `idx_student_enrollments_stream_id` — its duplicate doesn't exist on
      Murlipura), 128, 129, 130. Re-verified: no anon read/write on the views.
- [x] **Main (`duwvcanuntblisqyftnh`): drop the 20 "Give users authenticated
      access to folder …" storage policies** (dashboard templates). Any
      signed-in student/parent can upload/list/delete under `private/` in
      site-media, gallery, disclosure-documents, staff-photos, avatars.
      Murlipura doesn't have them. *Done 2026-10-01; 4 intended policies remain.*
- [ ] Check both projects for `e2e_admin@nkps.test` (password is in git at
      `scripts/_e2e-test.mjs:1112`); delete if present. **Owner** — reading
      auth.users on production was blocked for the agent.
- [x] Make the e2e script delete its user on exit and refuse to run against a
      non-local URL (`claude/deps-ci-dblint`).
- [ ] Dashboard, both projects: enable leaked-password protection; disable
      public email signups; min password length 8; review Auth rate limits.

## P1 — Email activation (mostly config — the code already exists)

The mailer is Resend (`packages/shared/src/lib/email.ts`). Welcome mail goes
out on every account-creation path; forgot-password uses `generateLink` →
`/auth/confirm` → `/portal/reset-password`. Supabase's own mailer is unused.

- [ ] Verify the sending domain in Resend (DNS in Cloudflare — checklist in
      `tasks/domain-handover.md` §4, all boxes still unchecked).
- [ ] Set `RESEND_API_KEY`, `FROM_EMAIL`, `REPLY_TO_EMAIL` on Vercel:
      nkps-erp, nkps (website contact form), and the three murlipura projects.
      Redeploy.
- [ ] (Recommended) Point Supabase Auth custom SMTP at Resend too, so any
      future Supabase-sent mail isn't capped by the default sender.
- [x] Code: welcome email sends a one-time "set your password" link
      (`generateLink({type:"recovery"})` → existing `/auth/confirm`) instead
      of a plaintext temp password. *(decision pending)*
- [x] Code: `createPortalUser` returns `emailDelivered`; staff/bulk/parent
      invite/portal bulk-create UIs stop claiming "email sent" when it wasn't.
- [x] Code: forgot-password returns 200 even when the send fails (no account
      enumeration); log the failure.
- [x] Docs: fix MODULES.md (says Gmail/nodemailer), drop `GMAIL_*` from
      turbo.json, remove unused `nodemailer` dep, un-ignore `.env.example`.

## P2 — Code hardening

- [x] H1 CSP: nonce-based `script-src` (proxy-generated) for erp + cms; drop
      `'unsafe-inline'`. Website: evaluate (nonces force dynamic rendering).
- [x] H2 Rate limiting: back `rate-limit.ts` with the existing Postgres
      `bump_rate_limit()` instead of per-instance memory; pin
      `TRUSTED_IP_HEADER` for Vercel.
- [x] H2/M7 Bot protection: Cloudflare Turnstile on login (Supabase native
      captcha), forgot-password, register, contact, TC lookup, chat.
- [x] H4 Deps: replace `xlsx@0.18.5` (CVE-2023-30533, CVE-2024-22363; parses
      uploads) with SheetJS 0.20.x from cdn.sheetjs.com; add Dependabot +
      `pnpm audit --prod` in CI; `permissions: contents: read`.
- [x] M1 CSRF: one Origin/`Sec-Fetch-Site` check for non-GET `/api/*` in the
      proxy (exempt the WhatsApp + Exotel webhooks) — covers the ~22
      cookie-authed write routes in one place.
- [x] M3 Errors: shared `dbError()` helper; replace ~65 raw `error.message`
      returns.
- [x] M4 Audit log: `audit_log` table; write from admin proxy, users,
      editor-permissions, reset-password.
- [x] M5 Password policy: shared min length 8 constant (3 sites at 6).
- [x] M6 CMS proxy: role gate + `must_change_password`.
- [x] M2 Uploads: size cap on `ptm-notes/import`; magic-byte check on
      transport change-request.
- [x] L: `poweredByHeader: false`, COOP; `server-only` in
      `supabase/admin.ts`; cap chat message/history size.
- [x] DB lint (migration 133 — 132 went to the rate limiter): `SET search_path` on 27 functions; revoke
      anon EXECUTE on `get_my_*`/`has_editor_*`; revoke authenticated SELECT
      on the two timetable diagnostic views.

## Branches (one owner per file area; migration numbers reserved)
| Branch | Covers | Migration |
|---|---|---|
| `claude/email-set-password-links` | P1 code + docs, password min 8 | — |
| `claude/edge-hardening` | H1 CSP nonces, M1 CSRF, headers, M6 CMS gate, `server-only` | — |
| `claude/rate-limit-turnstile` | H2 durable limiter, M7 Turnstile, chat caps | 132 |
| `claude/deps-ci-dblint` | H4 xlsx + CI, M2 uploads, e2e script, DB lint | 133 |
| `claude/errors-audit-log` (after email lands) | M3 `dbError()`, M4 audit_log | 134 |

Migrations 132–134 must be applied to **both** production DBs after merge.

## Follow-ups found during implementation
- [ ] ~119 RLS policies have no `TO` clause, so they apply to anon and call
      `get_user_role()` / `get_my_*()` / `has_editor_capability()`. Scope them
      `TO authenticated` (new migration), then revoke anon EXECUTE on those
      helpers — 133 could only do it for `has_editor_feature`.
- [ ] `sharp` 0.34 → 0.35 (2 high advisories; outside semver range).
- [ ] `@anthropic-ai/sdk` 0.82 → 0.91 (moderate).
- [ ] Pin GitHub Actions to commit SHAs.
- [ ] HSTS `preload` — owner decision (hard to undo).
- [ ] Migration 133 ships with a new `/api/timetable/clashes` route: deploy
      the code BEFORE applying 133, or Clash Check shows "Failed to load".

## Verification
- [x] typecheck / lint / build / check:* pass
- [ ] Supabase advisors re-run clean of ERROR-level on both projects
- [x] Browser pass: login, forgot→reset, create user, CSP console clean

## Review (2026-10-01)

**Live DB (done):** Murlipura brought level with main (127–130); 20 template
storage policies dropped on main. Both re-verified by query.

**Code (5 stacked branches, each verified: typecheck, lint 0 errors, all
check:* — plus a full 3-app production build and a browser pass of the
integrated top of stack):**

- Login page under the new CSP: nonce + `strict-dynamic`, no script
  `'unsafe-inline'`, 19/19 scripts carry the nonce, zero console errors,
  `X-Powered-By` gone, COOP set.
- `/auth/confirm` shows a Continue page and spends the token only on POST;
  a bad token lands on reset-password with a fixed, friendly message.
- CSRF: cross-origin POST → 403 `Cross-origin request blocked`; same-origin
  reaches route auth (401) / forgot-password (200); webhooks exempt (Exotel's
  own token check still 403s an unsigned call, as it should).

**Deploy order (matters):**
1. Merge the PRs in stack order.
2. Apply migrations **132 → 133 → 134 to both DBs**, *after* the deploy
   (133 needs `/api/timetable/clashes` live first).
3. Resend domains + env → email starts flowing.
4. Turnstile keys in Vercel → redeploy → *then* enable Supabase CAPTCHA.
