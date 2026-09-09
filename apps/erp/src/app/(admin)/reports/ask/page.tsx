"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CornerDownLeft,
  Download,
  Loader2,
  ShieldAlert,
  Sparkles,
  Table2,
} from "lucide-react";
import { adminFetch } from "@nkps/shared/lib/admin-api";

/**
 * Ask-your-school.
 *
 * A natural-language front door onto the report builder — same data, same
 * `reports` permission, same export audit trail. The assistant never sees the
 * full result set: it works from counts and a short preview, and the table
 * below is fetched separately under a fresh authorization check.
 */

interface Turn {
  role: "user" | "assistant";
  content: string;
  runId?: string | null;
}

interface TableState {
  runId: string;
  headers: string[];
  rows: (string | number | null)[][];
  total: number;
}

const EXAMPLES = [
  "Class IX students with fees pending who don't take the bus",
  "How many students per class are below 75% attendance?",
  "New admissions this session, with father's name and phone",
  "Students in Class XI Science sorted by admission number",
];

export default function AskPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [allowSensitive, setAllowSensitive] = useState(false);
  const [table, setTable] = useState<TableState | null>(null);
  const [tableBusy, setTableBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, table]);

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || busy) return;

    setError(null);
    setInput("");
    setTable(null);
    const history = turns.map((t) => ({ role: t.role, content: t.content }));
    setTurns((prev) => [...prev, { role: "user", content: trimmed }]);
    setBusy(true);

    try {
      const res = await adminFetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history,
          allow_sensitive: allowSensitive,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "That didn't work.");
        return;
      }

      setTurns((prev) => [
        ...prev,
        { role: "assistant", content: data.reply, runId: data.run_id },
      ]);
      if (data.run_id) void loadTable(data.run_id);
    } catch {
      setError("Couldn't reach the assistant. The report builder still works.");
    } finally {
      setBusy(false);
    }
  }

  async function loadTable(runId: string) {
    setTableBusy(true);
    try {
      const res = await adminFetch(`/api/ai/ask/${runId}/table?page_size=50`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't load the table.");
        return;
      }
      setTable({
        runId,
        headers: data.headers,
        rows: data.rows,
        total: data.total,
      });
    } catch {
      setError("Couldn't load the table.");
    } finally {
      setTableBusy(false);
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
          <span className="font-medium text-navy-900">
            Include personal columns
          </span>
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
                onClick={() => void ask(example)}
                className="rounded-md border px-3 py-2 text-left text-sm text-muted-foreground transition hover:border-blue-400 hover:text-navy-900"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 space-y-4 overflow-y-auto">
        {turns.map((turn, i) => (
          <div
            key={i}
            className={
              turn.role === "user"
                ? "ml-auto max-w-[75%] rounded-lg bg-navy-900 px-4 py-2.5 text-sm text-white"
                : "max-w-[85%] rounded-lg border bg-white px-4 py-3 text-sm whitespace-pre-wrap text-navy-900"
            }
          >
            {turn.content}
          </div>
        ))}

        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Working through the records…
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {(table || tableBusy) && (
          <div className="rounded-lg border bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
              <div className="flex items-center gap-2 text-sm font-medium text-navy-900">
                <Table2 className="h-4 w-4 text-blue-600" />
                {table
                  ? `${table.total.toLocaleString("en-IN")} student${table.total === 1 ? "" : "s"}`
                  : "Loading…"}
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
        )}

        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
        className="flex items-center gap-2 rounded-lg border bg-white p-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
          placeholder="e.g. Class VIII students who haven't paid Term 2"
          className="flex-1 bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-40"
        >
          Ask
          <CornerDownLeft className="h-3.5 w-3.5" />
        </button>
      </form>

      <p className="text-xs text-muted-foreground">
        The assistant only ever sees a short preview of the rows — the table
        above is fetched separately and re-checks your access. Every download is
        logged like any other export.
      </p>
    </div>
  );
}
