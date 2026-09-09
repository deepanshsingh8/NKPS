import { z } from "zod";
import { computeFinalResult } from "@/lib/final-result";
import { getStudentOutstandingDues } from "@/lib/student-dues";
import { computeAttendanceSummary } from "@nkps/shared/lib/attendance-summary";
import type { CallerContext } from "../caller-context";
import { toolError, NOT_YOUR_CHILD_MESSAGE, type ToolError } from "../tool-errors";
import { recordToolCall } from "../audit";

/**
 * The parent assistant's entire tool surface.
 *
 * Seven narrow, read-only tools. Deliberately NOT run_student_report — a
 * parent gets purpose-built lookups for their own children, never a query
 * interface over the student corpus.
 *
 * ── The one rule everything else rests on ───────────────────────────────────
 * Every tool that names a student validates it against `ctx.scope.studentIds`,
 * which the server resolved from student_parents before the model ran. The
 * model may emit any student_id it likes; it will be rejected. Scope is not
 * something the model can widen, because it is not in anything the model
 * writes.
 *
 * ── Why "not found" and "not yours" say the same thing ──────────────────────
 * Distinguishing them turns the assistant into a student-enumeration oracle: a
 * parent could probe admission numbers and learn which ones exist from the
 * difference in wording. The audit row records which case it actually was.
 *
 * ── Published results only ──────────────────────────────────────────────────
 * computeFinalResult is called with includeUnpublished:false, hard-coded at
 * the call site. It is never threaded from tool input — a privacy gate a model
 * can set is not a gate.
 */

export const parentToolInputs = {
  get_my_children: z.object({}),
  get_child_attendance: z.object({
    student_id: z.string(),
    from: z.string().optional(),
    to: z.string().optional(),
  }),
  get_child_fees: z.object({ student_id: z.string() }),
  get_child_results: z.object({ student_id: z.string() }),
  get_child_timetable: z.object({
    student_id: z.string(),
    weekday: z.number().int().min(1).max(6).optional(),
  }),
  get_child_ptm_notes: z.object({ student_id: z.string() }),
  get_school_calendar: z.object({ from: z.string().optional() }),
};

export type ParentToolName = keyof typeof parentToolInputs;

/**
 * The gate. Every student-scoped tool calls this first.
 *
 * Returns the same error whether the student does not exist or simply is not
 * this caller's — see the header.
 */
function assertWard(ctx: CallerContext, studentId: unknown): ToolError | null {
  if (ctx.scope.kind !== "students") {
    return toolError("scope_violation", NOT_YOUR_CHILD_MESSAGE);
  }
  if (typeof studentId !== "string" || !ctx.scope.studentIds.includes(studentId)) {
    return toolError("not_your_child", NOT_YOUR_CHILD_MESSAGE);
  }
  return null;
}

export async function executeParentTool(
  ctx: CallerContext,
  name: string,
  input: Record<string, unknown>,
  messageSeq: number | null
): Promise<{ ok: true; data: unknown } | { ok: false; error: ToolError }> {
  const started = Date.now();
  const log = (rowCount: number | null, errorCode?: string) =>
    recordToolCall({
      admin: ctx.admin,
      conversationId: ctx.conversationId,
      messageSeq,
      toolName: name,
      argsRaw: input,
      scopeApplied: { kind: ctx.scope.kind },
      rowCount,
      durationMs: Date.now() - started,
      errorCode: errorCode ?? null,
    });

  // Every tool except these two names a student, and every one of those is
  // gated before it touches the database.
  if (name !== "get_my_children" && name !== "get_school_calendar") {
    const violation = assertWard(ctx, input.student_id);
    if (violation) {
      await log(null, violation.code);
      return { ok: false, error: violation };
    }
  }

  const studentId = input.student_id as string;

  switch (name) {
    case "get_my_children": {
      const ids = ctx.scope.kind === "students" ? [...ctx.scope.studentIds] : [];
      if (ids.length === 0) {
        await log(0);
        return { ok: true, data: { children: [] } };
      }
      const { data } = await ctx.admin
        .from("student_enrollments")
        .select("student_id, roll_number, students(full_name), classes(name, section)")
        .eq("academic_year_id", ctx.sessionId)
        .in("student_id", ids);

      const children = (data ?? []).map((row) => {
        const s = row.students as unknown as { full_name?: string } | null;
        const c = row.classes as unknown as { name?: string; section?: string } | null;
        return {
          student_id: row.student_id as string,
          name: s?.full_name ?? "Unknown",
          class: c ? `${c.name ?? ""}${c.section ? `-${c.section}` : ""}` : null,
          roll_number: (row.roll_number as string | null) ?? null,
        };
      });
      await log(children.length);
      return { ok: true, data: { children } };
    }

    case "get_child_attendance": {
      const summary = await computeAttendanceSummary(ctx.admin, studentId, {
        academicYearId: ctx.sessionId,
        from: typeof input.from === "string" ? input.from : undefined,
        to: typeof input.to === "string" ? input.to : undefined,
      });
      await log(summary.totalDays);
      return {
        ok: true,
        data: {
          // percent is null when nothing was ever marked. Say so rather than
          // reporting 0% — "no attendance taken" and "attended nothing" are
          // very different things to tell a parent.
          percent: summary.percent,
          present: summary.presentDays,
          absent: summary.absentDays,
          late: summary.lateDays,
          half_days: summary.halfDays,
          days_marked: summary.totalDays,
          note:
            summary.totalDays === 0
              ? "No attendance has been marked for this session yet."
              : undefined,
        },
      };
    }

    case "get_child_fees": {
      // Reuses the same helper the dues screen and the download gate use, so
      // the number a parent is told matches the number the office sees.
      const dues = await getStudentOutstandingDues(ctx.admin, studentId);
      await log(1);
      return {
        ok: true,
        data: {
          outstanding: dues.total,
          has_outstanding: dues.hasOutstanding,
          currency: "INR",
          note: "Amounts are as recorded by the school office. For a payment query, contact the office.",
        },
      };
    }

    case "get_child_results": {
      const result = await computeFinalResult(ctx.admin, {
        student_id: studentId,
        academic_year_id: ctx.sessionId,
        // Hard-coded. Never from tool input. See the header.
        includeUnpublished: false,
      });
      await log(result ? 1 : 0);
      if (!result) {
        return {
          ok: true,
          data: { published: false, note: "No published results for this session yet." },
        };
      }
      return {
        ok: true,
        data: {
          published: true,
          overall_percent: result.overall.main_total_pct,
          grade: result.overall.grade,
          division: result.overall.division,
          passed: result.overall.passed,
          subjects: result.main_subjects.map((s) => ({
            name: s.subject_name,
            percent: s.final_pct,
            grade: s.grade,
          })),
        },
      };
    }

    case "get_child_timetable": {
      const { data: enrollment } = await ctx.admin
        .from("student_enrollments")
        .select("class_id")
        .eq("student_id", studentId)
        .eq("academic_year_id", ctx.sessionId)
        .maybeSingle();

      if (!enrollment?.class_id) {
        await log(0);
        return { ok: true, data: { periods: [], note: "No class assigned for this session." } };
      }

      let query = ctx.admin
        .from("timetable_periods")
        .select("day_of_week, period_number, start_time, end_time, is_break, subjects(name)")
        .eq("class_id", enrollment.class_id)
        .order("day_of_week")
        .order("period_number");

      if (typeof input.weekday === "number") {
        query = query.eq("day_of_week", input.weekday);
      }

      const { data } = await query;
      const periods = (data ?? []).map((p) => {
        const subject = p.subjects as unknown as { name?: string } | null;
        return {
          day_of_week: p.day_of_week as number,
          period: p.period_number as number,
          from: p.start_time as string,
          to: p.end_time as string,
          subject: p.is_break ? "Break" : (subject?.name ?? null),
        };
      });
      await log(periods.length);
      return { ok: true, data: { periods } };
    }

    case "get_child_ptm_notes": {
      const { data } = await ctx.admin
        .from("ptm_notes")
        .select("meeting_date, attendance, teacher_remarks, action_points")
        .eq("student_id", studentId)
        .order("meeting_date", { ascending: false })
        .limit(5);
      await log((data ?? []).length);
      return {
        ok: true,
        data: {
          // parent_remarks deliberately omitted: it is the office's record of
          // what was said, not something to read back at the family.
          meetings: (data ?? []).map((n) => ({
            date: n.meeting_date as string,
            attended: n.attendance === "present",
            teacher_remarks: (n.teacher_remarks as string | null) ?? null,
            action_points: (n.action_points as string | null) ?? null,
          })),
        },
      };
    }

    case "get_school_calendar": {
      const from =
        typeof input.from === "string"
          ? input.from
          : new Date().toISOString().slice(0, 10);
      const { data } = await ctx.admin
        .from("calendar_events")
        .select("title, event_type, start_date, end_date")
        .gte("start_date", from)
        .order("start_date")
        .limit(20);
      await log((data ?? []).length);
      return {
        ok: true,
        data: {
          events: (data ?? []).map((e) => ({
            title: e.title as string,
            type: e.event_type as string,
            from: e.start_date as string,
            to: (e.end_date as string | null) ?? null,
          })),
        },
      };
    }

    default:
      await log(null, "query_failed");
      return {
        ok: false,
        error: toolError("query_failed", `Unknown tool "${name}".`),
      };
  }
}
