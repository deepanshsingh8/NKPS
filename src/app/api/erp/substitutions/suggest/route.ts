import { NextRequest, NextResponse } from "next/server";
import { verifyAdminOrEditor } from "@/lib/verify-admin";
import { HALF_DAY_CUTOFF_PERIOD } from "@/lib/constants";

// Substitute-suggestion algorithm.
//
// Availability uses TIME-RANGE OVERLAP, not period_number equality, because
// classes run on staggered schedules in this school (verified — see
// scripts/_check-period-times.mjs).
//
// Per period, we score and rank candidate teachers by:
//   +100  teaches this subject in class_subjects (any class)
//   +30   already teaches this class somewhere in the week
//   +20   specialization text contains the subject name (ILIKE)
//   -10*N substitutions assigned this ISO week (fairness penalty)
//
// We rank, not filter — a non-ideal substitute is still better than no one,
// the admin makes the final call. Top 10 per period are returned with a
// breakdown so the UI can show *why* a teacher is suggested.

const TOP_N = 10;
const SCORE_SUBJECT_MATCH = 100;
const SCORE_CLASS_MATCH = 30;
const SCORE_SPECIALIZATION_HINT = 20;
const SCORE_FAIRNESS_PENALTY_PER_SUB = -10;

interface ScoredCandidate {
  teacher: {
    id: string;
    full_name: string;
    employee_id: string | null;
    specialization: string | null;
  };
  score: number;
  reasons: string[];
}

function dayOfWeekFromIsoDate(yyyymmdd: string): number {
  const d = new Date(`${yyyymmdd}T12:00:00`);
  return d.getDay();
}

// ISO-week Monday start (1=Mon...7=Sun): if input is Sunday treat as
// previous week's last day (consistent with most school timetables).
function isoWeekRange(yyyymmdd: string): { from: string; to: string } {
  const d = new Date(`${yyyymmdd}T12:00:00`);
  const js = d.getDay(); // 0=Sun
  const offsetToMonday = js === 0 ? -6 : 1 - js;
  const monday = new Date(d);
  monday.setDate(d.getDate() + offsetToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  return { from: fmt(monday), to: fmt(sunday) };
}

function timesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export async function GET(request: NextRequest) {
  const admin = await verifyAdminOrEditor("teacher_substitutions");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const absenceId = request.nextUrl.searchParams.get("absence_id");
  if (!absenceId) {
    return NextResponse.json(
      { error: "absence_id is required" },
      { status: 400 }
    );
  }

  // 1. Resolve the absence.
  const { data: absence, error: absenceErr } = await admin
    .from("teacher_absences")
    .select(
      "id, teacher_id, absence_date, half_day, reason, teachers(id, full_name, employee_id)"
    )
    .eq("id", absenceId)
    .single();
  if (absenceErr || !absence) {
    return NextResponse.json(
      { error: absenceErr?.message ?? "Absence not found" },
      { status: 404 }
    );
  }

  const dayOfWeek = dayOfWeekFromIsoDate(absence.absence_date);
  const { from: weekFrom, to: weekTo } = isoWeekRange(absence.absence_date);

  // 2. Affected periods: this teacher's timetable on that weekday.
  let affectedQuery = admin
    .from("timetable_periods")
    .select(
      "id, day_of_week, period_number, start_time, end_time, room, is_break, class_id, subject_id, classes(id, name, section), subjects(id, name, code)"
    )
    .eq("teacher_id", absence.teacher_id)
    .eq("day_of_week", dayOfWeek)
    .eq("is_break", false)
    .order("start_time", { ascending: true });

  if (absence.half_day === "first_half") {
    affectedQuery = affectedQuery.lte("period_number", HALF_DAY_CUTOFF_PERIOD);
  } else if (absence.half_day === "second_half") {
    affectedQuery = affectedQuery.gt("period_number", HALF_DAY_CUTOFF_PERIOD);
  }

  const { data: affectedPeriods, error: affectedErr } = await affectedQuery;
  if (affectedErr) {
    return NextResponse.json({ error: affectedErr.message }, { status: 500 });
  }

  // 3. Candidate pool: all active teachers excluding the absent one.
  const { data: candidates, error: candidatesErr } = await admin
    .from("teachers")
    .select("id, full_name, employee_id, specialization")
    .eq("is_active", true)
    .neq("id", absence.teacher_id);
  if (candidatesErr) {
    return NextResponse.json({ error: candidatesErr.message }, { status: 500 });
  }

  // 4. All timetable rows for this weekday (busy-set per teacher).
  const { data: dayBusy, error: busyErr } = await admin
    .from("timetable_periods")
    .select("teacher_id, class_id, start_time, end_time")
    .eq("day_of_week", dayOfWeek)
    .not("teacher_id", "is", null);
  if (busyErr) {
    return NextResponse.json({ error: busyErr.message }, { status: 500 });
  }

  // 5. Other absences on the same date — can't sub if you're also absent.
  const { data: otherAbsences, error: otherAbsErr } = await admin
    .from("teacher_absences")
    .select("teacher_id, half_day")
    .eq("absence_date", absence.absence_date)
    .neq("id", absence.id);
  if (otherAbsErr) {
    return NextResponse.json({ error: otherAbsErr.message }, { status: 500 });
  }

  // 6. Already-assigned substitutions on the same date — a sub already
  // assigned to overlapping period elsewhere can't double-up.
  const { data: dateSubs, error: dateSubsErr } = await admin
    .from("substitutions")
    .select(
      "substitute_teacher_id, timetable_period_id, timetable_periods(start_time, end_time, day_of_week), teacher_absences!inner(absence_date)"
    )
    .eq("teacher_absences.absence_date", absence.absence_date)
    .not("substitute_teacher_id", "is", null);
  if (dateSubsErr) {
    return NextResponse.json({ error: dateSubsErr.message }, { status: 500 });
  }

  // 7. Subject expertise: who teaches what subject (any class).
  const { data: classSubjects, error: csErr } = await admin
    .from("class_subjects")
    .select("teacher_id, class_id, subject_id")
    .not("teacher_id", "is", null);
  if (csErr) {
    return NextResponse.json({ error: csErr.message }, { status: 500 });
  }

  // 8. Fairness: count this week's substitutions per teacher.
  const { data: weekSubs, error: weekSubsErr } = await admin
    .from("substitutions")
    .select("substitute_teacher_id, teacher_absences!inner(absence_date)")
    .gte("teacher_absences.absence_date", weekFrom)
    .lte("teacher_absences.absence_date", weekTo)
    .not("substitute_teacher_id", "is", null);
  if (weekSubsErr) {
    return NextResponse.json({ error: weekSubsErr.message }, { status: 500 });
  }

  // 9. Existing substitution rows for THIS absence (to expose "already
  // assigned" state alongside fresh suggestions).
  const { data: existingForAbsence, error: existingErr } = await admin
    .from("substitutions")
    .select(
      "id, timetable_period_id, substitute_teacher_id, note, teachers:substitute_teacher_id(id, full_name)"
    )
    .eq("absence_id", absence.id);
  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }

  // ── Build lookup structures ────────────────────────────────────────────────
  const busyByTeacher = new Map<string, Array<{ start_time: string; end_time: string }>>();
  for (const row of dayBusy ?? []) {
    if (!row.teacher_id) continue;
    if (!busyByTeacher.has(row.teacher_id)) busyByTeacher.set(row.teacher_id, []);
    busyByTeacher.get(row.teacher_id)!.push({
      start_time: row.start_time,
      end_time: row.end_time,
    });
  }

  // A teacher who's also absent this date is unavailable. Track by half_day so
  // first_half-absent teachers can still sub second_half periods.
  const absentByTeacher = new Map<string, string>(); // teacher_id → half_day
  for (const a of otherAbsences ?? []) {
    absentByTeacher.set(a.teacher_id, a.half_day);
  }

  // dateSubsByTeacher: teacher_id → array of busy time ranges from confirmed
  // substitutions on this date.
  const dateSubsByTeacher = new Map<
    string,
    Array<{ start_time: string; end_time: string }>
  >();
  for (const s of dateSubs ?? []) {
    if (!s.substitute_teacher_id) continue;
    const tp = s.timetable_periods as unknown as
      | { start_time: string; end_time: string; day_of_week: number }
      | null;
    if (!tp) continue;
    if (!dateSubsByTeacher.has(s.substitute_teacher_id)) {
      dateSubsByTeacher.set(s.substitute_teacher_id, []);
    }
    dateSubsByTeacher.get(s.substitute_teacher_id)!.push({
      start_time: tp.start_time,
      end_time: tp.end_time,
    });
  }

  // teacher_id → Set<subject_id> they teach
  const subjectsByTeacher = new Map<string, Set<string>>();
  // teacher_id → Set<class_id> they teach
  const classesByTeacherFromCS = new Map<string, Set<string>>();
  for (const cs of classSubjects ?? []) {
    if (!cs.teacher_id) continue;
    if (cs.subject_id) {
      if (!subjectsByTeacher.has(cs.teacher_id)) subjectsByTeacher.set(cs.teacher_id, new Set());
      subjectsByTeacher.get(cs.teacher_id)!.add(cs.subject_id);
    }
    if (cs.class_id) {
      if (!classesByTeacherFromCS.has(cs.teacher_id)) classesByTeacherFromCS.set(cs.teacher_id, new Set());
      classesByTeacherFromCS.get(cs.teacher_id)!.add(cs.class_id);
    }
  }
  // Augment with timetable_periods (a teacher may be timetabled to a class
  // without a class_subjects row — defensive).
  const classesByTeacher = new Map<string, Set<string>>(classesByTeacherFromCS);
  for (const row of dayBusy ?? []) {
    if (!row.teacher_id || !row.class_id) continue;
    if (!classesByTeacher.has(row.teacher_id)) classesByTeacher.set(row.teacher_id, new Set());
    classesByTeacher.get(row.teacher_id)!.add(row.class_id);
  }

  const subCountByTeacher = new Map<string, number>();
  for (const w of weekSubs ?? []) {
    if (!w.substitute_teacher_id) continue;
    subCountByTeacher.set(
      w.substitute_teacher_id,
      (subCountByTeacher.get(w.substitute_teacher_id) ?? 0) + 1
    );
  }

  // existing substitutions per period (so the response can flag which are
  // already filled).
  const existingByPeriod = new Map<string, (typeof existingForAbsence)[number]>();
  for (const e of existingForAbsence ?? []) {
    existingByPeriod.set(e.timetable_period_id, e);
  }

  // ── Per-period scoring ─────────────────────────────────────────────────────
  const periods = (affectedPeriods ?? []).map((p) => {
    const isFirstHalfPeriod = p.period_number <= HALF_DAY_CUTOFF_PERIOD;

    const scored: ScoredCandidate[] = [];
    for (const c of candidates ?? []) {
      // Half-day-aware absence skip.
      const candidateAbsence = absentByTeacher.get(c.id);
      if (candidateAbsence === "full") continue;
      if (candidateAbsence === "first_half" && isFirstHalfPeriod) continue;
      if (candidateAbsence === "second_half" && !isFirstHalfPeriod) continue;

      // Time-overlap busy on the regular timetable.
      const busy = busyByTeacher.get(c.id) ?? [];
      const conflictTimetable = busy.some((b) =>
        timesOverlap(b.start_time, b.end_time, p.start_time, p.end_time)
      );
      if (conflictTimetable) continue;

      // Already-assigned substitution on this date with overlap.
      const dsBusy = dateSubsByTeacher.get(c.id) ?? [];
      const conflictSub = dsBusy.some((b) =>
        timesOverlap(b.start_time, b.end_time, p.start_time, p.end_time)
      );
      if (conflictSub) continue;

      // Score.
      const reasons: string[] = [];
      let score = 0;

      const subj = p.subjects as unknown as { id: string; name: string; code: string | null } | null;
      const cls = p.classes as unknown as { id: string; name: string; section: string | null } | null;

      if (subj && subjectsByTeacher.get(c.id)?.has(subj.id)) {
        score += SCORE_SUBJECT_MATCH;
        reasons.push(`Teaches ${subj.name}`);
      }
      if (cls && classesByTeacher.get(c.id)?.has(cls.id)) {
        score += SCORE_CLASS_MATCH;
        const cn = `${cls.name}${cls.section ? "-" + cls.section : ""}`;
        reasons.push(`Already teaches ${cn}`);
      }
      if (
        subj &&
        c.specialization &&
        c.specialization.toLowerCase().includes(subj.name.toLowerCase())
      ) {
        score += SCORE_SPECIALIZATION_HINT;
        reasons.push(`Specialisation matches "${subj.name}"`);
      }
      const subsThisWeek = subCountByTeacher.get(c.id) ?? 0;
      if (subsThisWeek > 0) {
        score += SCORE_FAIRNESS_PENALTY_PER_SUB * subsThisWeek;
        reasons.push(
          `${subsThisWeek} sub${subsThisWeek === 1 ? "" : "s"} this week`
        );
      }

      scored.push({
        teacher: {
          id: c.id,
          full_name: c.full_name,
          employee_id: c.employee_id,
          specialization: c.specialization,
        },
        score,
        reasons,
      });
    }

    // Higher score first; tiebreak by name for deterministic ordering.
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.teacher.full_name.localeCompare(b.teacher.full_name);
    });

    return {
      period: p,
      current_substitution: existingByPeriod.get(p.id) ?? null,
      candidates: scored.slice(0, TOP_N),
      candidate_count_total: scored.length,
    };
  });

  return NextResponse.json({
    data: {
      absence,
      periods,
    },
  });
}
