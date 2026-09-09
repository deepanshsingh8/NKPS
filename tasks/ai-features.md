# AI features + WhatsApp — implementation log

Branch: `feat/ai-assistant` (off `saas-hardening-2026-09`).
Full plan: `~/.claude/plans/let-us-start-building-cached-tiger.md`.

**Migration numbering.** This work owns a reserved block:

| File | Purpose |
|---|---|
| `base/migration-110-school-profile.sql` | school identity + AI settings |
| `erp/migration-111-export-events-source.sql` | `export_events.source` + `ai_run_id` |
| `erp/migration-112-ai-audit.sql` | `ai_conversations` / `ai_messages` / `ai_tool_calls` / `ai_query_runs` |
| *(113 reserved)* | Phase 3 WhatsApp tables |

Originally 096/097/098. Sequential numbering failed: 098 landed on main as
`cms/migration-098-restrict-staff-pii.sql`, then 099, 100 and 101 were each claimed by a
parallel branch mid-session — twice onto a number this work had already taken. The block
terminates that race. Still check before adding a file:
`ls scripts/migrations/*/ | grep -oE 'migration-[0-9]+' | sort | uniq -d`

---

## Phase 0 — Foundations (no AI; each item independently valuable)

- [x] 1. `verifyPortalUser()` → `packages/shared/src/lib/verify-portal.ts`
      Bearer-only, service-role client, `null` on failure, fails closed on `must_change_password`.
      Returns `{admin, user, role:"parent"|"student", parentId, studentId, studentIds}`.
- [x] 2. Retire the hand-rolled parent auth in
      `apps/erp/src/app/api/portal/transport/change-request/route.ts:15-38`
- [x] 3. `partitionFieldKeys()` + `describeFieldCatalog()` in
      `packages/shared/src/lib/report-fields.ts` (do NOT change `resolveFields()`)
- [x] 4. Unified PII key set (union of `report-fields.ts SENSITIVE_KEYS` and
      `export-handler.ts SENSITIVE_FIELDS` — they disagree on membership AND on the
      `aadhar_`/`aadhaar_` spelling)
- [x] 5. `/reports/ask` → `PATH_FEATURE_OVERRIDES` mapped to the existing `reports` key
      (fail-open hazard: an unmapped admin path is open to every editor)
- [x] 6. migration-110: `school_profile` + seed from `constants.ts`; `getSchoolProfile()`
- [x] 7. migration-111: `export_events.source` + `ai_run_id`; export `logExport()` from
      `apps/erp/src/lib/export-handler.ts`
- [x] 8. `apps/erp/src/lib/ai/client.ts` — the only file allowed to import `@anthropic-ai/sdk`.
      `isAiConfigured()`, `AI_NOT_CONFIGURED`, mirroring `telephony/exotel.ts`.
      Declare the SDK in the package.json that uses it (currently root-only, reached by hoisting).
- [x] 9. `computeAttendanceSummary()` extracted to shared, using the `report-card.ts`
      definition (academic-year window, credited = present + late + half_day)

**Not needed:** `student_parents(parent_id)` index already exists (`idx_student_parents_parent_id`,
schema L701) — dropped from the migration list.

## Phase 1 — Ask-your-school

- [x] 10. migration-112 (was 098 → 100 → 101; see numbering note above): `ai_conversations`, `ai_messages`, `ai_tool_calls`, `ai_query_runs`
      (RLS enabled, zero policies, with an explicit "intentional — service-role only" comment)
- [x] 11. `caller-context.ts` — `CallerContext`, `RowScope`, `ScopedFilters` brand, `applyScope`,
      `enforceScopeOnRows`, `scopeHash`
- [x] 12. `audit.ts`, `tool-errors.ts`, `field-policy.ts`, `runner.ts`
- [x] 13. `tools/lookups.ts` + `tools/report.ts`
- [x] 14. `/api/ai/ask` (+ `[run_id]/table`, `[run_id]/export`)
- [x] 15. `/reports/ask` page

## Phase 2 — Remarks

- [x] 16. `ai/remarks.ts` — evidence gather + one structured-output call per class
- [x] 17. `/api/ai/remarks/draft` (teacher, `class_teacher_id` scope ONLY — narrower than
      `get_my_class_ids()`, which also includes `class_subjects.teacher_id`)
- [x] 18. "Draft remarks" button in `apps/erp/src/app/teacher/results/page.tsx`

## Phase 3 — WhatsApp

- [ ] 19. Meta Business verification + WABA (not code — start day 1)
- [ ] 20. migration-113: `parent_phone_links`, `whatsapp_sessions`, `whatsapp_messages`,
      `ai_rate_limits`
- [ ] 21. `packages/shared/src/lib/messaging/whatsapp.ts` (mirrors `telephony/exotel.ts`)
- [ ] 22. `/api/webhooks/whatsapp` — HMAC verify, phone→parent resolution, OTP enrolment
- [ ] 23. `tools/parent.ts` — the seven narrow read-only tools
- [ ] 24. DB-backed rate limiter (in-memory `rateLimit()` is useless on a public ingress)

## Phase 4 — Sales one-pager

- [x] 25. Web page + print stylesheet, published as an Artifact
      → https://claude.ai/code/artifact/78cf1447-19c2-4890-8aca-31396ae769ff
      Source: scratchpad `nkps-erp-onepager.html`. Status column is deliberate — three of the
      four AI capabilities are **In build**, only the website assistant is Live. Sales must not
      quote "In build" rows as shipped.

---

## Blocked / waiting

- **Parent fee balance bug** (separate session): `/parent/fees` reads `bus_stop_fees` with the
  anon client against a table whose RLS denies everything → transport families see an
  understated balance. **The WhatsApp assistant must not quote fee balances until this lands.**

## Review

### Phase 0 — done 2026-09-09

`pnpm typecheck` clean, `pnpm lint` 0 errors (warnings all pre-existing, none in new
files), `turbo run build` green across website/cms/erp.

**New files**
- `packages/shared/src/lib/verify-portal.ts` — `verifyPortalUser()`
- `packages/shared/src/lib/pii-fields.ts` — one home for both PII vocabularies
- `packages/shared/src/lib/school-profile.ts` — `getSchoolProfile()`
- `packages/shared/src/lib/attendance-summary.ts` — `computeAttendanceSummary()`
- `apps/erp/src/lib/ai/client.ts` — the only ERP file importing `@anthropic-ai/sdk`
- `scripts/migrations/base/migration-096-school-profile.sql`
- `scripts/migrations/erp/migration-097-export-events-source.sql`

**Modified** — `report-fields.ts` (+`partitionFieldKeys`, `describeFieldCatalog`; sensitive
set now imported), `export-handler.ts` (sensitive set imported), `permissions.ts`
(`/reports/ask` override), `portal/transport/change-request/route.ts` (24 lines of auth → 5),
`apps/erp/package.json` (SDK declared), `supabase-schema.sql` (mirrors both migrations).

### Decisions worth remembering

1. **`/reports/ask` reuses the `reports` feature key** rather than getting an `ai_assistant`
   key. A new key would be a second, wider door onto the student master wearing a different
   name. The AI is a front door onto existing data, not a new permission domain.

2. **The two PII sets are reproduced, not merged.** They disagree on contact numbers — the
   report builder does NOT withhold `phone`/`father_mobile`/`mother_mobile` from non-admins
   while the generic exports do, so an editor with the `reports` grant can currently export
   every parent's mobile through the report builder. Merging them would change behaviour for
   existing users; that is its own change. The AI path uses the union (`AI_SENSITIVE_KEYS`).
   Also: `aadhaar_number` (double-a) in export-handler matches no real column — the column is
   `aadhar_number`. Kept as harmless defensive spelling.

3. **Attendance: FIVE definitions exist, not four.** `report-card.ts` counts a half day as
   1.0, `report-query.ts` as 0.5. `computeAttendanceSummary()` defaults to 1.0 — matching the
   report card, because an assistant saying 82% when the card in the parent's hand says 84%
   is wrong whichever formula is nicer. `halfDayCredit: 0.5` matches the report builder.
   Existing call sites deliberately NOT migrated: each is a user-visible number change.

4. **The transport route's ownership check was left alone.** Only the auth preamble moved to
   `verifyPortalUser()`. Swapping the explicit `student_parents` lookup for
   `portal.studentIds` would additionally require a current-session enrollment — arguably
   more correct, but a behaviour change outside this refactor's scope. One deliberate
   difference: a wrong-role caller now gets 401 instead of 403, since `verifyPortalUser`
   collapses both cases (consistent with how `verify-admin` helpers are used everywhere else).

5. **`export_events.dataset` was NOT widened.** Added a `source` column instead. An
   AI-produced student sheet is still the student corpus; reclassifying it as `ai_query` would
   have made every existing per-dataset count silently wrong.

6. **`school_profile` is world-readable.** The public site and visitor assistant render from
   it, and every column is already published on the website or the CBSE disclosure page. The
   WhatsApp access token is deliberately absent — ids only, secret stays in the environment.

### Phase 1 — done 2026-09-09

`pnpm typecheck` clean · `pnpm lint` 0 errors, zero warnings in any new file · all three
apps build.

**New files** — `lib/ai/{caller-context,tool-errors,field-policy,audit,runner,rerun}.ts`,
`lib/ai/tools/{report,lookups}.ts`, `lib/ai/prompts/ask.ts`,
`api/ai/ask/route.ts` + `[run_id]/{table,export}/route.ts`,
`(admin)/reports/ask/page.tsx`, `migration-112-ai-audit.sql`.
**Modified** — `(admin)/reports/page.tsx` (entry card).

### Phase 1 decisions

1. **`ScopedFilters` is a branded type only `applyScope()` can mint**, and the AI call site
   is typed to require it. Deleting the scoping step is a compile error, not a data leak.

2. **`run_student_report` deliberately does NOT set `strict: true`.** strict needs every key
   in `required`, and ~30 filter keys carry zod defaults — forcing the model to emit all of
   them costs tokens and makes output worse (it invents values for slots it doesn't care
   about). Server-side `reportFiltersSchema.parse()` fills defaults and yields an error the
   model can act on. The lookup tools DO use strict, where every field is required.

3. **`session_id` is server-injected, not a tool.** It is a required uuid the model cannot
   know, so leaving it to the model guarantees a wasted first turn.

4. **The 135-field catalogue lives in the cached system prefix, not a tool.** Static per
   role, so a lookup tool would spend a round trip fetching a constant. One cache variant
   per role, never per user.

5. **`list_lookup_values` exists because wrong free-text returns zero rows silently.**
   `category`/`religion`/`gender`/`area_type`/`minority_group` are matched by equality, so
   "General" where the data says "GEN" reads exactly like a true negative. Zero-row results
   also carry diagnostic notes naming the culprit filters. Column names verified against
   `report-query.ts` — the filter key is `category`, NOT `social_category`.

6. **Manual agent loop, not the SDK tool runner.** Three things live inside the loop and
   none are optional: wall-clock + tool-call budgets, an audit row per tool call written
   before execution, and a retry cap keyed on whether the error is recoverable at all — so a
   scope violation cannot become a retry loop against the same wall.

7. **Downloads re-execute, they do not serve a cached blob.** `ai_query_runs` stores the
   scoped filters and a scope fingerprint; `/table` and `/export` re-authenticate, re-derive
   scope, and 403 if the fingerprint moved. Costs a second query and means the export states
   its own total — in exchange no 20k rows are held anywhere and access is re-checked at
   download time.

8. **`logExport()` was NOT exported after all.** The AI export writes `export_events` inline,
   matching what the report builder's own export route already does — `logExport` is
   module-private, derives IP/UA from a `Request` it owns, and constrains `dataset` to a
   union this path doesn't extend. `dataset` stays `'students'`; `source='ai'` carries the
   new axis. (Plan item 7 said export it; inline is the smaller change and matches precedent.)

9. **Client-supplied history is filtered to text-only turns.** Accepting client-supplied
   tool_result blocks would let the browser feed the model fabricated data.

### To apply the migrations

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/_apply-ai-feature-migrations.sql
psql "$DATABASE_URL" -f scripts/_verify-ai-feature-migrations.sql   # every row must say PASS
```

Or paste both into Supabase Studio's SQL editor, in that order. The apply bundle is
generated from the three migration files — edit those, not the bundle. It runs in one
transaction and is idempotent, so re-running is safe.

Two steps the SQL cannot do:
1. `ANTHROPIC_API_KEY` must be added to the **erp** Vercel project. It is currently set
   only on `website` (for the public chatbot), and `apps/erp` now declares the SDK itself.
2. The assistant ships **off**. Turn it on deliberately:
   `UPDATE school_profile SET ai_enabled = true;`
   `/api/ai/ask` returns 503 `AI_DISABLED` until then, and the fallback profile returns
   false — so an unreadable config fails closed.

### Verified against the live database — 2026-09-09

Migrations applied by the user; all five tables live, `export_events` extended,
`ai_enabled` correctly still false.

**AI path vs report builder — the acceptance test**

| Case | Builder | AI tool | |
|---|---|---|---|
| fees due | 942 | 942 | PASS |
| all active | 942 | 942 | PASS |
| attendance < 75% | 0 | 0 | **vacuous** — see below |

**End-to-end with a real model call.** *"How many students in each class still have fees
pending?"* → correct answer in 19.2s, 2 tool calls, `stopped_by=end_turn`. The class
breakdown sums to exactly 942, matching the builder. The model's **first** call used
`fee_status: "pending"`, got `invalid_filters`, and self-corrected to `"due"` — the designed
recovery path, and the audit captured both attempts. It also volunteered the real limitation
("the filter only offers due/clear, so this is everyone carrying any balance").

**Prompt caching confirmed working**: 2560 tokens written on the first call, then read from
cache on both subsequent calls. This was the plan's explicit cache assertion.

**Security paths** — all pass: rerun with matching scope OK; rerun after scope change → 403
`scope_changed`; unknown run id → 404; teacher asking outside their classes →
`scope_violation`; teacher asking for a mix → **intersected, not unioned**; teacher asking
for nothing → defaults to assigned classes, never "all"; parent/student-scoped caller refused
the report tool outright; scope hash order-independent; PII gate withheld
`aadhar_number` + `father_annual_income` with nothing leaked; hallucinated field keys
returned with usable suggestions (`fathers_name` → `father_name`); export wrote an
`export_events` row with `source='ai'`, `ai_run_id` set, and `dataset` still `'students'`.

**Caveats on the above, stated plainly:**
- The **attendance case proved nothing**. There are **zero attendance rows in the database,
  ever** — both paths returned 0 because there is no data, not because the logic agrees.
  Re-run once attendance is being marked.
- "Fees due = 942" equals the total active roster because **no fee payment has ever been
  recorded** (0 rows in `fee_payments`, 82 active fee structures). The number is correct but
  the filter is not discriminating between students yet.
- Not yet exercised through **HTTP** — these tests call the libraries directly, so the route
  handlers' auth gates (`verifyAdminOrEditorWithUser`, the rate limiter, the `AI_DISABLED`
  check) are typechecked but not run.
- The **page has not been opened in a browser**.

**Bug found and fixed during verification.** `ai_tool_calls` was empty while `ai_query_runs`
had rows: `CallerContext.conversationId` was typed `string` and the route passed
`conversationId ?? ""`, so when the audit row failed to open, the falsy-check in
`recordToolCall` silently skipped every tool-call log while query runs were still written —
a half-populated trail that reads as complete. Now `string | null`, so "audit unavailable"
is explicit.

### Phase 2 — done 2026-09-09

**New** — `lib/ai/remarks.ts`, `api/ai/remarks/draft/route.ts`.
**Modified** — `teacher/results/page.tsx` ("Draft remarks with AI" button + provenance chips).

**Decisions**
1. **No tools.** Nothing is unknown at request time — the UI already has the class and
   exam — so the server gathers evidence deterministically and makes ONE structured-output
   call for the whole class. 40 per-student calls would cost 40x for no benefit.
2. **`includeUnpublished: true` is hard-coded**, not an argument. A privacy gate a caller
   can flip is not a gate, and this must never become reachable from a parent surface.
3. **The narrow teacher rule.** The route requires `classes.class_teacher_id`, NOT
   `get_my_class_ids()` (= `class_teacher_id ∪ class_subjects.teacher_id`). A subject
   teacher may enter their own marks but has no business authoring the holistic report-card
   remark — and `POST /api/results/remarks` already enforces exactly this. Widening it here
   would let the AI path grant what the deterministic path refuses.
4. **Empty boxes only.** Drafts never overwrite a remark the teacher already wrote; those
   are counted and reported instead.
5. **`grounded_on` renders under each textarea** ("based on: Maths 41% · attendance 62%") and
   disappears the moment the teacher edits — once they touch it, it is theirs.
6. **Students with no evidence are skipped, not given a generic sentence.** A remark that
   could apply to any child is worse than a blank one, because it looks hand-written.

**Verified against the live database.** Evidence gathering found all 18 students in XI-A.
Every one had `overall: null`, zero subjects and zero attendance — so `draftClassRemarks`
refused with `no_evidence` (409): *"No marks or attendance have been recorded for XIA yet…
Enter the marks first, then draft."* **It never called the model**, so the empty case costs
nothing.

**Unverifiable until there is data.** There are zero `results` and zero `result_masters`
rows in the database, so the actual drafting path — the prompt, the grounding, the quality
of the sentences — has NOT been exercised. The plan's acceptance test (verify every factual
claim in three remarks against `computeFinalResult`) cannot run until marks are entered.
Neither can the class-teacher 403, which needs a teacher login.

### Open, for later
- Migrate the five attendance call sites onto `computeAttendanceSummary()`.
- Resolve the contact-number disagreement between the two PII sets.
- Migrate the remaining ~27 `constants.ts` consumers to `getSchoolProfile()` (saas-hardening).
