"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Copy,
  CornerDownLeft,
  Download,
  Loader2,
  Pencil,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Square,
  Table2,
} from "lucide-react";
import { adminFetch } from "@nkps/shared/lib/admin-api";
import { ChatMarkdown } from "@/components/ChatMarkdown";

/**
 * Ask-your-school.
 *
 * A natural-language front door onto the report builder — same data, same
 * `reports` permission, same export audit trail. The assistant never sees the
 * full result set: it works from counts and a short preview, and the table
 * is fetched separately under a fresh authorization check.
 *
 * ── Everything hangs off the message, not the page ──────────────────────────
 * Runs, table and errors used to be page-level singletons, so the answer you
 * were reading and the table underneath it were only related by both being the
 * most recent thing. Asking a second question wiped the first answer's table
 * out from under it. Each assistant message now owns its own runs, table and
 * failure state, which is also what makes regenerate and edit-and-resend
 * possible: replacing one message cannot leave another's table behind.
 */

/** One report the assistant ran, labelled with the intent it gave for it. */
interface AskRun {
  runId: string;
  purpose: string;
  total: number;
}

interface TableState {
  runId: string;
  headers: string[];
  rows: (string | number | null)[][];
  total: number;
}

interface Turn {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Assistant only. Every report the turn ran, in the order it ran them. */
  runs?: AskRun[];
  activeRunId?: string | null;
  table?: TableState | null;
  tableBusy?: boolean;
  /** The turn failed outright. Shown in place, with a way to try again. */
  error?: string | null;
  /** The user hit Stop. Distinguished from an error: nothing went wrong. */
  stopped?: boolean;
}

const EXAMPLES = [
  "Class IX students with fees pending who don't take the bus",
  "How many students per class are below 75% attendance?",
  "New admissions this session, with father's name and phone",
  "Students in Class XI Science sorted by admission number",
];

const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

export default function AskPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [allowSensitive, setAllowSensitive] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  // An in-flight request outlives the page otherwise, and its state updates
  // land on an unmounted tree.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    []
  );

  const patchTurn = useCallback((id: string, patch: Partial<Turn>) => {
    setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const loadTable = useCallback(
    async (turnId: string, runId: string) => {
      patchTurn(turnId, { tableBusy: true, activeRunId: runId });
      try {
        const res = await adminFetch(`/api/ai/ask/${runId}/table?page_size=50`);
        const data = await res.json();
        if (!res.ok) {
          patchTurn(turnId, {
            tableBusy: false,
            error: data.error ?? "Couldn't load the table.",
          });
          return;
        }
        patchTurn(turnId, {
          tableBusy: false,
          table: {
            runId,
            headers: data.headers,
            rows: data.rows,
            total: data.total,
          },
        });
      } catch {
        patchTurn(turnId, {
          tableBusy: false,
          error: "Couldn't load the table.",
        });
      }
    },
    [patchTurn]
  );

  /**
   * Run one turn on top of `prefix`, which becomes the whole transcript.
   *
   * Every entry point funnels through here — asking, regenerating, and saving
   * an edit differ only in the prefix they hand over. Regenerating is "the
   * same question with the transcript truncated before its answer"; editing is
   * "a different question with the transcript truncated before it".
   */
  const runTurn = useCallback(
    async (prefix: Turn[], question: string) => {
      const trimmed = question.trim();
      if (!trimmed) return;

      // Starting anything cancels whatever is still running. This is what
      // makes "stop and ask something else" a single action.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const assistantId = newId();
      setTurns([
        ...prefix,
        { id: newId(), role: "user", content: trimmed },
        { id: assistantId, role: "assistant", content: "" },
      ]);
      setBusy(true);

      try {
        const res = await adminFetch("/api/ai/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            message: trimmed,
            history: prefix.map((t) => ({ role: t.role, content: t.content })),
            allow_sensitive: allowSensitive,
          }),
        });
        const data = await res.json();

        if (!res.ok) {
          patchTurn(assistantId, { error: data.error ?? "That didn't work." });
          return;
        }

        const runs: AskRun[] = (data.runs ?? []).map(
          (r: { run_id: string; purpose: string; total: number }) => ({
            runId: r.run_id,
            purpose: r.purpose,
            total: r.total,
          })
        );
        const shown = runs[runs.length - 1];

        patchTurn(assistantId, {
          content: data.reply,
          runs,
          activeRunId: shown?.runId ?? null,
          tableBusy: Boolean(shown),
        });

        if (shown) void loadTable(assistantId, shown.runId);
      } catch {
        // An abort is the user's own doing, not a failure to report as one.
        if (controller.signal.aborted) {
          patchTurn(assistantId, { stopped: true });
        } else {
          patchTurn(assistantId, {
            error:
              "Couldn't reach the assistant. The report builder still works.",
          });
        }
      } finally {
        // Only the request that still owns the slot may clear it — a stale
        // abort must not switch off the composer for the turn that replaced it.
        if (abortRef.current === controller) {
          abortRef.current = null;
          setBusy(false);
        }
      }
    },
    [allowSensitive, patchTurn, loadTable]
  );

  function submit(question: string) {
    setInput("");
    void runTurn(turns, question);
  }

  function regenerate(assistantIndex: number) {
    const question = turns[assistantIndex - 1];
    if (!question || question.role !== "user") return;
    void runTurn(turns.slice(0, assistantIndex - 1), question.content);
  }

  function saveEdit(userIndex: number) {
    const next = editDraft.trim();
    setEditingId(null);
    if (!next) return;
    void runTurn(turns.slice(0, userIndex), next);
  }

  async function copy(turn: Turn) {
    try {
      await navigator.clipboard.writeText(turn.content);
      setCopiedId(turn.id);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopiedId(null), 1600);
    } catch {
      // Clipboard access can be refused; a failed copy needs no ceremony.
    }
  }

  return (
    <div className="flex h-full flex-col gap-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/reports"
            className="mb-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-blue-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Reports
          </Link>
          <h1 className="font-heading text-2xl font-semibold text-navy-900">
            Ask your school
          </h1>
          <p className="text-sm text-muted-foreground">
            Ask for a list in plain language. Same records, same permissions and
            same export log as the report builder.
          </p>
        </div>

        <label className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs">
          <input
            type="checkbox"
            checked={allowSensitive}
            onChange={(e) => setAllowSensitive(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          <span className="font-medium text-navy-900">Include PII</span>
          <span className="text-muted-foreground">
            Aadhaar, income, addresses, contact numbers
          </span>
        </label>
      </div>

      {turns.length === 0 && (
        <div className="rounded-lg border bg-white p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-navy-900">
            <Sparkles className="h-4 w-4 text-blue-600" />
            Try one of these
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => submit(example)}
                className="rounded-md border px-3 py-2 text-left text-sm text-muted-foreground transition hover:border-blue-400 hover:text-navy-900"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 space-y-4 overflow-y-auto">
        {turns.map((turn, i) =>
          turn.role === "user" ? (
            <div key={turn.id} className="group flex justify-end gap-2">
              {editingId === turn.id ? (
                <div className="w-full max-w-[75%] rounded-lg border bg-white p-2">
                  <textarea
                    value={editDraft}
                    autoFocus
                    onChange={(e) => setEditDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        saveEdit(i);
                      }
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    rows={2}
                    className="w-full resize-none bg-transparent px-1 py-0.5 text-sm text-navy-900 outline-none"
                  />
                  <div className="flex justify-end gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:text-navy-900"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => saveEdit(i)}
                      className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
                    >
                      Ask again
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Editing a question re-asks it and drops everything after,
                      so it is a rewind, not an in-place correction. */}
                  <button
                    type="button"
                    title="Edit and ask again"
                    onClick={() => {
                      setEditDraft(turn.content);
                      setEditingId(turn.id);
                    }}
                    className="mt-1 self-start rounded-md p-1.5 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-navy-900"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <div className="max-w-[75%] whitespace-pre-wrap rounded-lg bg-navy-900 px-4 py-2.5 text-sm text-white">
                    {turn.content}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div key={turn.id} className="max-w-[85%] space-y-2">
              {turn.content && (
                <div className="rounded-lg border bg-white px-4 py-3 text-sm text-navy-900">
                  <ChatMarkdown>{turn.content}</ChatMarkdown>
                </div>
              )}

              {!turn.content && !turn.error && !turn.stopped && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Working through the records…
                </div>
              )}

              {turn.stopped && !turn.content && (
                <div className="text-sm text-muted-foreground">
                  Stopped.{" "}
                  <button
                    type="button"
                    onClick={() => regenerate(i)}
                    className="underline underline-offset-2 hover:text-navy-900"
                  >
                    Ask it again
                  </button>
                </div>
              )}

              {turn.error && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{turn.error}</span>
                </div>
              )}

              <AnswerTable
                turn={turn}
                onSelectRun={(runId) => void loadTable(turn.id, runId)}
              />

              {(turn.content || turn.error) && (
                <div className="flex items-center gap-1">
                  {turn.content && (
                    <button
                      type="button"
                      onClick={() => void copy(turn)}
                      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:text-navy-900"
                    >
                      {copiedId === turn.id ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          Copy
                        </>
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => regenerate(i)}
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:text-navy-900"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Regenerate
                  </button>
                </div>
              )}
            </div>
          )
        )}

        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="flex items-end gap-2 rounded-lg border bg-white p-2"
      >
        {/* Never disabled while busy: interrupting with a new question is the
            point, and Stop is right there for abandoning one outright. */}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(input);
            }
          }}
          rows={1}
          placeholder="e.g. Class VIII students who haven't paid Term 2"
          className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
        />
        {busy ? (
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-navy-900 transition hover:border-red-400 hover:text-red-700"
          >
            <Square className="h-3 w-3 fill-current" />
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-40"
          >
            Ask
            <CornerDownLeft className="h-3.5 w-3.5" />
          </button>
        )}
      </form>

      <p className="text-xs text-muted-foreground">
        The assistant only ever sees a short preview of the rows — the table is
        fetched separately and re-checks your access. Every download is logged
        like any other export.
      </p>
    </div>
  );
}

/**
 * The full result set behind one answer.
 *
 * A turn can produce several reports: the assistant routinely counts one side
 * of a split and then the other to check its arithmetic. All of them are
 * offered, the last shown by default, and the header names the one on screen —
 * so an answer and the table under it cannot quietly disagree.
 */
function AnswerTable({
  turn,
  onSelectRun,
}: {
  turn: Turn;
  onSelectRun: (runId: string) => void;
}) {
  const runs = turn.runs ?? [];
  const table = turn.table ?? null;
  if (!table && !turn.tableBusy) return null;

  const activeRun = runs.find((r) => r.runId === turn.activeRunId) ?? null;

  return (
    <div className="rounded-lg border bg-white">
      {runs.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b bg-cream-50 px-4 py-2">
          <span className="mr-1 text-xs text-muted-foreground">
            {runs.length} reports ran — showing:
          </span>
          {runs.map((run) => (
            <button
              key={run.runId}
              type="button"
              onClick={() => onSelectRun(run.runId)}
              className={
                run.runId === turn.activeRunId
                  ? "rounded-full bg-blue-600 px-2.5 py-1 text-xs font-medium text-white"
                  : "rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition hover:border-blue-400 hover:text-navy-900"
              }
            >
              {run.purpose}
              <span className="ml-1.5 tabular-nums opacity-75">
                {run.total.toLocaleString("en-IN")}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-navy-900">
          <Table2 className="h-4 w-4 shrink-0 text-blue-600" />
          {table
            ? `${table.total.toLocaleString("en-IN")} student${table.total === 1 ? "" : "s"}`
            : "Loading…"}
          {table && activeRun && (
            <span className="font-normal text-muted-foreground">
              · {activeRun.purpose}
            </span>
          )}
          {table && table.rows.length < table.total && (
            <span className="font-normal text-muted-foreground">
              · showing first {table.rows.length}
            </span>
          )}
        </div>
        {table && (
          <a
            href={`/api/ai/ask/${table.runId}/export`}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium text-navy-900 transition hover:border-blue-400 hover:text-blue-700"
          >
            <Download className="h-3.5 w-3.5" />
            Download CSV
          </a>
        )}
      </div>

      {table && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-cream-50 text-left">
                {table.headers.map((header) => (
                  <th
                    key={header}
                    className="whitespace-nowrap px-3 py-2 text-xs font-medium text-muted-foreground"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, r) => (
                <tr key={r} className="border-b last:border-0">
                  {row.map((cell, c) => (
                    <td
                      key={c}
                      className="whitespace-nowrap px-3 py-2 text-navy-900 tabular-nums"
                    >
                      {cell ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
