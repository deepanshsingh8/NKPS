import { NextRequest, NextResponse } from "next/server";
import { verifyAdminOrEditorWithUser } from "@nkps/shared/lib/verify-admin";
import { SCHOOL, haversineKm } from "@nkps/shared/lib/geo";
import { z } from "zod";

// POST /api/students/transport
//
// Single source of truth for assigning transport to a student. Replaces the
// old direct adminApi("update", "student_enrollments", …) call so the
// override-audit rules can be enforced server-side instead of trusting the
// client to fill them in.
//
// Why this lives in its own route and not on /api/students:
//   - The override-vs-suggested check requires reading the slab catalog,
//     which the students PATCH route shouldn't have to know about.
//   - The body shape is different enough (pickup coords, reason) that
//     overloading PATCH would obscure the audit contract.

// Road distance is computed in the browser (referrer-restricted key) and sent
// here. We can't recompute it server-side without a server key, so we GUARD it
// against the straight-line distance we CAN compute: a real road can't be
// shorter than the crow-flies line, and it shouldn't be wildly longer either.
// These bounds catch a tampered/garbage value before it bills a family.
const ROAD_FLOOR_SLACK_KM = 0.1; // rounding slack on the >= straight-line floor
const MAX_DETOUR_RATIO = 3; // road km ceiling = straight-line * ratio + slack
const DETOUR_SLACK_KM = 2; // absolute slack so short trips aren't false-flagged

const bodySchema = z.object({
  enrollment_id: z.string().uuid(),
  has_transport: z.boolean(),
  // Pickup address is optional — schools may opt in to transport before
  // collecting a full address (the student starts on the bus today but
  // the parent will WhatsApp the address tomorrow). When provided, we
  // require both coordinates so the distance math has something to chew.
  pickup_address: z.string().trim().nullable().optional(),
  pickup_lat: z.number().min(-90).max(90).nullable().optional(),
  pickup_lng: z.number().min(-180).max(180).nullable().optional(),
  // Slab is required when has_transport=true.
  slab_id: z.string().uuid().nullable().optional(),
  // Required iff the admin picks a slab that differs from what auto-pick
  // would suggest given the road distance. Trimmed and lower-bounded so the
  // audit isn't "asdf".
  override_reason: z.string().trim().min(3).nullable().optional(),
  // Road-distance provenance. road_distance_km is the browser-computed driving
  // distance; distance_source distinguishes an auto-computed fare from a manual
  // one (Google failed / no coords). straight_line_km is NOT trusted from the
  // client — we recompute it from the coords below.
  road_distance_km: z.number().positive().max(500).nullable().optional(),
  distance_source: z.enum(["google_routes", "manual"]).nullable().optional(),
  pickup_place_id: z.string().trim().max(300).nullable().optional(),
  pickup_route_polyline: z.string().max(20000).nullable().optional(),
});

export async function POST(request: NextRequest) {
  const access = await verifyAdminOrEditorWithUser("fees");
  if (!access) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { admin, user } = access;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const body = parsed.data;

  // Look up the enrollment so we can resolve its academic year (slabs are
  // year-scoped) and detect changes from the previous override state.
  const { data: enrollment, error: enrollmentErr } = await admin
    .from("student_enrollments")
    .select(
      "id, academic_year_id, transport_slab_id, transport_slab_suggested_id, transport_slab_overridden_at, pickup_address, pickup_lat, pickup_lng"
    )
    .eq("id", body.enrollment_id)
    .maybeSingle();

  if (enrollmentErr || !enrollment) {
    return NextResponse.json(
      { error: "Enrollment not found" },
      { status: 404 }
    );
  }

  // Opt-out path: clear the slab + override metadata but keep pickup
  // coords (parents who flip back later shouldn't have to re-enter).
  if (!body.has_transport) {
    const { error } = await admin
      .from("student_enrollments")
      .update({
        has_transport: false,
        transport_slab_id: null,
        transport_slab_suggested_id: null,
        transport_slab_overridden_at: null,
        transport_slab_overridden_by: null,
        transport_slab_override_reason: null,
        // No active fare → clear the billed-distance provenance. The pickup
        // geometry (address / coords / place_id / polyline) is intentionally
        // retained so a parent who flips back later needn't re-enter it.
        road_distance_km: null,
        straight_line_km: null,
        distance_source: null,
        distance_computed_at: null,
        distance_computed_by: null,
      })
      .eq("id", body.enrollment_id);
    if (error) {
      console.error("[transport.POST] opt-out:", error);
      return NextResponse.json(
        { error: "Failed to opt out of transport" },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true });
  }

  // Opt-in path: slab is required and the override-vs-suggested check runs.
  if (!body.slab_id) {
    return NextResponse.json(
      { error: "Pick a slab before opting in to transport" },
      { status: 400 }
    );
  }

  // Coordinate pairing: schema check_constraint enforces this too, but
  // returning a friendly error beats a Postgres-level 23514.
  const hasLat = body.pickup_lat != null;
  const hasLng = body.pickup_lng != null;
  if (hasLat !== hasLng) {
    return NextResponse.json(
      { error: "pickup_lat and pickup_lng must be set together" },
      { status: 400 }
    );
  }

  // Verify the slab exists, is active, and belongs to this enrollment's
  // academic year. Stops admins from accidentally assigning a slab from a
  // different year (which would slip past the foreign-key check).
  const { data: chosenSlab, error: slabErr } = await admin
    .from("transport_fare_slabs")
    .select("id, academic_year_id, is_active, distance_km_min, distance_km_max")
    .eq("id", body.slab_id)
    .maybeSingle();
  if (slabErr || !chosenSlab) {
    return NextResponse.json({ error: "Slab not found" }, { status: 404 });
  }
  if (!chosenSlab.is_active) {
    return NextResponse.json({ error: "Slab is inactive" }, { status: 400 });
  }
  if (chosenSlab.academic_year_id !== enrollment.academic_year_id) {
    return NextResponse.json(
      { error: "Slab belongs to a different academic year" },
      { status: 400 }
    );
  }

  // Straight-line distance is the one number we can compute authoritatively
  // server-side — the floor and sanity bound for the browser-sent road km.
  const straightLineKm =
    hasLat && hasLng
      ? haversineKm(
          SCHOOL.lat,
          SCHOOL.lng,
          body.pickup_lat as number,
          body.pickup_lng as number
        )
      : null;

  // A fare is "verifiable" (auto-slabbed + audit-checkable) only when it came
  // from a real road distance against confirmed coordinates. Anything else
  // (Google failed, no coords) is a manual assignment that needs a reason.
  let roadKm: number | null = null;
  let verifiable = false;
  if (body.distance_source === "google_routes") {
    if (
      !hasLat ||
      !hasLng ||
      body.road_distance_km == null ||
      straightLineKm == null
    ) {
      return NextResponse.json(
        { error: "Road distance requires a confirmed pickup point." },
        { status: 400 }
      );
    }
    roadKm = body.road_distance_km;
    if (roadKm < straightLineKm - ROAD_FLOOR_SLACK_KM) {
      return NextResponse.json(
        {
          error:
            "Road distance is shorter than the straight-line distance — recompute the point, or assign a slab manually with a reason.",
        },
        { status: 400 }
      );
    }
    if (roadKm > straightLineKm * MAX_DETOUR_RATIO + DETOUR_SLACK_KM) {
      return NextResponse.json(
        {
          error:
            "Road distance looks implausibly long for this location — recompute the point, or assign a slab manually with a reason.",
        },
        { status: 400 }
      );
    }
    verifiable = true;
  }

  // Suggest a slab from the validated road distance. Only meaningful when
  // verifiable; a manual assignment records no suggestion.
  let suggestedId: string | null = null;
  if (verifiable && roadKm != null) {
    const { data: slabs } = await admin
      .from("transport_fare_slabs")
      .select("id, distance_km_min, distance_km_max, is_active, sort_order")
      .eq("academic_year_id", enrollment.academic_year_id)
      .eq("is_active", true)
      .order("distance_km_min", { ascending: true, nullsFirst: true });

    for (const s of (slabs ?? []) as {
      id: string;
      distance_km_min: number | null;
      distance_km_max: number | null;
    }[]) {
      const min = s.distance_km_min == null ? 0 : Number(s.distance_km_min);
      const max =
        s.distance_km_max == null
          ? Number.POSITIVE_INFINITY
          : Number(s.distance_km_max);
      if (roadKm >= min && roadKm <= max) {
        suggestedId = s.id;
        break;
      }
    }
  }

  // Two cases require a justification:
  //  1. A verifiable fare whose chosen slab differs from the auto-suggested one.
  //  2. An unverifiable assignment (manual / no road distance) — it can't be
  //     auto-checked, so the manual choice must be justified. Without this a
  //     caller could dodge the audit by omitting the road distance.
  const isOverride = suggestedId != null && suggestedId !== body.slab_id;
  const isUnverifiable = !verifiable;
  if ((isOverride || isUnverifiable) && !body.override_reason) {
    return NextResponse.json(
      {
        error: isOverride
          ? "This slab differs from the suggested slab — a reason is required to override."
          : "Auto-calculation is unavailable for this pickup. Recompute the road distance, or supply a reason to assign a slab manually.",
      },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const update: Record<string, unknown> = {
    has_transport: true,
    transport_slab_id: body.slab_id,
    transport_slab_suggested_id: suggestedId,
    pickup_address: body.pickup_address ?? null,
    pickup_lat: body.pickup_lat ?? null,
    pickup_lng: body.pickup_lng ?? null,
    pickup_place_id: body.pickup_place_id ?? null,
    // Billed-distance provenance.
    road_distance_km: verifiable && roadKm != null ? round2(roadKm) : null,
    straight_line_km: straightLineKm != null ? round2(straightLineKm) : null,
    distance_source: verifiable ? "google_routes" : "manual",
    distance_computed_at: now,
    distance_computed_by: user.id,
    pickup_route_polyline: verifiable
      ? body.pickup_route_polyline ?? null
      : null,
  };
  // Record an audit entry whenever a justification was required — either a true
  // override (chosen slab differs from suggestion) or an unverifiable manual
  // assignment (no coords to auto-derive a suggestion from).
  if (isOverride || isUnverifiable) {
    update.transport_slab_overridden_at = now;
    update.transport_slab_overridden_by = user.id;
    update.transport_slab_override_reason = body.override_reason;
  } else {
    update.transport_slab_overridden_at = null;
    update.transport_slab_overridden_by = null;
    update.transport_slab_override_reason = null;
  }

  // If the pickup coords changed, drop the previous verification —
  // a verified pickup at the old coords doesn't vouch for the new ones.
  const coordsChanged =
    enrollment.pickup_lat?.toString() !== (body.pickup_lat ?? null)?.toString() ||
    enrollment.pickup_lng?.toString() !== (body.pickup_lng ?? null)?.toString();
  if (coordsChanged) {
    update.pickup_verified_at = null;
    update.pickup_verified_by = null;
    update.pickup_verified_lat = null;
    update.pickup_verified_lng = null;
  }

  const { error } = await admin
    .from("student_enrollments")
    .update(update)
    .eq("id", body.enrollment_id);

  if (error) {
    console.error("[transport.POST] update:", error);
    return NextResponse.json(
      { error: "Failed to save transport assignment" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    suggested_slab_id: suggestedId,
    is_override: isOverride,
  });
}
