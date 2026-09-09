import type Anthropic from "@anthropic-ai/sdk";
import { getAiClient, AI_MODELS, AI_EFFORT, AI_BUDGETS, AI_MAX_TOKENS } from "./client";
import type { CallerContext } from "./caller-context";
import { recordMessage, recordToolCall, finishConversation, nextMessageSeq } from "./audit";
import { isRecoverable, renderToolError, type ToolErrorCode } from "./tool-errors";
import { executeRunStudentReport } from "./tools/report";
import {
  executeListClasses,
  executeListExamTypes,
  executeListAcademicSessions,
  executeListLookupValues,
  type LookupKind,
} from "./tools/lookups";

/**
 * The agentic loop for Ask-your-school.
 *
 * Written by hand rather than with the SDK's tool runner because three things
 * here are not optional and all of them live inside the loop: a wall-clock and
 * tool-call budget, an audit row per tool call written before execution, and a
 * per-tool retry cap keyed on whether the error is recoverable at all. A
 * scope violation must not become a retry loop against the same wall.
 */

const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "run_student_report",
    description:
      "Run a student report and get back counts, optional group rollups, and a small preview. Use group_by for questions about totals or distributions rather than requesting more preview rows.",
    input_schema: {
      type: "object",
      properties: {
        filters: {
          type: "object",
          description:
            "Filter object. Omit session_id unless the user asked about a past year. class_ids, stream_id, house_id and subject_id are uuids — look them up first.",
        },
        preview_rows: {
          type: "number",
          description: "Rows to show (0-25, default 10). Not the full result.",
        },
        group_by: {
          type: "array",
          items: { type: "string" },
          description:
            "Up to 2 column keys to count by. The cheap way to answer 'how many per class'.",
        },
        purpose: {
          type: "string",
          description: "One line: what the user actually asked for. Logged.",
        },
      },
      required: ["filters", "purpose"],
    },
  },
  {
    name: "list_classes",
    description: "Classes in the current session that you may query, with their ids.",
    input_schema: { type: "object", properties: {}, additionalProperties: false, required: [] },
    strict: true,
  },
  {
    name: "list_exam_types",
    description: "Exam types in the current session, with their ids.",
    input_schema: { type: "object", properties: {}, additionalProperties: false, required: [] },
    strict: true,
  },
  {
    name: "list_academic_sessions",
    description: "All academic sessions, newest first, flagging the current one.",
    input_schema: { type: "object", properties: {}, additionalProperties: false, required: [] },
    strict: true,
  },
  {
    name: "list_lookup_values",
    description:
      "The values actually present for a filter that matches free text or ids. Call this before filtering on gender, category, religion, minority_group or area_type.",
    input_schema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: [
            "stream", "house", "subject",
            "category", "religion", "gender", "area_type", "minority_group",
          ],
        },
      },
      additionalProperties: false,
      required: ["kind"],
    },
    strict: true,
  },
];

/** One `run_student_report` call the model made, in the order it made them. */
export interface AskRun {
  runId: string;
  /** The model's own stated intent, verbatim. Labels the table in the UI. */
  purpose: string;
  total: number;
}

export interface AskTurnResult {
  text: string;
  /**
   * EVERY report the turn produced, not just the last.
   *
   * Reporting only the last one was wrong twice over. The model routinely
   * cross-checks itself — count the students without transport, then count the
   * ones with it to prove the two sum to the roll — so the final query is
   * frequently not the one the answer is about; the user reads "198 have not
   * opted" above a table of 744 who have. And when the model issues two report
   * calls in the same round they execute in parallel, so "last" was decided by
   * whichever promise happened to settle second.
   *
   * The UI shows the last as the default and lets the user switch, each run
   * labelled with its purpose and row count.
   */
  runs: AskRun[];
  toolCalls: number;
  stoppedBy: "end_turn" | "budget" | "error";
}

export async function runAskTurn(
  ctx: CallerContext,
  systemPrompt: string,
  history: Anthropic.MessageParam[],
  userMessage: string
): Promise<AskTurnResult> {
  const client = getAiClient();
  const deadline = Date.now() + AI_BUDGETS.maxWallClockMs;

  const messages: Anthropic.MessageParam[] = [
    ...history,
    { role: "user", content: userMessage },
  ];

  // Never history.length: see nextMessageSeq for why the client's idea of
  // history cannot be trusted to produce a unique sequence.
  let seq = await nextMessageSeq(ctx.admin, ctx.conversationId);
  await recordMessage({
    admin: ctx.admin,
    conversationId: ctx.conversationId,
    seq,
    role: "user",
    content: userMessage,
  });

  let toolCalls = 0;
  const runs: AskRun[] = [];
  const retries = new Map<string, number>();

  for (;;) {
    if (Date.now() > deadline || toolCalls >= AI_BUDGETS.maxToolCalls) {
      await finishConversation(ctx.admin, ctx.conversationId, "aborted", "budget_exhausted");
      return {
        text:
          runs.length > 0
            ? "That took longer than I allow for one question. I've kept the results I did get — try narrowing the question."
            : "That took longer than I allow for one question. Try asking for something narrower.",
        runs,
        toolCalls,
        stoppedBy: "budget",
      };
    }

    const startedAt = Date.now();
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: AI_MODELS.ask,
        max_tokens: AI_MAX_TOKENS,
        thinking: { type: "adaptive" },
        output_config: { effort: AI_EFFORT.ask },
        // Cache the stable prefix: tool definitions and the system prompt.
        // Everything volatile is in `messages`, after this breakpoint.
        system: [
          { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
        ],
        tools: TOOL_DEFINITIONS,
        messages,
      });
    } catch (err) {
      console.error("[ai.runner] model call failed:", err);
      await finishConversation(ctx.admin, ctx.conversationId, "error", "model_error");
      return {
        text: "I couldn't reach the assistant just now. The report builder under Reports still works.",
        runs,
        toolCalls,
        stoppedBy: "error",
      };
    }

    seq += 1;
    await recordMessage({
      admin: ctx.admin,
      conversationId: ctx.conversationId,
      seq,
      role: "assistant",
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? undefined,
      cacheWriteTokens: response.usage.cache_creation_input_tokens ?? undefined,
      stopReason: response.stop_reason,
      latencyMs: Date.now() - startedAt,
    });

    messages.push({ role: "assistant", content: response.content });

    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    if (toolUses.length === 0) {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      await finishConversation(ctx.admin, ctx.conversationId, "completed");
      return { text, runs, toolCalls, stoppedBy: "end_turn" };
    }

    // Execute in parallel, then return EVERY result in one user message.
    // Splitting them across messages teaches the model to stop making parallel
    // calls, and dropping a failed one leaves a dangling tool_use.
    const settled = await Promise.all(
      toolUses.map(async (use) => {
        toolCalls += 1;
        const outcome = await executeTool(ctx, use, seq);

        if (!outcome.ok) {
          const attempts = (retries.get(use.name) ?? 0) + 1;
          retries.set(use.name, attempts);
          const exhausted =
            !isRecoverable(outcome.code) || attempts > AI_BUDGETS.maxToolRetries;
          return {
            block: {
              type: "tool_result" as const,
              tool_use_id: use.id,
              is_error: true,
              content: exhausted
                ? `${outcome.body}\nNo further attempts. Explain this to the user.`
                : outcome.body,
            },
            run: null,
          };
        }

        return {
          block: {
            type: "tool_result" as const,
            tool_use_id: use.id,
            content: outcome.body,
          },
          run: outcome.run ?? null,
        };
      })
    );

    // Promise.all preserves the ARRAY order, so runs are appended in the order
    // the model asked for them rather than the order they happened to finish.
    for (const { run } of settled) if (run) runs.push(run);

    messages.push({ role: "user", content: settled.map((r) => r.block) });
  }
}

type ToolOutcome =
  | { ok: true; body: string; run?: AskRun | null }
  | { ok: false; code: ToolErrorCode; body: string };

async function executeTool(
  ctx: CallerContext,
  use: Anthropic.ToolUseBlock,
  messageSeq: number
): Promise<ToolOutcome> {
  // Tool inputs are parsed as JSON by the SDK; never string-match them.
  const input = use.input as Record<string, unknown>;
  const started = Date.now();

  switch (use.name) {
    case "run_student_report": {
      const outcome = await executeRunStudentReport(ctx, input, messageSeq);
      if (!outcome.ok) {
        return {
          ok: false,
          code: outcome.error.code,
          body: renderToolError(outcome.error),
        };
      }
      return {
        ok: true,
        body: JSON.stringify(outcome.result),
        run: outcome.result.run_id
          ? {
              runId: outcome.result.run_id,
              // `purpose` is required on the tool and already logged verbatim;
              // reusing it as the table's label costs nothing and means the
              // chip reads "students without transport" rather than a uuid.
              purpose:
                typeof input.purpose === "string" && input.purpose.trim()
                  ? input.purpose.trim()
                  : "Report",
              total: outcome.result.total,
            }
          : null,
      };
    }

    case "list_classes":
    case "list_exam_types":
    case "list_academic_sessions":
    case "list_lookup_values": {
      const data =
        use.name === "list_classes"
          ? await executeListClasses(ctx)
          : use.name === "list_exam_types"
            ? await executeListExamTypes(ctx)
            : use.name === "list_academic_sessions"
              ? await executeListAcademicSessions(ctx)
              : await executeListLookupValues(ctx, input.kind as LookupKind);

      await recordToolCall({
        admin: ctx.admin,
        conversationId: ctx.conversationId,
        messageSeq,
        toolName: use.name,
        argsRaw: input,
        durationMs: Date.now() - started,
      });
      return { ok: true, body: JSON.stringify(data) };
    }

    default:
      return {
        ok: false,
        code: "query_failed",
        body: `error: unknown tool "${use.name}"`,
      };
  }
}
