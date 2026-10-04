"use client";

import { useState } from "react";
import { Download, Loader2, RefreshCw, Table2 } from "lucide-react";
import { toast } from "sonner";
import { adminFetch } from "@nkps/shared/lib/admin-api";
import { saveResponse } from "@nkps/shared/lib/table-export";
import type { Turn } from "./types";

/**
 * The full result set behind one answer.
 *
 * A turn can produce several reports: the assistant routinely counts one side
 * of a split and then the other to check its arithmetic. All of them are
 * offered, the last shown by default, and the header names the one on screen —
 * so an answer and the table under it cannot quietly disagree.
 *
 * A result handle lasts a day. Older chips keep their label and row count,
 * which live on the run row, and offer a re-run: the stored filters execute
 * again under a fresh authorization check and produce a new handle. The
 * wording is about freshness rather than mechanics, because "expired" is our
 * problem and "this may have changed" is the user's.
 */
export function AnswerTable({
  turn,
  onSelectRun,
  onRerun,
}: {
  turn: Turn;
  onSelectRun: (runId: string) => void;
  onRerun: (runId: string) => void;
}) {
  const [exporting, setExporting] = useState(false);
  const runs = turn.runs ?? [];
  const table = turn.table ?? null;
  if (runs.length === 0) return null;

  // A fetch, not a link: the export route authenticates by Bearer token, which
  // a plain <a href> cannot send — the link answered 401 every time, and with
  // no target it navigated the whole chat away to the error.
  async function downloadCsv(runId: string) {
    setExporting(true);
    try {
      const res = await adminFetch(`/api/ai/ask/${runId}/export`);
      const failure = await saveResponse(res, "assistant-report.csv", "Couldn't export the list");
      if (failure) toast.error(failure);
    } catch {
      toast.error("Couldn't export the list. Check your connection and try again.");
    } finally {
      setExporting(false);
    }
  }

  const activeRun = runs.find((r) => r.runId === turn.activeRunId) ?? null;

  return (
    <div className="rounded-lg border bg-white dark:bg-card">
      {runs.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b bg-cream-50 dark:bg-background px-4 py-2">
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
                  : run.expired
                    ? "rounded-full border border-dashed px-2.5 py-1 text-xs text-muted-foreground transition hover:border-blue-400"
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
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-navy-900 dark:text-white">
          {turn.tableBusy ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600 dark:text-blue-400" />
          ) : (
            <Table2 className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
          )}
          {table
            ? `${table.total.toLocaleString("en-IN")} student${table.total === 1 ? "" : "s"}`
            : turn.tableBusy
              ? "Loading the list…"
              : `${(activeRun?.total ?? 0).toLocaleString("en-IN")} students`}
          {/* Naming the query the table came from is what makes a mismatch
              with the answer visible instead of silent. */}
          {activeRun && (
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

        {table ? (
          <button
            type="button"
            disabled={exporting}
            onClick={() => void downloadCsv(table.runId)}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium text-navy-900 dark:text-white transition hover:border-blue-400 hover:text-blue-700 disabled:opacity-50"
          >
            {exporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {exporting ? "Preparing CSV…" : "Download CSV"}
          </button>
        ) : activeRun?.expired ? (
          <button
            type="button"
            disabled={turn.rerunning}
            onClick={() => onRerun(activeRun.runId)}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium text-navy-900 dark:text-white transition hover:border-blue-400 hover:text-blue-700 disabled:opacity-50"
          >
            <RefreshCw
              className={turn.rerunning ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"}
            />
            {turn.rerunning ? "Running…" : "Re-run"}
          </button>
        ) : (
          <button
            type="button"
            disabled={turn.tableBusy}
            onClick={() => activeRun && onSelectRun(activeRun.runId)}
            className="rounded-md border px-3 py-1.5 text-xs font-medium text-navy-900 dark:text-white transition hover:border-blue-400 hover:text-blue-700 disabled:opacity-50"
          >
            Show the list
          </button>
        )}
      </div>

      {activeRun?.expired && !table && (
        <p className="border-b px-4 py-2 text-xs text-muted-foreground">
          These numbers are from when you asked. Re-run to see where things stand
          now.
        </p>
      )}

      {/* Rows-to-be while the first page loads. A header over nothing is
          the half-finished look this whole screen is trying to get rid of. */}
      {turn.tableBusy && !table && (
        <div aria-hidden className="space-y-2.5 px-4 py-3">
          <div className="h-3 w-full animate-pulse rounded bg-muted" />
          {[0, 1, 2, 3, 4].map((r) => (
            <div key={r} className="h-3 animate-pulse rounded bg-muted/60" />
          ))}
        </div>
      )}

      {table && (
        // Dimmed while another report's rows are on their way, so the old
        // rows are not mistaken for the new ones.
        <div
          className={
            turn.tableBusy ? "overflow-x-auto opacity-50 transition" : "overflow-x-auto transition"
          }
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-cream-50 dark:bg-background text-left">
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
                      className="whitespace-nowrap px-3 py-2 text-navy-900 dark:text-white tabular-nums"
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
