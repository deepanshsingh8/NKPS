"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ChevronRight, Loader2, XCircle } from "lucide-react";
import { AgentMark } from "@nkps/shared/components/icons/AgentMark";
import { cn } from "@nkps/shared/lib/utils";
import type { ProgressStep, TurnProgress } from "./progress";

/** Seconds, as a person would say them: "8s", "1m 05s". */
function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  if (total < 60) return `${total}s`;
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, "0")}s`;
}

/**
 * What the stage on screen is doing, for when it has been on screen a while.
 *
 * Each line describes the stage that is already showing as active. None of
 * them announces new work, so they cannot get ahead of the stream the way a
 * timed "Analysing…" → "Almost done…" script would.
 */
const STAGE_HINTS: Partial<Record<ProgressStep["kind"], string>> = {
  understand: "Working out which records answer this.",
  lookup: "Long lists take a little longer to pull.",
  check: "Reading the results before writing the answer.",
  table: "Loading the rows into the table below.",
  resume:
    "This chat was still being answered when you opened it. The answer appears here as soon as it is saved.",
};

/** How long a stage must run before its hint appears. */
const HINT_AFTER_MS = 6_000;

function StepIcon({ state }: { state: ProgressStep["state"] }) {
  if (state === "active") {
    return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600 dark:text-blue-400" />;
  }
  if (state === "failed") {
    return <XCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />;
  }
  return <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />;
}

function StepList({ steps, now }: { steps: ProgressStep[]; now: number }) {
  return (
    <ol className="space-y-1.5" aria-live="polite">
      {steps.map((step) => {
        const ms = (step.endedAt ?? now) - step.startedAt;
        const active = step.state === "active";
        return (
          <li key={step.id} className="flex items-start gap-2 text-sm">
            <span className="mt-0.5">
              <StepIcon state={step.state} />
            </span>
            <span
              className={cn(
                "min-w-0 flex-1",
                active ? "font-medium text-navy-900 dark:text-white" : "text-muted-foreground"
              )}
            >
              {step.label}
              {step.detail && (
                <span className="ml-1.5 font-normal tabular-nums text-muted-foreground">
                  · {step.detail}
                </span>
              )}
            </span>
            {/* A stage's own clock. The overall one says the request is alive;
                this one says which part the time is going into. Sub-second
                stages stay unlabelled — "0s" next to a tick is noise. */}
            {(active || ms >= 1000) && (
              <span className="shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">
                {formatElapsed(ms)}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * What the assistant is doing right now, with a clock.
 *
 * The clocks are the part that answers "is it stuck?": numbers that keep
 * moving say the request is alive even while the model is thinking and the
 * list has nothing new to add, and the bar along the top moves whether or not
 * anything else does. Once the turn finishes the list folds away to one line,
 * still there for anyone who wants to see how the answer was found.
 *
 * `canStop` is false for a chat reopened mid-answer: the request belongs to
 * whichever page sent it, so there is no Stop here to point at.
 */
export function AskProgress({
  progress,
  canStop = true,
}: {
  progress: TurnProgress;
  canStop?: boolean;
}) {
  const live = progress.finishedAt === undefined;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [live]);

  const elapsed = (progress.finishedAt ?? now) - progress.startedAt;

  if (!live) {
    const lookups = progress.steps.filter((s) => s.kind === "lookup").length;
    return (
      <details className="group text-xs text-muted-foreground">
        <summary className="flex cursor-pointer list-none items-center gap-1 hover:text-navy-900 dark:hover:text-white">
          <ChevronRight className="h-3.5 w-3.5 transition group-open:rotate-90" />
          Answered in {formatElapsed(elapsed)}
          {lookups > 0 && ` · ${lookups} lookup${lookups === 1 ? "" : "s"}`}
        </summary>
        <div className="mt-2 pl-4">
          <StepList steps={progress.steps} now={progress.finishedAt ?? now} />
        </div>
      </details>
    );
  }

  const current = [...progress.steps].reverse().find((s) => s.state === "active");
  const hint =
    current &&
    (current.kind === "resume" || now - current.startedAt >= HINT_AFTER_MS)
      ? STAGE_HINTS[current.kind]
      : undefined;

  let note: string | null = null;
  if (elapsed > 75_000) {
    note = canStop
      ? "This is taking longer than usual. If nothing changes soon, press Stop and try a narrower question."
      : "This is taking longer than usual. If nothing changes soon, ask the question again.";
  } else if (elapsed > 20_000) {
    note =
      "Questions that compare several groups can take up to a minute. You can switch tabs or open another chat meanwhile. The answer is saved to this chat.";
  }

  return (
    <div className="overflow-hidden rounded-lg border border-blue-200 bg-white dark:border-blue-900 dark:bg-card">
      {/* Moves on its own, so the card never sits perfectly still. */}
      <div aria-hidden className="relative h-0.5 overflow-hidden bg-blue-100 dark:bg-blue-950">
        <div className="absolute inset-y-0 left-0 w-2/5 animate-indeterminate rounded-full bg-blue-600 dark:bg-blue-400" />
      </div>

      <div className="px-4 py-3">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-blue-700 dark:text-blue-300">
            <AgentMark className="h-4 w-4 animate-pulse" />
            Working on it
          </span>
          <span
            className="text-xs tabular-nums text-muted-foreground"
            title="Time since you asked"
          >
            {formatElapsed(elapsed)}
          </span>
        </div>

        <StepList steps={progress.steps} now={now} />

        {hint && <p className="mt-1.5 pl-6 text-xs text-muted-foreground">{hint}</p>}

        {note && (
          <p className="mt-3 border-t pt-2.5 text-xs text-muted-foreground">{note}</p>
        )}
      </div>
    </div>
  );
}
