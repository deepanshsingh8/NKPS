/**
 * Student report query.
 *
 * ── The rule this file exists to enforce ────────────────────────────────────
 * `student_enrollments` filtered to the selected session is the DRIVING table.
 * `students` is joined onto it.
 *
 * `/api/students` does the opposite: it lists students and attaches a
 * "representative" enrollment (current year → active → most recently updated).
 * That is right for a working roster and WRONG for a report. Reuse it and a
 * report for 2023-24 prints today's class, roll number, house and status
 * against a three-year-old cohort — every cell plausible, every cell wrong,
 * and nothing throws.
 *
 * A student with no enrollment in the chosen session is not in the report.
 * That is the definition of a session-scoped report, not an omission.
 *
 * ── Why the join happens in memory ──────────────────────────────────────────
 * PostgREST cannot express "students matching these predicates AND enrolled in
 * this session" in one round trip without an `.in()` over every matching id —
 * and a few hundred UUIDs already overruns the URL length limit, which fails by
 * returning nothing rather than by erroring (the students route carries the
 * same warning). So the two sides are fetched independently and merged here.
 *
 * That caps this at roughly the 20k rows the `.range()` calls allow, which is
 * ~20 years of enrollments at this school's size. Past that the merge should
 * move into a Postgres view or RPC; it is not a rewrite, just a relocation.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type ReportField,
  type ReportRow,
  studentColumnsFor,
  enrollmentColumnsFor,
  needsSubjects,
} from "@nkps/shared/lib/report-fields";
import type { ReportFilters, TriState } from "@nkps/shared/lib/report-filters";

/** PostgREST's default cap is 1000; every list query here must push past it. */
const ROW_CAP = 19_999;

export interface ReportResult {
  rows: ReportRow[];
  /** Rows matching the filters, before paging. */
  total: number;
  session: { id: string; name: string; start_date: string; end_date: string };
}

export class ReportQueryError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ReportQueryError";
  }
}

/** Apply a tri-state to a nullable boolean column. */
function applyTriState<T>(query: T, column: string, state: TriState): T {
  const q = query as {
    eq: (c: string, v: unknown) => T;
    not: (c: string, op: string, v: unknown) => T;
  };
  if (state === "yes") return q.eq(column, true);
  // "no" must include NULL: an unanswered flag is not a YES, and excluding
  // nulls here would quietly drop every student whose record predates the
  // column — which is most of them for the newer UDISE flags.
  if (state === "no") return q.not(column, "is", true);
  return query;
}

export async function runStudentReport(
  admin: SupabaseClient,
  filters: ReportFilters,
  fields: readonly ReportField[]
): Promise<ReportResult> {
  // ── 1. Session ────────────────────────────────────────────────────────────
  // Fetched rather than trusted: its start/end dates drive the New/Old
  // derivation, and its name is a printable column.
  const { data: session, error: sessionError } = await admin
    .from("academic_years")
    .select("id, name, start_date, end_date")
    .eq("id", filters.session_id)
    .maybeSingle();

  if (sessionError) throw new ReportQueryError("Failed to load the session", 500);
  if (!session) throw new ReportQueryError("Session not found", 404);

  // ── 2. Classes in this session ────────────────────────────────────────────
  // Needed for the class/section columns and to scope the class filter — class
  // rows are themselves year-scoped, so a class id from another year must not
  // match here.
  let classQuery = admin
    .from("classes")
    .select("id, name, section, stream_id, sort_order")
    .eq("academic_year_id", session.id)
    .range(0, ROW_CAP);

  if (filters.class_ids.length) classQuery = classQuery.in("id", filters.class_ids);
  if (filters.section) classQuery = classQuery.eq("section", filters.section);

  const { data: classes, error: classError } = await classQuery;
  if (classError) throw new ReportQueryError("Failed to load classes", 500);

  const classIds = (classes ?? []).map((c) => c.id as string);
  // A class filter that matches nothing in this session is an empty report,
  // not an error — the admin picked a class that did not run that year.
  if (classIds.length === 0) {
    return { rows: [], total: 0, session: session as ReportResult["session"] };
  }

  const classById = new Map(
    (classes ?? []).map((c) => [
      c.id as string,
      { name: c.name as string, section: (c.section as string | null) ?? null },
    ])
  );

  // ── 3. Enrollments — the driving table ────────────────────────────────────
  let enrolQuery = admin
    .from("student_enrollments")
    .select(enrollmentColumnsFor(fields).join(", "))
    .eq("academic_year_id", session.id)
    .in("class_id", classIds)
    .in("status", filters.statuses)
    .range(0, ROW_CAP);

  if (filters.stream_id) enrolQuery = enrolQuery.eq("stream_id", filters.stream_id);
  if (filters.house_id) enrolQuery = enrolQuery.eq("house_id", filters.house_id);
  enrolQuery = applyTriState(enrolQuery, "has_transport", filters.has_transport);

  const { data: enrollments, error: enrolError } = await enrolQuery;
  if (enrolError) throw new ReportQueryError("Failed to load enrollments", 500);
  if (!enrollments?.length) {
    return { rows: [], total: 0, session: session as ReportResult["session"] };
  }

  // ── 4. Students — filtered independently, merged below ────────────────────
  let studentQuery = admin
    .from("students")
    .select(studentColumnsFor(fields).join(", "))
    .range(0, ROW_CAP);

  // `ilike` with wrapped wildcards is the "contains" the old screen offered.
  // The escape matters: an admin pasting a name with % or _ would otherwise
  // get a silently different match set.
  const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);
  if (filters.name_contains) {
    studentQuery = studentQuery.ilike("full_name", `%${escapeLike(filters.name_contains)}%`);
  }
  if (filters.father_name_contains) {
    studentQuery = studentQuery.ilike("father_name", `%${escapeLike(filters.father_name_contains)}%`);
  }
  if (filters.admission_date_from) studentQuery = studentQuery.gte("admission_date", filters.admission_date_from);
  if (filters.admission_date_to) studentQuery = studentQuery.lte("admission_date", filters.admission_date_to);
  if (filters.dob_from) studentQuery = studentQuery.gte("date_of_birth", filters.dob_from);
  if (filters.dob_to) studentQuery = studentQuery.lte("date_of_birth", filters.dob_to);
  if (filters.gender) studentQuery = studentQuery.eq("gender", filters.gender);
  if (filters.category) studentQuery = studentQuery.eq("category", filters.category);
  if (filters.religion) studentQuery = studentQuery.eq("religion", filters.religion);
  if (filters.minority_group) studentQuery = studentQuery.eq("minority_group", filters.minority_group);
  if (filters.area_type) studentQuery = studentQuery.eq("area_type", filters.area_type);

  studentQuery = applyTriState(studentQuery, "is_rte", filters.is_rte);
  studentQuery = applyTriState(studentQuery, "is_bpl", filters.is_bpl);
  studentQuery = applyTriState(studentQuery, "is_ews", filters.is_ews);
  studentQuery = applyTriState(studentQuery, "is_cwsn", filters.is_cwsn);
  studentQuery = applyTriState(studentQuery, "is_staff_ward", filters.is_staff_ward);

  const { data: students, error: studentError } = await studentQuery;
  if (studentError) throw new ReportQueryError("Failed to load students", 500);

  const studentById = new Map(
    // The select list is built at runtime, so supabase-js widens the row
    // type to its error union; the query error is checked above, so the row
    // really is a record by this point.
    (students ?? []).map((s) => {
      const row = s as unknown as Record<string, unknown>;
      return [row.id as string, row] as const;
    })
  );

  // ── 5. Small lookup tables ────────────────────────────────────────────────
  // Fetched whole: houses, streams and stops number in the tens, so a map is
  // cheaper than a join and avoids the `.in()` URL problem entirely.
  const [housesRes, streamsRes, stopsRes] = await Promise.all([
    admin.from("houses").select("id, name, code"),
    admin.from("streams").select("id, name"),
    admin.from("bus_stops").select("id, name"),
  ]);

  const houseById = new Map(
    (housesRes.data ?? []).map((h) => [h.id as string, { name: h.name as string, code: (h.code as string | null) ?? null }])
  );
  const streamById = new Map(
    (streamsRes.data ?? []).map((s) => [s.id as string, { name: s.name as string }])
  );
  const stopById = new Map(
    (stopsRes.data ?? []).map((s) => [s.id as string, { name: s.name as string }])
  );

  // ── 6. Subjects — only when a selected field or filter needs them ─────────
  let subjectsByStudent: Map<string, string[]> | null = null;
  let studentsWithSubject: Set<string> | null = null;

  if (needsSubjects(fields) || filters.subject_id) {
    const { data: classSubjects } = await admin
      .from("class_subjects")
      .select("id, subject_id, subjects(name)")
      .in("class_id", classIds)
      .range(0, ROW_CAP);

    const csMeta = new Map(
      (classSubjects ?? []).map((cs) => {
        const rel = cs.subjects as { name: string } | { name: string }[] | null;
        const name = Array.isArray(rel) ? rel[0]?.name : rel?.name;
        return [cs.id as string, { subjectId: cs.subject_id as string, name: name ?? "" }];
      })
    );

    const { data: picks } = await admin
      .from("student_subjects")
      .select("student_id, class_subject_id")
      .in("class_subject_id", [...csMeta.keys()])
      .range(0, ROW_CAP);

    subjectsByStudent = new Map();
    studentsWithSubject = new Set();
    for (const p of picks ?? []) {
      const meta = csMeta.get(p.class_subject_id as string);
      if (!meta) continue;
      const sid = p.student_id as string;
      if (meta.name) {
        const list = subjectsByStudent.get(sid) ?? [];
        list.push(meta.name);
        subjectsByStudent.set(sid, list);
      }
      if (filters.subject_id && meta.subjectId === filters.subject_id) {
        studentsWithSubject.add(sid);
      }
    }
    for (const list of subjectsByStudent.values()) list.sort();
  }

  // ── 7. Merge ──────────────────────────────────────────────────────────────
  const sessionInfo = session as ReportResult["session"];
  const merged: ReportRow[] = [];

  for (const raw of enrollments) {
    const e = raw as unknown as Record<string, unknown>;
    const studentId = e.student_id as string;
    const student = studentById.get(studentId);
    // Absent means the student failed a student-level filter — not an error.
    if (!student) continue;
    if (filters.subject_id && !studentsWithSubject?.has(studentId)) continue;

    const row: ReportRow = {
      student,
      enrollment: e,
      klass: classById.get(e.class_id as string) ?? null,
      stream: e.stream_id ? streamById.get(e.stream_id as string) ?? null : null,
      house: e.house_id ? houseById.get(e.house_id as string) ?? null : null,
      busStop: e.bus_stop_id ? stopById.get(e.bus_stop_id as string) ?? null : null,
      session: sessionInfo,
      subjects: subjectsByStudent?.get(studentId) ?? null,
      serial: 0, // assigned after sorting
    };

    // New/Old is derived from admission date vs. the session window, so it can
    // only be applied here — there is no column to filter on in step 4.
    if (filters.new_old !== "both") {
      const admitted = student.admission_date as string | null;
      const isNew =
        !!admitted &&
        admitted >= sessionInfo.start_date &&
        admitted <= sessionInfo.end_date;
      if (filters.new_old === "new" && !isNew) continue;
      if (filters.new_old === "old" && isNew) continue;
    }

    merged.push(row);
  }

  // ── 8. Sort, then number ──────────────────────────────────────────────────
  // Serial numbers are assigned AFTER sorting so "S. No." reads 1..n down the
  // printed page, which is the only thing that column is for.
  sortRows(merged, fields, filters);
  merged.forEach((row, i) => {
    row.serial = i + 1;
  });

  return { rows: merged, total: merged.length, session: sessionInfo };
}

/**
 * Sort by the chosen field, then the tie-breaker, then always by name so the
 * output is stable — an unstable report changes row order between two runs of
 * identical filters, which makes it useless for comparing printouts.
 */
function sortRows(
  rows: ReportRow[],
  fields: readonly ReportField[],
  filters: ReportFilters
): void {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const primary = filters.sort_by ? byKey.get(filters.sort_by) : undefined;
  const secondary = filters.then_by ? byKey.get(filters.then_by) : undefined;

  const compare = (a: ReportRow, b: ReportRow, field: ReportField, dir: "asc" | "desc") => {
    const av = field.resolve(a);
    const bv = field.resolve(b);
    // Blanks sort last in both directions: a column of empty cells at the top
    // of a printed list looks like the report failed.
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    let cmp: number;
    if (field.numeric) {
      cmp = Number(av) - Number(bv);
    } else {
      // Numeric-aware so "X" sorts before "XI" and roll 2 before roll 10.
      cmp = String(av).localeCompare(String(bv), "en", { numeric: true, sensitivity: "base" });
    }
    return dir === "desc" ? -cmp : cmp;
  };

  rows.sort((a, b) => {
    if (primary) {
      const c = compare(a, b, primary, filters.sort_dir);
      if (c !== 0) return c;
    }
    if (secondary) {
      const c = compare(a, b, secondary, filters.then_dir);
      if (c !== 0) return c;
    }
    return String(a.student.full_name ?? "").localeCompare(
      String(b.student.full_name ?? ""),
      "en",
      { numeric: true, sensitivity: "base" }
    );
  });
}

/** Project sorted rows into the flat cell matrix every output format shares. */
export function toMatrix(
  rows: readonly ReportRow[],
  fields: readonly ReportField[]
): { headers: string[]; body: (string | number | null)[][] } {
  return {
    headers: fields.map((f) => f.label),
    body: rows.map((row) => fields.map((f) => f.resolve(row))),
  };
}
