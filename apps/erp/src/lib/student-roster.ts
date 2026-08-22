// Session-scoped student roster: "who was enrolled in this academic year".
//
// The students LIST deliberately does something different — it picks one
// representative enrollment per student by a heuristic and never hard-filters
// by year (see api/students/route.ts), because an admin looking for a name
// must find it whatever state that student is in. That is right for a working
// list and wrong for anything that has to be true of one session: a roster or
// an export labelled "Class XI, 2024-25" must contain exactly the students
// enrolled then — including the ones who have since left the school and been
// marked alumni, whom the working list excludes by design.
//
// Both the list's session view and the server-side export read this module,
// so the two can never disagree about who was in a class.

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * PostgREST puts `in.(…)` in the URL, and the platform caps a URL at 8KB.
 * At ~37 chars per UUID, 200 ids is ~7.4KB — comfortably under, with room for
 * the rest of the query string. Exceed it and the request does not error, it
 * silently returns nothing.
 */
const ID_CHUNK = 200;

/** PostgREST caps a response at 1000 rows unless an explicit range is given. */
const ROW_CAP = 9999;

export function chunkIds(ids: readonly string[]): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    chunks.push(ids.slice(i, i + ID_CHUNK));
  }
  return chunks;
}

/**
 * `table.select(columns).in(column, ids)` without the URL blowup — the chunks
 * are independent, so they go out together rather than one after another.
 */
export async function selectByIds<Row>(
  admin: SupabaseClient,
  table: string,
  column: string,
  ids: readonly string[],
  columns: string
): Promise<Row[]> {
  if (ids.length === 0) return [];
  const results = await Promise.all(
    chunkIds(ids).map((chunk) =>
      admin.from(table).select(columns).in(column, chunk)
    )
  );
  const rows: Row[] = [];
  for (const { data, error } of results) {
    if (error) throw new Error(`${table} lookup failed: ${error.message}`);
    if (data) rows.push(...(data as Row[]));
  }
  return rows;
}

export interface RosterClass {
  id: string;
  name: string;
  section: string;
  stream_id: string | null;
}

export interface RosterEnrollment {
  id: string;
  student_id: string;
  class_id: string | null;
  stream_id: string | null;
  roll_number: number | null;
  roll_number_manual: boolean | null;
  status: string | null;
  status_reason: string | null;
  status_changed_at: string | null;
  academic_year_id: string | null;
  updated_at: string | null;
  has_transport: boolean | null;
  bus_stop_id: string | null;
  bus_id: string | null;
  transport_direction: string | null;
}

const ENROLLMENT_COLUMNS =
  "id, student_id, class_id, stream_id, roll_number, roll_number_manual, status, status_reason, status_changed_at, academic_year_id, updated_at, has_transport, bus_stop_id, bus_id, transport_direction";

export interface SessionRosterRow extends Record<string, unknown> {
  id: string;
  enrollment_id: string | null;
  class_id: string | null;
  class_name: string | null;
  class_section: string | null;
  stream_id: string | null;
  roll_number: number | null;
  enrollment_status: string | null;
  has_transport: boolean;
  bus_stop_id: string | null;
  bus_id: string | null;
  transport_direction: string | null;
}

export interface SessionRosterOptions {
  academicYearId: string;
  /** Restrict to these classes. Bounded (~40 per year), so safe to pass to `.in`. */
  classIds?: readonly string[];
  /** Enrollment statuses to keep. Omit for all of them. */
  statuses?: readonly string[];
  /** Columns to read off `students`. Defaults to everything. */
  studentColumns?: string;
}

export async function fetchSessionClasses(
  admin: SupabaseClient,
  academicYearId: string
): Promise<RosterClass[]> {
  const { data, error } = await admin
    .from("classes")
    .select("id, name, section, stream_id")
    .eq("academic_year_id", academicYearId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(`classes lookup failed: ${error.message}`);
  return (data as RosterClass[]) ?? [];
}

/**
 * Every student enrolled in `academicYearId`, merged with their enrollment.
 *
 * Narrowing is done by `class_id` — bounded at roughly forty rows a year — and
 * never by `student_id`, which would be hundreds of UUIDs and overrun the URL.
 */
export async function fetchSessionRoster(
  admin: SupabaseClient,
  {
    academicYearId,
    classIds,
    statuses,
    studentColumns = "*",
  }: SessionRosterOptions
): Promise<SessionRosterRow[]> {
  let query = admin
    .from("student_enrollments")
    .select(ENROLLMENT_COLUMNS)
    .eq("academic_year_id", academicYearId)
    .range(0, ROW_CAP);

  if (classIds) {
    if (classIds.length === 0) return [];
    query = query.in("class_id", [...classIds]);
  }
  if (statuses && statuses.length > 0) {
    query = query.in("status", [...statuses]);
  }

  const [enrollmentsRes, classes] = await Promise.all([
    query,
    fetchSessionClasses(admin, academicYearId),
  ]);

  if (enrollmentsRes.error) {
    throw new Error(`enrollments lookup failed: ${enrollmentsRes.error.message}`);
  }
  const enrollments = (enrollmentsRes.data as RosterEnrollment[]) ?? [];
  if (enrollments.length === 0) return [];

  // A student can hold more than one enrollment in a year (the uniqueness
  // constraint is per class, not per year), so pick one: active beats a closed
  // status, then the most recently touched row.
  const byStudent = new Map<string, RosterEnrollment>();
  for (const enrollment of enrollments) {
    const held = byStudent.get(enrollment.student_id);
    if (!held) {
      byStudent.set(enrollment.student_id, enrollment);
      continue;
    }
    const rank = (e: RosterEnrollment) => (e.status === "active" ? 0 : 1);
    if (rank(enrollment) < rank(held)) {
      byStudent.set(enrollment.student_id, enrollment);
      continue;
    }
    if (rank(enrollment) === rank(held)) {
      const a = new Date(enrollment.updated_at ?? 0).getTime();
      const b = new Date(held.updated_at ?? 0).getTime();
      if (a > b) byStudent.set(enrollment.student_id, enrollment);
    }
  }

  // No `is_alumni` filter here, deliberately: a student who has since
  // graduated or left was still on this session's roll, and omitting them is
  // exactly the silent wrongness this module exists to prevent.
  const students = await selectByIds<Record<string, unknown>>(
    admin,
    "students",
    "id",
    [...byStudent.keys()],
    studentColumns
  );

  const classById = new Map(classes.map((c) => [c.id, c]));

  return students
    .map((student): SessionRosterRow => {
      const enrollment = byStudent.get(student.id as string);
      const cls = enrollment?.class_id
        ? (classById.get(enrollment.class_id) ?? null)
        : null;
      return {
        ...student,
        id: student.id as string,
        enrollment_id: enrollment?.id ?? null,
        class_id: enrollment?.class_id ?? null,
        class_name: cls?.name ?? null,
        class_section: cls?.section ?? null,
        stream_id: enrollment?.stream_id ?? null,
        roll_number: enrollment?.roll_number ?? null,
        roll_number_manual: enrollment?.roll_number_manual ?? false,
        enrollment_status: enrollment?.status ?? null,
        enrollment_academic_year_id: academicYearId,
        status_reason: enrollment?.status_reason ?? null,
        status_changed_at: enrollment?.status_changed_at ?? null,
        has_transport: enrollment?.has_transport ?? false,
        bus_stop_id: enrollment?.bus_stop_id ?? null,
        bus_id: enrollment?.bus_id ?? null,
        transport_direction: enrollment?.transport_direction ?? null,
      };
    })
    .sort((a, b) =>
      String(a.full_name ?? "").localeCompare(String(b.full_name ?? ""))
    );
}
