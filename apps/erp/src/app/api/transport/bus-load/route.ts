import { NextResponse } from "next/server";
import { verifyAdminOrEditor } from "@nkps/shared/lib/verify-admin";

/**
 * How many students each bus carries, for /transport/buses.
 *
 * The fleet tables are world-readable and load on the client, but the riders
 * are `student_enrollments` rows — student data, behind RLS and behind the
 * `transport` grant. So the count comes from here, the same way
 * /api/transport/assignments reads the assignments themselves.
 *
 * Only the count crosses the wire, never the enrollments: the buses screen has
 * no business holding a student roster.
 *
 * Counted exactly as /transport/assignments counts it — `has_transport` with a
 * bus, whatever the enrollment's status. Two screens disagreeing about how
 * full a bus is would be worse than either rule on its own, and a student who
 * has left still holds their seat until somebody removes the assignment, which
 * is the point of the Remove action over there.
 */
export async function GET(request: Request) {
  try {
    const admin = await verifyAdminOrEditor("transport");
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const requestedYearId = new URL(request.url).searchParams.get(
      "academic_year_id"
    );

    // Same active-year rule as the assignments route: prefer is_current, else
    // newest by name, so the two screens resolve to the same year.
    const { data: yearsData, error: yearsError } = await admin
      .from("academic_years")
      .select("id, name, is_current")
      .order("name", { ascending: false });

    if (yearsError) {
      console.error("Bus load: fetch years error:", yearsError);
      return NextResponse.json(
        { error: "Failed to load academic years" },
        { status: 500 }
      );
    }

    const years = yearsData ?? [];
    const year =
      (requestedYearId ? years.find((y) => y.id === requestedYearId) : null) ??
      years.find((y) => y.is_current) ??
      years[0] ??
      null;

    if (!year) return NextResponse.json({ year: null, loads: {} });

    // .range(0, 9999) clears PostgREST's 1000-row default — a full school runs
    // past it, and the truncation would silently under-report every bus.
    const { data, error } = await admin
      .from("student_enrollments")
      .select("bus_id")
      .eq("academic_year_id", year.id)
      .eq("has_transport", true)
      .not("bus_id", "is", null)
      .range(0, 9999);

    if (error) {
      console.error("Bus load: fetch enrollments error:", error);
      return NextResponse.json(
        { error: "Failed to load bus occupancy" },
        { status: 500 }
      );
    }

    const loads: Record<string, number> = {};
    for (const row of data ?? []) {
      const busId = (row as { bus_id: string | null }).bus_id;
      if (busId) loads[busId] = (loads[busId] ?? 0) + 1;
    }

    return NextResponse.json({ year, loads });
  } catch (err) {
    console.error("Bus load fetch error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
