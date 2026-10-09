# WhatsApp messages to parents — bus notices and fee reminders

**Status:** in development, 2026-10-09.

## What the office asked for

1. A bus is running late. The transport in-charge opens Transport → Buses,
   clicks a button on that bus's row, types a message, and every parent of a
   student riding that bus gets it on WhatsApp.
2. A family owes fees. On the fee screens, one click sends that family a
   WhatsApp reminder carrying the amount outstanding.

## What already exists (and what this builds on)

- `packages/shared/src/lib/messaging/whatsapp.ts` — a server-only Meta Cloud
  API client (`sendTemplate`, `sendText`, webhook verification), built for the
  inbound parent assistant (migration 113). Nothing sends *outbound* yet except
  the assistant's replies.
- `whatsapp_messages` — the message log. Delivery receipts from Meta's webhook
  already update rows by `wa_message_id`, so anything logged here gets
  sent → delivered → read for free.
- `students.father_mobile / mother_mobile / guardian_mobile / phone`, and
  `students.sms_mobile_source` ("which of those columns receives messages").
  These are the reachable numbers. `parents.phone` is unusable (blank strings,
  see migration 113) and `parent_phone_links` has no writer.
- `student_enrollments.bus_id` + `has_transport` — who rides which bus.
- `apps/erp/src/lib/student-dues.ts` — server-side dues for one student,
  running the same `computeDuesBreakdown` the fee screens run.
- The click-to-call route (`api/telephony/call`) is the house pattern for an
  admin-to-parent provider action: server resolves the number, client never
  sees it, audit row before dispatch, `NOT_CONFIGURED` when secrets are absent.

## The one hard constraint: templates

WhatsApp only lets a business message a number that has *not* written to it in
the last 24 hours through a **Meta-approved template**. Parents have not
written to the school's number, so both features send templates. The free text
the office types travels as a template *parameter*. Meta forbids newlines,
tabs and runs of more than four spaces inside a parameter, so the text is
flattened before it goes out, and the in-app preview shows exactly what the
parent will receive.

The two templates (category **Utility**, language **English**) must be created
in Meta Business Manager with these exact names and bodies. The bodies live in
code too (`packages/shared/src/lib/messaging/templates.ts`) so the preview and
the approved text cannot drift.

**`nkps_bus_notice`**

```
Dear Parent, this is a message from {{1}} about school bus {{2}}.

{{3}}

For any help, please call the school office on {{4}}.
```

**`nkps_fee_reminder`**

```
Dear Parent, this is a gentle reminder from {{1}}. Fees of Rs. {{2}} are pending for {{3}} ({{4}}) for the session {{5}}.

{{6}}

For any queries, please call the school office on {{7}}.
```

`{{6}}` is the office's optional note; when blank it is filled with a fixed
sentence, because Meta rejects an empty parameter.

Until the templates are approved and the four `WHATSAPP_*` secrets are set,
the buttons still appear and the dialogs open, but Send is disabled with a
"not configured" notice — the same degradation as click-to-call.

## Design

### Data (migration 138, `erp/`)

- **`whatsapp_broadcasts`** — one row per send action: `kind`
  (`bus_notice` | `fee_reminder`), `actor_id`, `actor_role`, `bus_id`,
  `student_id`, `academic_year_id`, `template_name`, `body_text` (the text
  the office typed — school-authored, never parent data), recipient / sent /
  failed / skipped counts, `status`, timestamps. Service-role only (RLS on, no
  policies, commented as such).
- **`whatsapp_messages`** gains `broadcast_id`, `student_id`, `actor_id`
  (all nullable FKs, `ON DELETE SET NULL`). Still `phone_last4` only — the
  full number is never stored (call_logs precedent).

### Recipient resolution (server only)

`apps/erp/src/lib/messaging/recipients.ts` — one number per student:
`sms_mobile_source` if set and valid, else father → mother → guardian. The
student's own phone is used only when `sms_mobile_source = 'student'`.
Normalised with `normalizeIndianMobile` (E.164). For a bus, numbers are
de-duplicated so siblings produce one message. Students with no usable number
are listed back to the office by name so the data can be fixed.

### Who may send, and how much

- Bus notice: feature key **`transport`** (admins, and editors holding it).
- Fee reminder: feature key **`fees`**.
- Every send is billable, so: per bus at most **5 notices per hour**; per
  student at most **1 fee reminder per 24 hours** (both counted from
  `whatsapp_messages`, so a failed send does not consume the quota); per
  actor at most **30 send actions per hour** (DB limiter, `bump_rate_limit`,
  fails closed).

### Routes

- `GET  /api/messaging/whatsapp/bus-notice?busId=` → configured flag, bus,
  rider count, reachable count, students without a number, recent notices.
- `POST /api/messaging/whatsapp/bus-notice` `{ busId, message }` → sends.
- `GET  /api/messaging/whatsapp/fee-reminder?studentId=` → configured flag,
  student, which contact will be used (relation + last 4), dues breakdown,
  session, last reminder sent.
- `POST /api/messaging/whatsapp/fee-reminder` `{ studentId, note? }` → sends.

Each POST: gate → configured → rate limits → resolve recipients → insert
`whatsapp_broadcasts` → per recipient insert `whatsapp_messages` (queued) →
`sendTemplate` → update row sent/failed → finalise counts → `writeAuditLog`
(`whatsapp.bus_notice` / `whatsapp.fee_reminder`, ids and counts only).

### UI

- **Transport → Buses**: a message icon on each bus row opens
  *Message parents on this bus*: recipient summary, textarea (500 chars), live
  preview of the WhatsApp text, "Send to N parents". Shows the last notices
  sent for that bus.
- **Fees → Payments** (per-student header): "WhatsApp Reminder" beside
  Record Waiver / Record Payment. **Fees → Dues**: a message icon on every row
  with dues. Both open *Send fee reminder*: amount, who receives it, optional
  note, preview, Send.
- Not configured → amber notice naming the missing setup, Send disabled.

### Also touched

- `WHATSAPP_*` added to `.env.example`, `turbo.json` globalEnv, `MODULES.md`.
- Guide registry entries for `/transport/buses`, `/fees/dues`, `/fees/payments`.
- Audit log action phrases.

## Out of scope (deliberately)

- Bulk "remind every defaulter in the class" — one click that costs 40
  messages wants its own confirmation design; add once per-student works.
- SMS fallback for numbers not on WhatsApp — Meta reports `failed`, which the
  log records; a second provider is a separate decision.
- Parents replying — the inbound assistant already handles that channel.

## Verification

`pnpm run typecheck`, `pnpm run lint`, `check:guide`, `check:mobile`,
`check:colors`, `check:api-auth`, an ERP build, pure-function checks on
recipient resolution / parameter flattening / template rendering, and the
migration applied and inspected. Live sends need Meta credentials the school
does not yet hold — see "Still NOT verified — needs Meta" in `ai-features.md`.
