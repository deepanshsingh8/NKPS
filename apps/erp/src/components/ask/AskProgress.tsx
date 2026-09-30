"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ChevronRight, Loader2, XCircle } from "lucide-react";
import type { ProgressStep, TurnProgress } from "./progress";

/** Seconds, as a person would say them: "8s", "1m 05s". */
function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  if (total < 60) return `${total}s`;
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, "0")}s`;
}

function StepIcon({ state }: { state: ProgressStep["state"] }) {
  if (state === "active") {
    return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600 dark:text-blue-400" />;
  }
  if (state === "failed") {
    return <XCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />;
  }
  return <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />;
}

function StepList({ steps }: { steps: ProgressStep[] }) {
  return (
    <ol className="space-y-1.5" aria-live="polite">
      {steps.map((step) => (
        <li key={step.id} className="flex items-start gap-2 text-sm">
          <span className="mt-0.5">
            <StepIcon state={step.state} />
          </span>
          <span
            className={
              step.state === "active"
                ? "text-navy-900 dark:text-white"
                : "text-muted-foreground"
            }
          >
            {step.label}
            {step.detail && (
              <span className="ml-1.5 tabular-nums text-muted-foreground">· {step.detail}</span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * What the assistant is doing right now, with a clock.
 *
 * The clock is the part that answers "is it stuck?": a number that keeps
 * moving says the request is alive even while the model is thinking and the
 * list has nothing new to add. Once the turn finishes the list folds away to
 * one line, still there for anyone who wants to see how the answer was found.
 */
export function AskProgress({ progress }: { progress: TurnProgress }) {
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
          <StepList steps={progress.steps} />
        </div>
      </details>
    );
  }

  return (
    <div className="rounded-lg border border-dashed bg-cream-50/60 px-4 py-3 dark:bg-background">
      <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="font-medium uppercase tracking-wide">Working on it</span>
        <span className="tabular-nums">{formatElapsed(elapsed)}</span>
      </div>
      <StepList steps={progress.steps} />
      {elapsed > 20_000 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Questions that compare several groups can take up to a minute. You can
          press Stop at any time.
        </p>
      )}
    </div>
  );
}
