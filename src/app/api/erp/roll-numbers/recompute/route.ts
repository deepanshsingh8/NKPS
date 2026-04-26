import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/shared/lib/verify-admin";
import { computeRanksForClass } from "@/lib/final-result";

type SortKey = "name" | "admission_no" | "previous_rank";

const SORT_KEYS: readonly SortKey[] = ["name", "admission_no", "previous_rank"];

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      class_id?: string;
      sort_key?: string;
    };

    if (!body.class_id || typeof body.class_id !== "string") {
      return NextResponse.json({ error: "class_id is required" }, { status: 400 });
    }
    if (!body.sort_key || !SORT_KEYS.includes(body.sort_key as SortKey)) {
      return NextResponse.json(
        { error: `sort_key must be one of: ${SORT_KEYS.join(", ")}` },
        { status: 400 }
      );
    }

    const classId = body.class_id;
    const sortKey = body.sort_key as SortKey;

    // `name` and `admission_no` use the in-DB function directly.
    if (sortKey === "name" || sortKey === "admission_no") {
      const { data, error } = await admin.rpc("recompute_roll_numbers", {
        p_class_id: classId,
        p_sort_key: sortKey,
      });
      if (error) {
        console.error("[roll-numbers.recompute] rpc:", error);
        return NextResponse.json(
          { error: "Failed to recompute roll numbers" },
          { status: 500 }
        );
      }
      return NextResponse.json({ updated_count: Number(data ?? 0) });
    }

    // `previous_rank`: resolve the class's academic year, fetch last year's
    // results for each currently-enrolled student, then pass an ordered
    // student_id list to `apply_roll_numbers`.
    const { data: classRow, error: classErr } = await admin
      .from("classes")
      .select("academic_year_id, academic_years:academic_year_id(start_date)")
      .eq("id", classId)
      .maybeSingle();

    if (classErr || !classRow?.academic_year_id) {
      console.error("class lookup error:", classErr);
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    // Previous academic year = the one whose start_date is immediately before
    // this class's academic year. Falls back to "no previous year" → every
    // student ends up unranked, which apply_roll_numbers will order by name.
    const currentStart = (classRow.academic_years as { start_date?: string } | null)
      ?.start_date;

    let previousYearId: string | null = null;
    if (currentStart) {
      const { data: prevYear } = await admin
        .from("academic_years")
        .select("id, start_date")
        .lt("start_date", currentStart)
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      previousYearId = prevYear?.id ?? null;
    }

    let orderedStudentIds: string[] = [];
    if (previousYearId) {
      // For each currently-active student in this class, find their
      // enrollment from the previous year (any class) and run the final-
      // result rank engine on that cohort.
      const { data: activeEnrollments } = await admin
        .from("student_enrollments")
        .select("student_id")
        .eq("class_id", classId)
        .eq("status", "active");

      const studentIds = (activeEnrollments ?? []).map((e) => e.student_id as string);

      if (studentIds.length > 0) {
        const { data: prevEnrollments } = await admin
          .from("student_enrollments")
          .select("student_id, class_id")
          .eq("academic_year_id", previousYearId)
          .in("student_id", studentIds);

        // Group last year's classes for each student, then compute ranks
        // per previous class once and map back to students.
        const classToStudents = new Map<string, string[]>();
        const studentToPrevClass = new Map<string, string>();
        for (const row of prevEnrollments ?? []) {
          const sid = row.student_id as string;
          const cid = row.class_id as string;
          studentToPrevClass.set(sid, cid);
          const arr = classToStudents.get(cid) ?? [];
          arr.push(sid);
          classToStudents.set(cid, arr);
        }

        // Compute rank map for each previous class once, reuse per student.
        const rankByStudent = new Map<string, number>();
        for (const prevClassId of classToStudents.keys()) {
          const rankMap = await computeRanksForClass(admin, {
            class_id: prevClassId,
            academic_year_id: previousYearId,
          });
          for (const [sid, rank] of rankMap.entries()) {
            rankByStudent.set(sid, rank);
          }
        }

        // Fetch names for deterministic tie-break / trailing ordering.
        const { data: studentRows } = await admin
          .from("students")
          .select("id, full_name")
          .in("id", studentIds);
        const nameById = new Map<string, string>();
        for (const row of studentRows ?? []) {
          nameById.set(row.id as string, (row.full_name as string) ?? "");
        }

        // Sort: ranked first (ascending rank, tie-break by name), unranked
        // after (ordered by name). apply_roll_numbers appends remaining
        // active students too, so this list needn't be exhaustive — but
        // being explicit keeps ordering predictable for debugging.
        const ranked: string[] = [];
        const unranked: string[] = [];
        for (const sid of studentIds) {
          if (rankByStudent.has(sid)) ranked.push(sid);
          else unranked.push(sid);
        }
        ranked.sort((a, b) => {
          const ra = rankByStudent.get(a) ?? Infinity;
          const rb = rankByStudent.get(b) ?? Infinity;
          if (ra !== rb) return ra - rb;
          return (nameById.get(a) ?? "").localeCompare(nameById.get(b) ?? "");
        });
        unranked.sort((a, b) =>
          (nameById.get(a) ?? "").localeCompare(nameById.get(b) ?? "")
        );

        orderedStudentIds = [...ranked, ...unranked];
      }
    }

    const { data, error } = await admin.rpc("apply_roll_numbers", {
      p_class_id: classId,
      p_ordered_student_ids: orderedStudentIds,
    });
    if (error) {
      console.error("[roll-numbers.recompute] apply_roll_numbers rpc:", error);
      return NextResponse.json(
        { error: "Failed to apply roll numbers" },
        { status: 500 }
      );
    }
    return NextResponse.json({ updated_count: Number(data ?? 0) });
  } catch (err) {
    console.error("roll-numbers/recompute error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
