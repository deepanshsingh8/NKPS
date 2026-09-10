"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import {
  CornerDownLeft,
  Loader2,
  Maximize2,
  Minimize2,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { cn } from "@nkps/shared/lib/utils";
import { createClient } from "@nkps/shared/lib/supabase/client";
import { guidePaths, findScreenGuide } from "@nkps/shared/lib/guide/screens";
import { ChatMarkdown } from "@/components/ChatMarkdown";

/**
 * "How do I do this?" — on every ERP screen.
 *
 * A floating button rather than a page, because the question is always about
 * the screen you are already looking at. Opening a separate page to ask how to
 * use this one would be its own small joke.
 *
 * It knows where you are: the current pathname goes to the server with every
 * question, so "how do I add one?" resolves against the screen in front of
 * you. It reads no records of any kind — see the route for why that is what
 * lets every staff account use it.
 */

interface Turn {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  tool?: string | null;
  error?: string | null;
}

export function GuideLauncher() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const paths = useRef(guidePaths()).current;

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, open]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Esc closes, which is what everyone tries first.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const screen = findScreenGuide(pathname ?? "/");

  const ask = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const history = turns
        .filter((t) => t.content.trim())
        .map((t) => ({ role: t.role, content: t.content }));

      setInput("");
      setTurns((prev) => [
        ...prev,
        { role: "user", content: trimmed },
        { role: "assistant", content: "", streaming: true },
      ]);
      setBusy(true);

      const patchLast = (patch: Partial<Turn>) =>
        setTurns((prev) =>
          prev.map((t, i) => (i === prev.length - 1 ? { ...t, ...patch } : t))
        );

      let answer = "";
      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const res = await fetch("/api/ai/guide", {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            ...(session?.access_token
              ? { Authorization: `Bearer ${session.access_token}` }
              : {}),
          },
          body: JSON.stringify({ message: trimmed, pathname, history }),
        });

        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          patchLast({ streaming: false, error: data.error ?? "That didn't work." });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            const line = frame.split("\n").find((l) => l.startsWith("data: "));
            if (!line) continue;
            let ev: Record<string, unknown>;
            try {
              ev = JSON.parse(line.slice(6));
            } catch {
              continue;
            }

            if (ev.type === "delta") {
              answer += ev.text as string;
              patchLast({ content: answer, tool: null });
            } else if (ev.type === "tool_start") {
              patchLast({ tool: ev.label as string });
            } else if (ev.type === "done") {
              patchLast({
                content: (ev.text as string) || answer,
                streaming: false,
                tool: null,
              });
            }
          }
        }
        patchLast({ streaming: false });
      } catch {
        if (controller.signal.aborted) {
          patchLast({ streaming: false, tool: null });
        } else {
          patchLast({ streaming: false, error: "Couldn't reach the guide." });
        }
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setBusy(false);
        }
      }
    },
    [pathname, turns]
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Ask how to use this screen"
        aria-label="Ask the in-app guide"
        // A sparkle, not a question mark. Every other AI affordance in this
        // ERP is marked with one — "Draft remarks with AI", "Ask your school"
        // — and a "?" reads as a static help file, which is precisely the
        // thing people have learned to ignore.
        className="group fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-gradient-to-br from-navy-900 to-blue-700 px-4 py-3 text-white shadow-lg ring-1 ring-white/10 transition hover:shadow-xl hover:brightness-110 sm:px-4"
      >
        <Sparkles className="h-5 w-5 shrink-0" />
        <span className="hidden text-sm font-medium sm:inline">Ask AI</span>
      </button>
    );
  }

  return (
    <div
      className={cn(
        "fixed z-40 flex flex-col overflow-hidden border bg-white shadow-2xl",
        // Mobile: a bottom sheet, because a 24rem floating card on a 375px
        // screen is a letterbox. Expanded takes the whole viewport.
        expanded
          ? "inset-0 rounded-none"
          : "inset-x-0 bottom-0 h-[75dvh] rounded-t-2xl",
        // Desktop: an anchored card that grows in place rather than moving.
        expanded
          ? "sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[min(88dvh,54rem)] sm:w-[min(46rem,calc(100vw-2.5rem))] sm:rounded-xl"
          : "sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[min(38rem,calc(100dvh-2.5rem))] sm:w-[24rem] sm:rounded-xl"
      )}
    >
      <header className="flex shrink-0 items-start justify-between gap-2 border-b bg-navy-900 px-4 py-3 text-white">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <Sparkles className="h-4 w-4" />
            How do I…?
          </div>
          <p className="truncate text-xs text-white/70">
            {screen ? `You're on ${screen.title}` : "Ask about any ERP screen"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Shrink" : "Expand"}
            title={expanded ? "Shrink" : "Expand"}
            className="rounded p-1 text-white/70 transition hover:text-white"
          >
            {expanded ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="rounded p-1 text-white/70 transition hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div
        className={cn(
          "min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3",
          // Long answers get a readable measure once the panel is wide.
          expanded && "mx-auto w-full max-w-3xl"
        )}
      >
        {turns.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Ask how to do something and I&apos;ll give you the steps for this
              screen. I can&apos;t look up any student, fee or exam record —
              that&apos;s{" "}
              <span className="font-medium text-navy-900">Ask your school</span>{" "}
              under Reports.
            </p>
            {/* Seeded from the registry, so the suggestions are always things
                that genuinely exist on the screen the user is looking at. */}
            {screen && (
              <div className="space-y-1.5">
                {screen.tasks.slice(0, 3).map((task) => (
                  <button
                    key={task.name}
                    type="button"
                    onClick={() => void ask(`${task.name}?`)}
                    className="block w-full rounded-md border px-3 py-2 text-left text-sm text-muted-foreground transition hover:border-blue-400 hover:text-navy-900"
                  >
                    {task.name}?
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {turns.map((turn, i) =>
          turn.role === "user" ? (
            <div
              key={i}
              className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-lg bg-navy-900 px-3 py-2 text-sm text-white"
            >
              {turn.content}
            </div>
          ) : (
            <div key={i} className="space-y-1.5 text-sm text-navy-900">
              {turn.tool && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Reading {turn.tool}…
                </div>
              )}
              {turn.content &&
                (turn.streaming ? (
                  <p className="whitespace-pre-wrap">{turn.content}</p>
                ) : (
                  <ChatMarkdown allowedPaths={paths}>{turn.content}</ChatMarkdown>
                ))}
              {turn.streaming && !turn.content && !turn.tool && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Looking it up…
                </div>
              )}
              {turn.error && (
                <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
                  {turn.error}
                </p>
              )}
            </div>
          )
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
        className={cn(
          "flex shrink-0 items-end gap-2 border-t p-2",
          expanded && "mx-auto w-full max-w-3xl"
        )}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask(input);
            }
          }}
          rows={1}
          placeholder="e.g. How do I add a new student?"
          className="max-h-24 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
        />
        {busy ? (
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            aria-label="Stop"
            className="shrink-0 rounded-md border p-2 text-navy-900 transition hover:border-red-400 hover:text-red-700"
          >
            <Square className="h-3 w-3 fill-current" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            aria-label="Ask"
            className="shrink-0 rounded-md bg-blue-600 p-2 text-white transition hover:bg-blue-700 disabled:opacity-40"
          >
            <CornerDownLeft className="h-3.5 w-3.5" />
          </button>
        )}
      </form>
    </div>
  );
}
