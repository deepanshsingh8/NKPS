/**
 * The live checklist under a question while the assistant works.
 *
 * A turn used to show one line — "Working through the records…" — for as long
 * as it took. The model thinks silently for most of that, so for twenty or
 * thirty seconds nothing on screen moved and the page read as frozen. Every
 * stage here is driven by a real event from the stream; none is on a timer,
 * so the list can never claim work that has not happened. What does move on a
 * timer is each stage's own clock, which is how a long stage still reads as
 * alive.
 */

export type ProgressState = "active" | "done" | "failed";

export interface ProgressStep {
  id: string;
  /**
   * Which kind of stage, so later events can find the step they finish.
   * `resume` is a chat reopened while its answer was still being written: the
   * stream that knew the stages belongs to another page, so all that is known
   * is that the answer has not landed yet.
   */
  kind: "understand" | "lookup" | "check" | "write" | "table" | "resume";
  /** Tool name, for matching a `tool_done` to its `tool_start`. */
  tool?: string;
  label: string;
  /** A short result once it lands, e.g. "744 found". */
  detail?: string;
  state: ProgressState;
  startedAt: number;
  endedAt?: number;
}

export interface TurnProgress {
  startedAt: number;
  finishedAt?: number;
  steps: ProgressStep[];
}

/** The subset of stream events the checklist listens to. */
export type ProgressEvent =
  | { type: "delta" }
  | { type: "round_end"; hadTools: boolean }
  | { type: "tool_start"; name: string; label: string | null }
  | { type: "tool_done"; name: string; failed: boolean; total?: number | null }
  | { type: "done"; loadingTable: boolean }
  | { type: "table_loaded" };

let seq = 0;
const nextId = () => `p${++seq}`;

export function startProgress(now = Date.now()): TurnProgress {
  return {
    startedAt: now,
    steps: [
      {
        id: nextId(),
        kind: "understand",
        label: "Understanding your question",
        state: "active",
        startedAt: now,
      },
    ],
  };
}

/** A reopened chat whose answer is still being written somewhere else. */
export function resumeProgress(askedAt: number): TurnProgress {
  return {
    startedAt: askedAt,
    steps: [
      {
        id: nextId(),
        kind: "resume",
        label: "Still working on this answer",
        state: "active",
        startedAt: askedAt,
      },
    ],
  };
}

/** Finish every running stage except lookups, which finish on their own event. */
function settle(steps: ProgressStep[], now: number): ProgressStep[] {
  return steps.map((s) =>
    s.state === "active" && s.kind !== "lookup" ? { ...s, state: "done", endedAt: now } : s
  );
}

function lookupLabel(name: string, label: string | null): string {
  if (name === "run_student_report") {
    return label ? `Fetching student records: ${label}` : "Fetching student records";
  }
  return `Looking up the ${label ?? "school's settings"}`;
}

export function advanceProgress(
  progress: TurnProgress | undefined,
  event: ProgressEvent,
  now = Date.now()
): TurnProgress | undefined {
  if (!progress) return progress;
  const steps = progress.steps;

  switch (event.type) {
    case "delta": {
      if (steps.some((s) => s.kind === "write" && s.state === "active")) return progress;
      return {
        ...progress,
        steps: [
          ...settle(steps, now),
          {
            id: nextId(),
            kind: "write",
            label: "Writing the answer",
            state: "active",
            startedAt: now,
          },
        ],
      };
    }

    case "round_end": {
      // Text before a lookup is a preamble, not the answer; it moves to the
      // italic notes above, so "Writing the answer" was never true.
      if (!event.hadTools) return progress;
      return { ...progress, steps: steps.filter((s) => s.kind !== "write") };
    }

    case "tool_start":
      return {
        ...progress,
        steps: [
          ...settle(steps, now),
          {
            id: nextId(),
            kind: "lookup",
            tool: event.name,
            label: lookupLabel(event.name, event.label),
            state: "active",
            startedAt: now,
          },
        ],
      };

    case "tool_done": {
      const i = steps.findIndex(
        (s) => s.kind === "lookup" && s.state === "active" && s.tool === event.name
      );
      if (i === -1) return progress;
      const finished: ProgressStep = {
        ...steps[i],
        state: event.failed ? "failed" : "done",
        endedAt: now,
        detail: event.failed
          ? "couldn't complete"
          : typeof event.total === "number"
            ? `${event.total.toLocaleString("en-IN")} found`
            : undefined,
      };
      const next = [...steps.slice(0, i), finished, ...steps.slice(i + 1)];
      // The last lookup back means the model is reading the results now.
      const stillRunning = next.some((s) => s.kind === "lookup" && s.state === "active");
      return {
        ...progress,
        steps: stillRunning
          ? next
          : [
              ...next,
              {
                id: nextId(),
                kind: "check",
                label: "Checking the results",
                state: "active",
                startedAt: now,
              },
            ],
      };
    }

    case "done": {
      const settled = settle(steps, now).map((s) =>
        s.state === "active" ? { ...s, state: "done" as const, endedAt: now } : s
      );
      return event.loadingTable
        ? {
            ...progress,
            steps: [
              ...settled,
              {
                id: nextId(),
                kind: "table",
                label: "Preparing the full list",
                state: "active",
                startedAt: now,
              },
            ],
          }
        : { ...progress, steps: settled, finishedAt: now };
    }

    case "table_loaded":
      if (progress.finishedAt) return progress;
      return { ...progress, steps: settle(steps, now), finishedAt: now };
  }
}
