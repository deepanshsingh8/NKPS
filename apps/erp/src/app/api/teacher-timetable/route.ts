import { NextRequest, NextResponse } from "next/server";
import { verifyAdminOrEditor } from "@nkps/shared/lib/verify-admin";
import { fetchAllRows } from "@nkps/shared/lib/fetch-all-rows";

type AdminClient = NonNullable<Awaited<ReturnType<typeof verifyAdminOrEditor>>>;

// The current year's id, or null when none is flagged current. Timetable rows
// hang off year-scoped classes, so once next year's classes are set up a
// teacher's periods exist twice — reading both would show every slot doubled.
async function currentYearId(admin: AdminClient): Promise<string | null> {
  const { data } = await admin
    .from("academic_years")
    .select("id")
    .eq("is_current", true)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

// GET /api/teacher-timetable?teacher_id=<uuid>
// Returns the teacher's weekly schedule joined with class + subject info,
// ordered by day_of_week then start_time. Time-ordered (not period_number-
// ordered) because classes run on staggered schedules — see
// scripts/_check-period-times.mjs for empirical confirmation.
//
// GET /api/teacher-timetable (no teacher_id)
// The roster the page lands on: every active teacher with their weekly load,
// so the admin can pick someone from a list instead of an empty screen.
export async function GET(request: NextRequest) {
  const admin = await verifyAdminOrEditor("teacher_substitutions");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const teacherId = request.nextUrl.searchParams.get("teacher_id");
  const yearId = await currentYearId(admin);

  if (!teacherId) return summary(admin, yearId);

  const { data: teacher, error: teacherErr } = await admin
    .from("teachers")
    .select("id, full_name, employee_id, is_active")
    .eq("id", teacherId)
    .single();
  if (teacherErr) {
    console.error("[teacher-timetable.GET] teacher fetch:", teacherErr);
    return NextResponse.json({ error: "Failed to load teacher" }, { status: 404 });
  }

  let periodsQuery = admin
    .from("timetable_periods")
    .select(
      "id, day_of_week, period_number, start_time, end_time, room, is_break, group_no, group_label, is_shared, class_id, subject_id, classes!inner(id, name, section, academic_year_id), subjects(id, name, code)"
    )
    .eq("teacher_id", teacherId);
  if (yearId) periodsQuery = periodsQuery.eq("classes.academic_year_id", yearId);

  const { data: periods, error: periodsErr } = await periodsQuery
    .order("day_of_week", { ascending: true })
    .order("start_time", { ascending: true })
    // Parallel groups of one cell tie exactly on start_time, so without this
    // their order flips between requests. (migration 119)
    .order("group_no", { ascending: true });
  if (periodsErr) {
    console.error("[teacher-timetable.GET] periods fetch:", periodsErr);
    return NextResponse.json({ error: "Failed to load teacher timetable" }, { status: 500 });
  }

  return NextResponse.json({ data: { teacher, periods: periods ?? [] } });
}

interface SummaryPeriodRow {
  teacher_id: string;
  class_id: string;
  day_of_week: number;
  period_number: number;
  subjects: { name: string } | { name: string }[] | null;
}

async function summary(admin: AdminClient, yearId: string | null) {
  // Active only, like the old picker: a retired teacher's week is not
  // something anyone schedules against.
  const { data: teachers, error: teachersErr } = await admin
    .from("teachers")
    .select("id, full_name, employee_id, photo_url, specialization")
    .eq("is_active", true)
    .order("full_name");
  if (teachersErr) {
    console.error("[teacher-timetable.GET] summary teachers:", teachersErr);
    return NextResponse.json({ error: "Failed to load teachers" }, { status: 500 });
  }

  // ~1,500 rows for a year's timetable, past PostgREST's 1000-row cap, so page.
  const { data: rows, error: rowsErr } = await fetchAllRows<SummaryPeriodRow>(
    (from, to) => {
      let q = admin
        .from("timetable_periods")
        .select(
          "teacher_id, class_id, day_of_week, period_number, subjects(name), classes!inner(academic_year_id)"
        )
        .not("teacher_id", "is", null)
        .eq("is_break", false);
      if (yearId) q = q.eq("classes.academic_year_id", yearId);
      return q.order("id").range(from, to) as unknown as PromiseLike<{
        data: SummaryPeriodRow[] | null;
        error: { message: string } | null;
      }>;
    }
  );
  if (rowsErr) {
    console.error("[teacher-timetable.GET] summary periods:", rowsErr);
    return NextResponse.json({ error: "Failed to load timetable load" }, { status: 500 });
  }

  const byTeacher = new Map<
    string,
    { slots: Set<string>; classes: Set<string>; subjects: Map<string, number>; days: Set<number> }
  >();
  for (const r of rows) {
    let agg = byTeacher.get(r.teacher_id);
    if (!agg) {
      agg = { slots: new Set(), classes: new Set(), subjects: new Map(), days: new Set() };
      byTeacher.set(r.teacher_id, agg);
    }
    // A shared games period puts one coach in four sections at once; that is
    // one period of their week, not four.
    agg.slots.add(`${r.day_of_week}|${r.period_number}`);
    agg.classes.add(r.class_id);
    agg.days.add(r.day_of_week);
    const subj = Array.isArray(r.subjects) ? r.subjects[0] : r.subjects;
    if (subj?.name) agg.subjects.set(subj.name, (agg.subjects.get(subj.name) ?? 0) + 1);
  }

  const data = (teachers ?? []).map((t) => {
    const agg = byTeacher.get(t.id);
    return {
      ...t,
      periods_per_week: agg?.slots.size ?? 0,
      class_count: agg?.classes.size ?? 0,
      day_count: agg?.days.size ?? 0,
      // Most-taught first, so "Maths · Science" reads as what they mostly do.
      subjects: agg
        ? [...agg.subjects.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name)
        : [],
    };
  });

  return NextResponse.json({ data: { teachers: data } });
}
