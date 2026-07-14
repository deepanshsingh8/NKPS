# Click-to-Call with Number Masking (Exotel)

Let teachers/admins call a student's parent/guardian from the ERP with one click.
Both parties are bridged through Exotel so **neither sees the other's real number** —
the parent sees a fixed school ExoPhone, and (phase 2) that number is branded
**"NK Public School"** via Truecaller Business.

Provider: **Exotel** · Caller-ID name display: **required (phase 2)** · Approach decided.

---

## How it works (the bridge, no browser dialing)

1. Teacher clicks **Call** next to a contact on the students page.
2. Browser → `POST /api/telephony/call` (Bearer token, auto-attached by `adminFetch`).
3. Server resolves the caller's own phone (agent leg) + the target parent number,
   then calls **Exotel Connect-two-numbers** API server-side.
4. Exotel rings the **teacher first**; on pickup it dials the **parent** and bridges.
5. Parent's phone shows the **school ExoPhone** (masked). Teacher never sees the
   parent's raw number either.
6. Exotel POSTs a **status callback** to our webhook → we update the call log.

Everything Exotel-facing is **server-side**, so the API secret never reaches the
browser and **no CSP change is needed**.

---

## Key facts pinned from the codebase

- **App:** `apps/erp` (the ERP). Monorepo: pnpm + turbo, shared code in `@nkps/shared`.
- **Numbers live on `students`:** `phone` (student), `father_mobile`, `mother_mobile`,
  `guardian_mobile` — already returned by `/api/students` and rendered on the students page.
  Alternate normalized source: `parents.phone` / `parents.alternate_phone`.
- **Auth gate:** `verifyAdminOrEditorWithUser("students")` from
  `packages/shared/src/lib/verify-admin.ts` (fails closed; returns service-role client + user).
- **Feature catalog:** `packages/shared/src/lib/permissions.ts` (`FeatureKey` union + `FEATURE_CATALOG`).
- **Client fetch helper:** `adminFetch()` in `packages/shared/src/lib/admin-api.ts` (sets Bearer).
- **UI home:** `apps/erp/src/app/(admin)/people/students/page.tsx` (student table + detail/edit).
- **CSP:** `apps/erp/next.config.ts` (`CSP` const). Server-side calls → untouched.
- **Env:** documented in root `.env.example`; secrets read via `process.env.X!` server-side, never `NEXT_PUBLIC_`.
- **Next migration number: `073`** (highest is erp `072`). New migrations must ALSO be
  appended to `supabase-schema.sql` in the same change.

---

## Open decision to confirm before coding

**Where does the teacher's own phone number (the agent leg) come from?**
Exotel's connect-two-numbers rings the agent first, so we need a number to ring.
Options (pick one — I recommend A):

- **A. Per-user "my calling number" setting** (recommended): store on the caller's
  `profiles`/staff record; prompt once if missing, reuse thereafter. Cleanest, no per-call typing.
- **B. Confirm-per-call:** a small field in the Call dialog defaulting to their saved number.
- **C. Fixed hunting group / IVR:** Exotel rings a school desk phone instead of the individual.

There is currently **no phone column on the staff/profile record for the caller**, so A/B
need a tiny migration (`caller_phone` on `profiles` or a `staff.phone` field) + a settings input.

---

## Implementation checklist

### Phase 0 — Exotel account (YOU-side, blocks live calls, not code)
- [ ] Create Exotel account, complete KYC.
- [ ] Provision an **ExoPhone** (virtual number) → this is the masked caller ID parents see.
- [ ] Enable **Connect / Click-to-Call** + **call masking**; note SID, API key, API token, subdomain.
- [ ] (Recording, optional) enable + plan a consent disclosure.

### Phase 1 — Backend: place the call  ✅ DONE
- [x] Env vars documented in `.env.example` (`EXOTEL_SID/API_KEY/API_TOKEN/CALLER_ID/SUBDOMAIN/CALLBACK_TOKEN`).
      **Real values still to be added to `.env.local`** once the Exotel account exists (Phase 0).
- [x] `packages/shared/src/lib/telephony/exotel.ts` — `connectCall()` (Basic-auth POST to
      Exotel connect.json), `normalizeIndianMobile()`, `isTelephonyConfigured()`, `mapExotelStatus()`.
      Server-only; no secrets in client bundles.
- [x] `apps/erp/src/app/api/telephony/call/route.ts` — `POST`, gated by
      `verifyAdminOrEditorWithUser("students")`. Body `{ studentId, contact }`; number
      resolved server-side; caller leg from `profiles.phone`. Inserts `call_logs`, dials
      Exotel, patches `exotel_sid`. Returns `{ ok, callId }` (no raw numbers).
- [x] **Rate-limit:** ≤5 calls/actor/60s → 429.
- [x] **Decision A implemented:** caller number lives on existing `profiles.phone` (no new
      column needed). `api/telephony/my-number` GET/PATCH lets a caller set their own number.

### Phase 2 — DB: call log + audit  ✅ DONE
- [x] `scripts/migrations/erp/migration-073-telephony-call-logs.sql`:
      `call_logs(id, actor_id, student_id, contact_type, exotel_sid, status,
      duration_seconds, recording_url, created_at, updated_at)`. Admin-only RLS; editors
      write through the service-role API. **No raw numbers stored** — `contact_type` only.
      (No `caller_phone` column — decision A reuses `profiles.phone`.)
- [x] Mirrored the DDL into `supabase-schema.sql`.
- [ ] **Run the migration** against Supabase (you-side / deploy step).

### Phase 3 — Webhook: status callbacks  ✅ DONE
- [x] `apps/erp/src/app/api/telephony/exotel-callback/route.ts` — public, verifies
      `EXOTEL_CALLBACK_TOKEN` in the query, updates `call_logs` by `exotel_sid` with final
      status/duration/recording. Always 200s so Exotel doesn't retry-loop on our bugs.

### Phase 4 — Frontend: the button  ✅ DONE
- [x] `apps/erp/src/components/StudentCallActions.tsx` — a **Call <name>** button per present
      number, rendered in the student detail dialog. Labels resolve to name/relation, never
      the raw number/UUID. If the caller has no number on file, an inline form captures it
      (via `my-number`) and retries the call.
- [x] Buttons only appear for numbers that exist; empty → "No phone numbers on file to call."

### Phase 5 — Caller-ID **name** display (required) — Truecaller Business
- [ ] Subscribe the ExoPhone to **Truecaller for Business** (verified business caller ID)
      so parents see **"NK Public School"**, not just the number. This is a separate
      paid add-on layered on the ExoPhone; masking works without it, the *name* needs it.
- [ ] Verify branding shows on a real device before calling it done.

### Phase 6 — Compliance & polish
- [ ] TRAI/DND + call-recording consent: add a short disclosure if recording is on.
- [ ] Optional: surface a per-student **call history** from `call_logs` in the detail view.
- [ ] Decide whether to add a dedicated `FeatureKey "telephony"` for separate editor grants
      (default: reuse `"students"`).

---

## Verification plan
- [x] `pnpm --filter @nkps/erp typecheck` + `lint` clean (0 errors; only pre-existing warnings).
- [x] Number resolved server-side from `contact` type; client never sends a raw number.
- [x] No raw number or UUID in any UI label or API response (labels are name/relation only).
- [ ] Live smoke (BLOCKED on Phase 0 Exotel account): click Call → own phone rings → pick
      up → target rings → parent sees ExoPhone; webhook updates `call_logs`.
- [ ] After creds exist: verify 401 (no auth), 400 (blank number), 429 (rate limit), webhook
      token rejection.

## Cost note (ongoing OpEx, not one-time)
Per-minute call charges + monthly ExoPhone rental + Truecaller Business subscription.
Rate-limiting (Phase 1) matters because every click is billable.
