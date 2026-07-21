# Transportation Section — Build Tracker

## Migrations & schema
- [x] migration-074 (schema: drop slabs; add stops/fees/buses/routes/change-requests + enrollment/payment cols)
- [x] migration-075 (seed 188 stops + 2025-26 fees)
- [x] Mirror into supabase-schema.sql (slab/distance fragments removed)

## Shared foundation (packages/shared)
- [x] types/index.ts — BusStop/BusStopFee/Bus/BusRouteStop/TransportChangeRequest + enrollment/payment/TransportFeeLine
- [x] validations.ts — stop/bus/route/assignment/change schemas; feePaymentSchema→bus_stop_id
- [x] permissions.ts — `transport` FeatureKey + catalog entry

## Fees integration (must all land together)
- [x] apps/erp/src/lib/fees.ts — resolveTransportLine from stop fee + override
- [x] apps/erp/src/lib/student-dues.ts — query bus_stop_fees
- [x] apps/erp/src/lib/transport.ts — apply + effective-bus helper
- [x] api/fees/receipt/route.tsx — join stop; label "Transport — {stop}"
- [x] api/fees/payments/route.ts — bus_stop_id branch + expected amount (stop fee / override)
- [x] parent/fees + student/fees pages — stop/direction/override (agent)
- [x] dashboard/analytics route + DashboardAnalytics.tsx — stop-based tile (agent)
- [~] Remove old /fees/transport UI + AdminFeesContent transport section (agent running); delete maps + api/students/transport pending

## Admin proxy & pages
- [x] api/admin/route.ts — 5 new tables registered; transport_fare_slabs removed (agent)
- [~] (admin)/transport/stops, buses, drivers, assignments, changes pages (agents running)
- [x] api/transport/changes (+[id]) routes; stops/buses/routes/assignment via adminApi proxy

## Sidebar & permissions wiring
- [x] ErpSidebar.tsx — new Transport group; removed Fees>Transport (badge skipped)

## Parent portal
- [~] parent/transport page + ParentSidebar item (agent running)
- [x] api/portal/transport/change-request route + transport-applications bucket (migration 076) + upload-url rule

## Verify
- [x] pnpm build (3/3 apps) + typecheck + lint (0 errors); zero slab refs in source
- [x] Migration 074 made data-safe: legacy has_transport opt-out + NOT VALID fee XOR
- [ ] commit, push, merge to main

## Review
- Schema: migration 074 (drop slabs/distance; add bus_stops, bus_stop_fees, buses,
  bus_route_stops, transport_change_requests + enrollment/payment cols), 075 (188-stop
  seed for 2025-26), 076 (transport-applications bucket). All mirrored into supabase-schema.sql.
- Post-merge action required: apply migrations 074–076 to Supabase, then re-assign
  transport students to stops on Transport → Student Assignments (legacy opt-ins were reset).
- Deferred: live sidebar pending-badge for /transport/changes (needs shared SidebarShell
  plumbing); office file-upload uses signed-URL flow; student-template registry transport
  fields not added (optional export enhancement).
