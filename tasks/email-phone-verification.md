# Enforce real Email + Phone on enquiry / contact forms

**Goal:** Stop fake email IDs and phone numbers. Today we only do *format*
validation (valid-looking email, 10-digit Indian mobile) on client + server.
That blocks typos/garbage but NOT fake-but-valid entries (e.g.
`abc@gmail.com`, `9999999999`). To truly enforce correctness we must *verify
ownership*.

**Entry points to cover (both post to `/api/contact` → `contact_submissions`):**
- `apps/website/src/app/contact/ContactPageClient.tsx` (Contact page form)
- `apps/website/src/components/admissions/AdmissionsEnquiryModal.tsx` (Admissions pop-up)

---

## Decision needed first (cost trade-off)
The user is cost-averse (Razorpay deferred over fees — see memory). OTP SMS has a
recurring per-message cost. Pick the layer(s):

- [ ] **Layer 1 — Free hardening (no per-msg cost), do regardless**
  - [ ] Email: reject disposable/temp-mail domains (maintain a blocklist)
  - [ ] Email: DNS **MX-record check** on the domain (server-side) — ensures the
        domain can actually receive mail; rejects `@gmial.com` etc.
  - [ ] Phone: keep strict 10-digit Indian mobile; reject obvious fakes
        (all-same-digit `0000000000`/`9999999999`, sequential `1234567890`)
  - [ ] Tighten the email regex (current is basic `z.string().email()`)
- [ ] **Layer 2 — OTP ownership verification (strong, has cost) — needs sign-off**
  - [ ] Choose phone OTP provider (India-friendly: MSG91 / Fast2SMS / Twilio) + budget
  - [ ] Choose email verification: email OTP code **or** confirmation link
  - [ ] Confirm we want OTP on BOTH channels, or phone-only / email-only

---

## Implementation tasks (Layer 2 — OTP), once approved
- [ ] DB: `otp_challenges` table (id, channel `email|phone`, destination,
      code_hash, expires_at, attempts, max_attempts, verified_at, ip, created_at)
      + migration + mirror into `supabase-schema.sql`
- [ ] `POST /api/otp/send` — generate 6-digit code, hash + store, dispatch via
      provider; rate-limit per IP **and** per destination; resend cooldown (30–60s)
- [ ] `POST /api/otp/verify` — check code (constant-time), enforce expiry +
      max attempts; on success issue a short-lived signed verification token
- [ ] Provider integration + env vars (`SMS_PROVIDER_KEY`, sender id, email
      OTP via existing nodemailer) + CSP/origin allowlist if needed
- [ ] `/api/contact`: require valid phone + email verification tokens; reject
      submit if missing/expired (server is the source of truth)
- [ ] UI (both forms): two-step flow — enter phone/email → "Send OTP" → enter
      code → verified ✓ badge → enable Submit; resend + change-number affordance
- [ ] Anti-abuse: global + per-destination rate limits, attempt caps, expiry,
      lock after N failures
- [ ] Accessibility + UX: autofocus OTP input, paste support, clear error states
- [ ] Verify: typecheck + lint + manual E2E (send/verify/expire/resend/wrong-code)

## Notes
- Layer 1 alone meaningfully reduces junk at zero recurring cost; Layer 2 is the
  only way to *guarantee* the contact details are real/reachable.
- Keep both the Contact form and the Admissions modal in lockstep (shared OTP
  component) so enforcement can't be bypassed via one entry point.
