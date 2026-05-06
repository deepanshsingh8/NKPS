# Distance-based Transport Fees

Goal: Replace the single flat `Transport` fee with admin-defined distance slabs. Per-student transport opt-in carries which slab applies, so the dynamic price flows through to dues, receipts, and the student/parent views. Split the admin Fees screen into **Academic** vs **Transport** sub-sections so each lives in its own surface.

**Hard constraint:** must not break anything that works today.
- Existing recorded fee payments stay valid — historical Transport receipts continue to resolve.
- Admins keep full access.
- Dues/no-dues math reconciles before/after to the rupee for any student already opted-in.

---

## Design summary

### 1. New table `transport_fare_slabs`
Distance-band master, scoped per academic year. Fully flexible — admin can name slabs whatever they want; distance min/max are advisory metadata only.

```
id                uuid PK
academic_year_id  uuid FK academic_years
name              text NOT NULL          -- "0–5 km", "Cluster A", etc.
distance_km_min   numeric(5,2) NULL      -- optional, display-only
distance_km_max   numeric(5,2) NULL      -- optional, display-only
amount            numeric(10,2) NOT NULL CHECK (amount > 0)
frequency         text NOT NULL DEFAULT 'monthly' (monthly|quarterly|annual|one_time)
is_active         boolean DEFAULT true
sort_order        int DEFAULT 0
created_at, updated_at
UNIQUE(academic_year_id, name)
```

### 2. `student_enrollments` — add slab pointer
- `transport_slab_id uuid REFERENCES transport_fare_slabs(id) ON DELETE SET NULL`.
- Soft constraint: `has_transport = true` requires `transport_slab_id IS NOT NULL` (enforced in UI + payments API; CHECK constraint on the table for hard guarantee).

### 3. `fee_payments` — allow recording slab payments
- `fee_structure_id` becomes nullable.
- Add `transport_slab_id uuid REFERENCES transport_fare_slabs(id)`.
- CHECK: exactly one of `fee_structure_id` / `transport_slab_id` is set.
- All existing rows are unaffected (they keep their `fee_structure_id`).

### 4. Resolver (`apps/erp/src/lib/fees.ts`)
Drop Transport entirely from the `fee_structures` flow. Add a sibling helper that, given a student's enrollment + slab catalog, returns a synthesized `FeeStructure`-shaped line for the slab so existing UI/dues code stays mostly untouched.

```ts
resolveTransportLine({ enrollment, slabs }): SyntheticFeeLine | null
```

The Admin/Student/Parent fee pages call both helpers and concatenate the result. Type-side, introduce `EffectiveFeeLine = FeeStructure | TransportFeeLine` to keep the union explicit.

### 5. Admin Fees page (`apps/erp/src/app/(admin)/fees/page.tsx`)
Restructure the **Fee Structures** tab into two sub-tabs:

- **Academic** — current table & dialog, but the Fee Type dropdown drops `Transport`.
- **Transport** — CRUD for `transport_fare_slabs` (Name, Min km, Max km, Amount, Frequency).

In the **Payments** tab, replace the bare Transport checkbox with:

```
[x] Using Transport   →   [Distance: 0–5 km ▾]   ₹1,200/month
```

When the checkbox is enabled, a slab dropdown appears; saving "Using Transport" without a slab selection is rejected. The "Applicable Fee Structures" grid below now includes the synthesized transport line.

The **Dues / No-Dues** tab updates to include the slab-driven transport amount per row (instead of a hard-coded fixed Transport row from `fee_structures`). The existing CSV columns stay the same — `Transport` stays a yes/no column, but the expected/dues now reflect the slab's amount.

### 6. Student & Parent fee views
Read-only consumers of the same resolver. The transport line shows up identically with the slab name (e.g. "Transport — 0–5 km") + amount. No new dialogs.

### 7. Payments API (`/api/fees/payments`)
- Schema accepts `fee_structure_id?` OR `transport_slab_id?` (XOR; validated by Zod refine).
- For slab payments, look up `transport_fare_slabs` for `amount` and `academic_year_id`; existing over-payment guard works the same.
- `fee_payments.transport_slab_id` written; `fee_structure_id` stays null.

### 8. Receipt PDF (`/api/fees/receipt`)
- When payment row has `transport_slab_id`, render the slab name as the line description (instead of `fee_structure.fee_type`).

### 9. Migration & schema mirror
- New `migration-050-transport-fare-slabs.sql` under `scripts/migrations/erp/`.
- Append the same DDL to `supabase-schema.sql` (per memory rule).
- Backfill (idempotent, in same migration):
  1. For each distinct `(academic_year_id, class_name, amount, frequency)` row in `fee_structures` where `fee_type = 'Transport' AND is_active`, create a slab named e.g. `"Default — {class_name}"`. Distance min/max NULL.
  2. For each `student_enrollments` row where `has_transport = true`, set `transport_slab_id` to the slab matching the enrollment's class (preferring the slab created from that class's Transport structure).
  3. Set `fee_structures.is_active = false` for all Transport rows so they no longer surface in admin pickers, while old `fee_payments` keep resolving.

---

## Decisions (confirmed)

1. **Slab scope** — school-wide per academic year. ✓
2. **Existing Transport `fee_structures`** — repoint dependent `fee_payments` to slabs, then hard-delete. ✓
3. **`distance_km_min/max`** — optional metadata; slab name is the label. ✓
4. **Slab edits** — mutate in place. `fee_payments.amount_paid` is already stamped at write time, so receipts stay correct; we lose only the historical price browsing, which isn't needed. ✓

---

## Implementation checklist

- [x] Migration 050 + supabase-schema.sql append (table, FKs, CHECK, backfill)
- [x] `packages/shared/src/types/index.ts`: `TransportFareSlab` + `EffectiveFeeLine` union
- [x] `apps/erp/src/lib/fees.ts`: drop Transport from `fee_structures` resolver; add `resolveTransportLine` + `resolveEffectiveFeeLines`
- [x] Validation schemas (`packages/shared/src/lib/validations.ts`): slab CRUD + payment XOR
- [x] Admin Fees page: Academic/Transport sub-tabs in Structures, slab dropdown in Payments tab, dues compute reads slabs
- [x] `/api/fees/payments`: accept slab_id; write nullable fee_structure_id
- [x] `/api/fees/receipt`: render slab name when applicable
- [x] Student fees page: show slab line
- [x] Parent fees page: show slab line
- [x] Analytics route updated for slab-driven expected total
- [x] Typecheck + lint + build clean (4 packages)
- [ ] Manual smoke: apply migration → create slab → opt student in → record payment → download receipt → check dues report (deferred to user)

## Review

**What changed**

Distance-based transport fees are live. The flat `Transport` row in `fee_structures` is gone — fares now live in a per-academic-year `transport_fare_slabs` master with optional km bands. Each `student_enrollments` row points at a slab via `transport_slab_id`; `fee_payments` accepts either `fee_structure_id` (academic) or `transport_slab_id` (transport), enforced by a XOR CHECK. Migration 050 backfills slabs from any existing Transport rows, repoints old transport receipts onto the new slab, then hard-deletes the originals. Receipts now render `Transport — 0–5 km` instead of a generic "Transport".

**Files touched**

- `scripts/migrations/erp/migration-050-transport-fare-slabs.sql` — new
- `supabase-schema.sql` — appended migration 050 DDL (per memory rule)
- `packages/shared/src/types/index.ts` — `TransportFareSlab`, `TransportFeeLine`, `EffectiveFeeLine`; `transport_slab_id` on `StudentEnrollment` + `FeePayment`
- `packages/shared/src/lib/validations.ts` — `transportFareSlabSchema`; `feePaymentSchema` accepts XOR fee_structure_id / transport_slab_id
- `apps/erp/src/lib/fees.ts` — dropped Transport handling from `resolveEffectiveFeeStructures`; added `resolveTransportLine`, `resolveEffectiveFeeLines`
- `apps/erp/src/app/(admin)/fees/page.tsx` — Academic/Transport sub-tabs, slab CRUD dialog, slab dropdown in payments tab, dues includes slab amount, payments dropdown handles XOR
- `apps/erp/src/app/api/fees/payments/route.ts` — branches on slab vs structure for amount/year lookup, over-payment guard, FK insert
- `apps/erp/src/app/api/fees/receipt/route.tsx` — joins `transport_fare_slabs` and renders slab name
- `apps/erp/src/app/student/fees/page.tsx` — uses `resolveEffectiveFeeLines`, joins slab in payment history
- `apps/erp/src/app/parent/fees/page.tsx` — same treatment as student page
- `apps/erp/src/app/api/dashboard/analytics/route.ts` — fetches slabs, adds slab annualized to expected; payment query no longer inner-joins through `fee_structures`

**Open follow-ups (not blocking)**
- Waiver flow still locked to `fee_structure_id` only. If the school wants to waive transport fees too, extend `feeWaiverSchema` and the route to accept `transport_slab_id` (XOR) — would mirror the payments change exactly.
- Dues CSV column header is still "Transport" (yes/no). Could become "Transport Slab" once school confirms they want the slab name in exports.
- The user needs to apply migration 050 to the live DB and run a manual smoke test (covered in the checklist above).
