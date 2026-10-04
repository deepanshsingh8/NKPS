"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Copy,
  CornerDownLeft,
  Loader2,
  PanelLeft,
  Pencil,
  RefreshCw,
  ShieldAlert,
  Square,
} from "lucide-react";
import { adminFetch } from "@nkps/shared/lib/admin-api";
import { ChatMarkdown } from "@/components/ChatMarkdown";
import { ConversationList } from "@/components/ask/ConversationList";
import { AnswerTable } from "@/components/ask/AnswerTable";
import { AskProgress } from "@/components/ask/AskProgress";
import {
  advanceProgress,
  resumeProgress,
  startProgress,
  type ProgressEvent,
} from "@/components/ask/progress";
import type {
  AskRun,
  ConversationSummary,
  TableState,
  Turn,
} from "@/components/ask/types";
import { AgentMark } from "@nkps/shared/components/icons/AgentMark";

/**
 * Ask-your-school.
 *
 * A natural-language front door onto the report builder — same data, same
 * `reports` permission, same export audit trail. The assistant never sees the
 * full result set: it works from counts and a short preview, and each table is
 * fetched separately under a fresh authorization check.
 *
 * ── The URL owns which conversation is open ──────────────────────────────────
 * /reports/ask is a new chat and creates no row until the first message is
 * sent, so the list never fills with empty chats. /reports/ask/<id> is that
 * conversation. Everything else follows from that: refreshing keeps your place,
 * the back button works, and a chat can be linked to. This component is
 * rendered by the route's layout, not its page, so that the URL can change
 * under a live answer without remounting it — see reports/ask/layout.tsx.
 *
 * ── Looking away does not cancel an answer ───────────────────────────────────
 * Only Stop does. Opening another chat, starting a new one or leaving the page
 * detaches the answer on screen and lets it finish; it is saved to its chat
 * either way. A chat opened while its answer is still being written shows that
 * it is, and watches the saved transcript until the answer lands, instead of
 * showing a question with nothing under it.
 */

/**
 * How long a chat whose last question has no answer yet is treated as still
 * being answered. Comfortably past the ask route's 60-second maxDuration;
 * anything older is a turn that died without recording why.
 */
const PENDING_WINDOW_MS = 3 * 60_000;
const POLL_MS = 3_000;

const NO_ANSWER =
  "This question didn't get an answer. The connection may have dropped before it finished.";
const CUT_OFF =
  "The answer was cut off before it finished. Try asking again, or narrow the question.";

interface TranscriptRow {
  id: string;
  role: "user" | "assistant";
  content: string;
  redacted: boolean;
  error_code: string | null;
  runs: { run_id: string; purpose: string | null; total: number; expired: boolean }[];
}

function toTurn(t: TranscriptRow): Turn {
  const runs = t.runs.map((r) => ({
    runId: r.run_id,
    purpose: r.purpose ?? "Report",
    total: r.total,
    expired: r.expired,
  }));
  return {
    id: t.id,
    role: t.role,
    // A stop is stored as the word "Stopped." so the audit trail reads as it
    // happened; on screen it gets the same "Ask it again" as a live stop.
    content: t.error_code === "user_stopped" ? "" : t.content,
    stopped: t.error_code === "user_stopped" || undefined,
    redacted: t.redacted,
    error: null,
    runs,
    activeRunId: runs.length ? runs[runs.length - 1].runId : null,
  };
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

export function AskChat() {
  const router = useRouter();
  const params = useParams<{ slug?: string[] }>();
  const slugId = params?.slug?.[0] ?? null;

  const [turns, setTurns] = useState<Turn[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [transcriptLoading, setTranscriptLoading] = useState(false);

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [allowSensitive, setAllowSensitive] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Answers this page has in flight, per chat, on screen or not. A count, not
   * a flag: a question sent over an unfinished one in the same chat overlaps
   * it briefly, and the first one finishing must not unmark the second.
   */
  const [answering, setAnswering] = useState<ReadonlyMap<string, number>>(() => new Map());
  /** Bumped to re-arm the poll when a check finds the answer still pending. */
  const [pollTick, setPollTick] = useState(0);

  const endRef = useRef<HTMLDivElement>(null);
  /**
   * The request whose answer is on screen — the one Stop cancels. A request
   * that is still running but no longer on screen is not in here: it has been
   * detached, and finishes on its own.
   */
  const abortRef = useRef<AbortController | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * The chat being shown or opened. A transcript that arrives after you have
   * moved on to another chat is dropped instead of painted over it.
   */
  const shownIdRef = useRef<string | null>(null);

  /** Set when a chat is put on screen, so the next paint lands at its end. */
  const scrollOnOpenRef = useRef(false);

  // Follow the conversation while an answer is being worked on, and once when
  // a chat opens — but not when a finished answer's table lands. Fifty rows
  // arriving used to scroll the answer they belong to off the top of the
  // screen.
  useEffect(() => {
    const following =
      scrollOnOpenRef.current ||
      turns.some((t) => t.streaming || (t.progress && t.progress.finishedAt === undefined));
    scrollOnOpenRef.current = false;
    if (following) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  // Unmounting detaches the request but does NOT abort it. Leaving the page is
  // not Stop: the answer finishes, is saved to its chat, and is there when you
  // come back. Detaching matters on its own — a first question whose `start`
  // arrives after you have left would otherwise still move the URL, and pull
  // you back here from wherever you went.
  useEffect(
    () => () => {
      abortRef.current = null;
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    []
  );

  const markAnswering = useCallback((id: string, delta: 1 | -1) => {
    setAnswering((prev) => {
      const next = new Map(prev);
      const count = (next.get(id) ?? 0) + delta;
      if (count > 0) next.set(id, count);
      else next.delete(id);
      return next;
    });
  }, []);

  /** Take the answer off screen without cancelling it. */
  const detach = useCallback(() => {
    abortRef.current = null;
    setBusy(false);
  }, []);

  const patchTurn = useCallback((id: string, patch: Partial<Turn>) => {
    setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const stepTurn = useCallback((id: string, event: ProgressEvent) => {
    setTurns((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, progress: advanceProgress(t.progress, event) } : t
      )
    );
  }, []);

  // ── The chat list ─────────────────────────────────────────────────────────
  const refreshList = useCallback(async (q?: string) => {
    setListLoading(true);
    try {
      const url = q?.trim()
        ? `/api/ai/conversations?q=${encodeURIComponent(q.trim())}`
        : "/api/ai/conversations";
      const res = await adminFetch(url);
      if (!res.ok) return;
      const data = await res.json();
      setConversations(data.conversations ?? []);
    } catch {
      // A chat list that won't load must not stop you asking a question.
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  // ── Loading a saved conversation ──────────────────────────────────────────
  const loadTable = useCallback(
    async (turnId: string, runId: string) => {
      patchTurn(turnId, { tableBusy: true, activeRunId: runId });
      try {
        const res = await adminFetch(`/api/ai/ask/${runId}/table?page_size=50`);
        const data = await res.json();
        if (!res.ok) {
          patchTurn(turnId, { tableBusy: false, table: null });
          return;
        }
        patchTurn(turnId, {
          tableBusy: false,
          table: {
            runId,
            headers: data.headers,
            rows: data.rows,
            total: data.total,
          } as TableState,
        });
      } catch {
        patchTurn(turnId, { tableBusy: false, table: null });
      } finally {
        stepTurn(turnId, { type: "table_loaded" });
      }
    },
    [patchTurn, stepTurn]
  );

  /**
   * Open a saved chat.
   *
   * `quiet` is the poll behind a chat whose answer is still being written: no
   * skeleton, no clearing, and nothing painted until the answer has landed.
   */
  const openTranscript = useCallback(
    async (id: string, quiet = false) => {
      if (quiet) {
        // A poll never claims the screen: if another chat has been picked
        // since it was armed, it has nothing to do.
        if (shownIdRef.current !== id) return;
      } else {
        shownIdRef.current = id;
        // Clear first: the skeleton replaces the chat you were on rather than
        // sitting on top of it while the next one loads.
        setTurns([]);
        setTranscriptLoading(true);
        setError(null);
      }
      try {
        const res = await adminFetch(`/api/ai/conversations/${id}`);
        if (shownIdRef.current !== id) return;
        if (!res.ok) {
          if (quiet && res.status !== 404) {
            setPollTick((n) => n + 1);
            return;
          }
          setError("That chat is no longer available.");
          setTurns([]);
          router.replace("/reports/ask");
          return;
        }
        const data = await res.json();
        if (shownIdRef.current !== id) return;

        const loaded: Turn[] = ((data.turns ?? []) as TranscriptRow[]).map(toTurn);

        // A question with nothing under it is either still being answered or
        // never will be. The conversation is 'open' from the moment a turn
        // starts until the runner records how it ended, and last_at is when it
        // started. The client clock can run ahead of the server's; clamping
        // keeps a skewed clock from counting a fresh question as old.
        const lastTurn = loaded[loaded.length - 1];
        const askedAt = Math.min(
          Date.parse(data.conversation?.last_at ?? "") || Date.now(),
          Date.now()
        );
        const stillAnswering =
          lastTurn?.role === "user" &&
          data.conversation?.status === "open" &&
          Date.now() - askedAt < PENDING_WINDOW_MS;

        if (quiet && stillAnswering) {
          setPollTick((n) => n + 1);
          return;
        }

        if (lastTurn?.role === "user") {
          loaded.push(
            stillAnswering
              ? {
                  id: `${id}:pending`,
                  role: "assistant",
                  content: "",
                  pending: true,
                  progress: resumeProgress(askedAt),
                }
              : { id: `${id}:unanswered`, role: "assistant", content: "", error: NO_ANSWER }
          );
        }

        scrollOnOpenRef.current = true;
        setTurns(loaded);
        setConversationId(id);

        // Only the LAST answer's table loads by itself. Applying the live
        // behaviour to a whole transcript would fire one report per turn on
        // page open — a dozen parallel re-executions, each capped at 19,999
        // rows, for tables nobody has looked at yet.
        const last = [...loaded].reverse().find((t) => (t.runs?.length ?? 0) > 0);
        const run = last?.runs?.[last.runs.length - 1];
        if (last && run && !run.expired) void loadTable(last.id, run.runId);
      } catch {
        if (shownIdRef.current !== id) return;
        if (quiet) setPollTick((n) => n + 1);
        else setError("Couldn't open that chat.");
      } finally {
        if (!quiet && shownIdRef.current === id) setTranscriptLoading(false);
      }
    },
    [loadTable, router]
  );

  useEffect(() => {
    if (!slugId) {
      shownIdRef.current = null;
      setTranscriptLoading(false);
      if (conversationId !== null) {
        detach();
        setTurns([]);
        setConversationId(null);
      }
      return;
    }
    // Equal means we navigated here ourselves after the first reply — the live
    // transcript is already on screen and re-fetching would blank it.
    if (slugId === conversationId) return;
    detach();
    void openTranscript(slugId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slugId]);

  // ── A reopened chat whose answer is still being written ────────────────────
  // Check the saved transcript every few seconds until the answer lands. The
  // window bounds it whatever goes wrong: a turn that died without recording
  // why, or a server that keeps failing the check, gives up rather than
  // polling for as long as the tab stays open.
  const lastTurn = turns[turns.length - 1];
  const pendingSince = lastTurn?.pending ? (lastTurn.progress?.startedAt ?? null) : null;

  useEffect(() => {
    if (!conversationId || pendingSince === null) return;
    const id = conversationId;
    const timer = setTimeout(() => {
      if (Date.now() - pendingSince > PENDING_WINDOW_MS) {
        setTurns((prev) =>
          prev.map((t) =>
            t.pending ? { ...t, pending: false, progress: undefined, error: NO_ANSWER } : t
          )
        );
        return;
      }
      void openTranscript(id, true);
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [conversationId, pendingSince, pollTick, openTranscript]);

  // ── Asking ────────────────────────────────────────────────────────────────
  /**
   * Send one turn.
   *
   * `resumeId` null means start a new conversation, which is what regenerate
   * and edit do: they rewind the transcript, and rather than teaching the
   * server about branches they simply begin a fresh chat from the truncated
   * history. Two affordances, no message tree, and the new chat gets its own
   * title.
   */
  const send = useCallback(
    async (
      question: string,
      opts: { prefix: Turn[]; resumeId: string | null }
    ) => {
      const trimmed = question.trim();
      if (!trimmed) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      // False once this answer has been taken off screen — another chat was
      // opened, or a new one started. It keeps running; it just stops painting.
      const attached = () => abortRef.current === controller;

      const assistantId = newId();
      setTurns([
        ...opts.prefix,
        { id: newId(), role: "user", content: trimmed },
        {
          id: assistantId,
          role: "assistant",
          content: "",
          streaming: true,
          steps: [],
          progress: startProgress(),
        },
      ]);
      setBusy(true);
      setError(null);

      let answer = "";
      let landedId: string | null = opts.resumeId;
      let finished = false;
      // The chat this request has marked as answering, so the finally below
      // unmarks exactly what was marked.
      let marked: string | null = opts.resumeId;
      if (marked) markAnswering(marked, 1);

      try {
        const res = await adminFetch("/api/ai/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            message: trimmed,
            conversation_id: opts.resumeId,
            // Only sent when starting fresh. Once a conversation has an id the
            // server rebuilds history from the database and ignores this.
            history: opts.resumeId
              ? undefined
              : opts.prefix.map((t) => ({ role: t.role, content: t.content })),
            allow_sensitive: allowSensitive,
          }),
        });

        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          if (!attached()) return;
          patchTurn(assistantId, {
            streaming: false,
            progress: undefined,
            error: data.error ?? "That didn't work.",
          });
          // A chat that outlived its academic session, or an account whose
          // access narrowed. Both mean "start a new one", and saying so beats
          // a dead chat that silently refuses every message.
          if (data.code === "SESSION_CHANGED" || data.code === "SCOPE_CHANGED") {
            setConversationId(null);
          }
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // SSE frames are separated by a blank line; the tail may be partial.
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

            if (ev.type === "start") {
              landedId = (ev.conversation_id as string | null) ?? null;
              if (landedId) {
                if (!marked) {
                  marked = landedId;
                  markAnswering(landedId, 1);
                }
                // Only the answer on screen moves the URL. One taken off
                // screen must not drag you back to its chat when it lands.
                if (attached()) {
                  shownIdRef.current = landedId;
                  setConversationId(landedId);
                  router.replace(`/reports/ask/${landedId}`, { scroll: false });
                }
                // A new chat goes into the list now, not when it finishes,
                // so it can be found (and seen to be working) straight away.
                if (landedId !== opts.resumeId) void refreshList();
              }
              continue;
            }

            if (ev.type === "done") finished = true;
            if (!attached()) {
              if (ev.type === "done") void refreshList();
              continue;
            }

            if (ev.type === "delta") {
              if (!answer) stepTurn(assistantId, { type: "delta" });
              answer += ev.text as string;
              patchTurn(assistantId, { content: answer });
            } else if (ev.type === "round_end") {
              stepTurn(assistantId, { type: "round_end", hadTools: Boolean(ev.hadTools) });
              // The text just streamed was a preamble, not the answer. Move it
              // to the progress list and start over, so the live view matches
              // what a reload will show.
              if (ev.hadTools) {
                const preamble = answer.trim();
                answer = "";
                setTurns((prev) =>
                  prev.map((t) =>
                    t.id === assistantId
                      ? {
                          ...t,
                          content: "",
                          steps: preamble ? [...(t.steps ?? []), preamble] : t.steps,
                        }
                      : t
                  )
                );
              }
            } else if (ev.type === "tool_start") {
              stepTurn(assistantId, {
                type: "tool_start",
                name: ev.name as string,
                label: (ev.label as string | null) ?? null,
              });
            } else if (ev.type === "tool_done") {
              stepTurn(assistantId, {
                type: "tool_done",
                name: ev.name as string,
                failed: Boolean(ev.failed),
                total: typeof ev.total === "number" ? ev.total : null,
              });
            } else if (ev.type === "done") {
              const runs: AskRun[] = ((ev.runs as unknown[]) ?? []).map((r) => {
                const run = r as { run_id: string; purpose: string; total: number };
                return { runId: run.run_id, purpose: run.purpose, total: run.total };
              });
              const shown = runs[runs.length - 1];
              patchTurn(assistantId, {
                // The server's text is authoritative: deltas from earlier
                // rounds were deliberately discarded above.
                content: (ev.text as string) || answer,
                streaming: false,
                runs,
                activeRunId: shown?.runId ?? null,
                tableBusy: Boolean(shown),
              });
              stepTurn(assistantId, { type: "done", loadingTable: Boolean(shown) });
              if (shown) void loadTable(assistantId, shown.runId);
              void refreshList();
            }
          }
        }

        // The stream closed without a `done`, and not because of Stop — an
        // abort throws instead of landing here. The server was cut off: a
        // platform time limit, or a connection dropped on the way. This used
        // to clear the progress list and leave an empty bubble, so the turn
        // simply vanished; say what happened instead.
        if (!finished && attached()) {
          patchTurn(assistantId, {
            streaming: false,
            progress: undefined,
            ...(answer ? {} : { error: CUT_OFF }),
          });
        }
      } catch {
        if (!attached()) {
          // Taken off screen and then lost. Nothing is showing it, but the
          // list may still be marking the chat as working.
          void refreshList();
        } else if (controller.signal.aborted) {
          patchTurn(assistantId, { streaming: false, stopped: true, progress: undefined });
          void refreshList();
        } else {
          patchTurn(assistantId, {
            streaming: false,
            progress: undefined,
            error: "Couldn't reach the assistant. The report builder still works.",
          });
        }
      } finally {
        if (marked) markAnswering(marked, -1);
        if (abortRef.current === controller) {
          abortRef.current = null;
          setBusy(false);
        }
      }
    },
    [allowSensitive, markAnswering, patchTurn, stepTurn, loadTable, refreshList, router]
  );

  // The chat on screen is still being answered by a request this page does
  // not hold. A second question now would race the first inside one chat.
  const waitingOnSaved = Boolean(lastTurn?.pending);

  function submit(question: string) {
    if (waitingOnSaved || !question.trim()) return;
    setInput("");
    void send(question, { prefix: turns, resumeId: conversationId });
  }

  function regenerate(assistantIndex: number) {
    const question = turns[assistantIndex - 1];
    if (!question || question.role !== "user") return;
    void send(question.content, {
      prefix: turns.slice(0, assistantIndex - 1),
      resumeId: null,
    });
  }

  function saveEdit(userIndex: number) {
    const next = editDraft.trim();
    setEditingId(null);
    if (!next) return;
    void send(next, { prefix: turns.slice(0, userIndex), resumeId: null });
  }

  async function rerun(turnId: string, runId: string) {
    patchTurn(turnId, { rerunning: true });
    try {
      const res = await adminFetch(`/api/ai/ask/${runId}/rerun`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        patchTurn(turnId, { rerunning: false });
        setError(data.error ?? "Couldn't re-run that result.");
        return;
      }
      setTurns((prev) =>
        prev.map((t) =>
          t.id === turnId
            ? {
                ...t,
                rerunning: false,
                activeRunId: data.run_id,
                runs: (t.runs ?? []).map((r) =>
                  r.runId === runId
                    ? { ...r, runId: data.run_id, total: data.total, expired: false }
                    : r
                ),
              }
            : t
        )
      );
      void loadTable(turnId, data.run_id);
    } catch {
      patchTurn(turnId, { rerunning: false });
    }
  }

  async function rename(id: string, title: string) {
    const clean = title.trim();
    if (!clean) return;
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title: clean } : c))
    );
    await adminFetch(`/api/ai/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: clean }),
    });
  }

  async function remove(id: string) {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    await adminFetch(`/api/ai/conversations/${id}`, { method: "DELETE" });
    if (id === conversationId) router.push("/reports/ask");
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

  /**
   * Already on /reports/ask, the URL does not change and the slug effect does
   * not run — so "New chat" over a first question still in flight would do
   * nothing. Clear it here instead; the answer carries on into its own chat.
   */
  function startNewChat() {
    if (slugId) {
      router.push("/reports/ask");
      return;
    }
    detach();
    shownIdRef.current = null;
    setTurns([]);
    setConversationId(null);
    setError(null);
  }

  const answeringIds = useMemo(() => new Set(answering.keys()), [answering]);

  const activeTitle =
    conversations.find((c) => c.id === conversationId)?.title ?? null;

  return (
    <div className="flex h-full min-h-0">
      {/* ── Past chats ────────────────────────────────────────────────────── */}
      <aside className="hidden w-72 shrink-0 border-r bg-cream-50 dark:bg-card md:block">
        <ConversationList
          conversations={conversations}
          activeId={conversationId}
          answeringIds={answeringIds}
          loading={listLoading}
          onNew={startNewChat}
          onOpen={(id) => router.push(`/reports/ask/${id}`)}
          onRename={rename}
          onDelete={remove}
          onSearch={(q) => void refreshList(q)}
        />
      </aside>

      {listOpen && (
        <>
          <div
            onClick={() => setListOpen(false)}
            aria-hidden
            className="fixed inset-0 z-20 bg-black/40 md:hidden"
          />
          <aside className="fixed inset-y-0 left-0 z-30 w-72 border-r bg-cream-50 dark:bg-card md:hidden">
            <ConversationList
              conversations={conversations}
              activeId={conversationId}
              answeringIds={answeringIds}
              loading={listLoading}
              onNew={() => {
                setListOpen(false);
                startNewChat();
              }}
              onOpen={(id) => {
                setListOpen(false);
                router.push(`/reports/ask/${id}`);
              }}
              onRename={rename}
              onDelete={remove}
              onSearch={(q) => void refreshList(q)}
            />
          </aside>
        </>
      )}

      {/* ── The conversation ──────────────────────────────────────────────── */}
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-white dark:bg-card px-4 py-2.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => setListOpen(true)}
              className="rounded-md p-1.5 text-muted-foreground hover:text-navy-900 dark:hover:text-white md:hidden"
              title="Past chats"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <Link
                href="/reports"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-blue-700"
              >
                <ArrowLeft className="h-3 w-3" />
                Reports
              </Link>
              <h1 className="truncate font-heading text-base font-semibold text-navy-900 dark:text-white">
                {activeTitle ?? "Ask your school"}
              </h1>
            </div>
          </div>

          <label className="flex items-center gap-2 rounded-lg border bg-white dark:bg-card px-2.5 py-1.5 text-xs">
            <input
              type="checkbox"
              checked={allowSensitive}
              onChange={(e) => setAllowSensitive(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            <span className="font-medium text-navy-900 dark:text-white">Include PII</span>
            <span className="hidden text-muted-foreground lg:inline">
              Aadhaar, income, addresses, contact numbers
            </span>
          </label>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
          {/* The shape of a chat, not a lone "Opening…" over an empty pane —
              an empty pane is exactly what reads as broken. */}
          {transcriptLoading && (
            <div aria-busy="true" className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Opening this chat…
              </div>
              <div className="flex justify-end">
                <div className="h-10 w-2/3 animate-pulse rounded-lg bg-muted sm:w-80" />
              </div>
              <div className="space-y-2 sm:max-w-[85%]">
                <div className="space-y-2 rounded-lg border bg-white px-4 py-3 dark:bg-card">
                  <div className="h-3 w-full animate-pulse rounded bg-muted" />
                  <div className="h-3 w-11/12 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-3/5 animate-pulse rounded bg-muted" />
                </div>
                <div className="h-28 animate-pulse rounded-lg border bg-muted/60" />
              </div>
            </div>
          )}

          {!transcriptLoading && turns.length === 0 && (
            <div className="mx-auto max-w-2xl rounded-lg border bg-white dark:bg-card p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-navy-900 dark:text-white">
                <AgentMark className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                Ask for a list in plain language
              </div>
              <p className="mb-4 text-sm text-muted-foreground">
                Same records, same permissions and same export log as the report
                builder.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => submit(example)}
                    className="rounded-md border px-3 py-2 text-left text-sm text-muted-foreground transition hover:border-blue-400 hover:text-navy-900 dark:hover:text-white"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-300">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {turns.map((turn, i) =>
            turn.role === "user" ? (
              <div key={turn.id} className="group flex justify-end gap-2">
                {editingId === turn.id ? (
                  <div className="w-full max-w-[75%] rounded-lg border bg-white dark:bg-card p-2">
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
                      className="w-full resize-none bg-transparent px-1 py-0.5 text-sm text-navy-900 dark:text-white outline-none"
                    />
                    <div className="flex justify-end gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:text-navy-900 dark:hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => saveEdit(i)}
                        className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
                      >
                        Ask in a new chat
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Editing rewinds and starts a fresh chat, so the saved
                        one is never rewritten under you. */}
                    <button
                      type="button"
                      title="Edit and ask again"
                      onClick={() => {
                        setEditDraft(turn.content);
                        setEditingId(turn.id);
                      }}
                      className="mt-1 self-start rounded-md p-1.5 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-navy-900 dark:hover:text-white"
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
              <div key={turn.id} className="min-w-0 space-y-2 sm:max-w-[85%]">
                {(turn.steps ?? []).map((step, si) => (
                  <p key={si} className="text-sm italic text-muted-foreground">
                    {step}
                  </p>
                ))}

                {turn.progress && (
                  <AskProgress progress={turn.progress} canStop={!turn.pending} />
                )}

                {turn.content && (
                  <div className="rounded-lg border bg-white dark:bg-card px-4 py-3 text-sm text-navy-900 dark:text-white">
                    {/* Plain text while streaming. Re-parsing markdown on every
                        delta makes half-built tables flicker into and out of
                        existence; it becomes markdown the moment it settles. */}
                    {turn.streaming ? (
                      <p className="whitespace-pre-wrap">
                        {turn.content}
                        {/* The cursor says the words are still arriving, so a
                            pause mid-sentence does not read as the end. */}
                        <span
                          aria-hidden
                          className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse rounded-sm bg-blue-600 dark:bg-blue-400"
                        />
                      </p>
                    ) : (
                      <ChatMarkdown>{turn.content}</ChatMarkdown>
                    )}
                  </div>
                )}

                {turn.redacted && !turn.content && (
                  <p className="text-sm italic text-muted-foreground">
                    This answer was removed when the chat was deleted.
                  </p>
                )}

                {turn.stopped && !turn.content && (
                  <div className="text-sm text-muted-foreground">
                    Stopped.{" "}
                    <button
                      type="button"
                      onClick={() => regenerate(i)}
                      className="underline underline-offset-2 hover:text-navy-900 dark:hover:text-white"
                    >
                      Ask it again
                    </button>
                  </div>
                )}

                {turn.error && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-300">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{turn.error}</span>
                  </div>
                )}

                <AnswerTable
                  turn={turn}
                  onSelectRun={(runId) => void loadTable(turn.id, runId)}
                  onRerun={(runId) => void rerun(turn.id, runId)}
                />

                {!turn.streaming && (turn.content || turn.error) && (
                  <div className="flex items-center gap-1">
                    {turn.content && (
                      <button
                        type="button"
                        onClick={() => void copy(turn)}
                        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:text-navy-900 dark:hover:text-white"
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
                      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:text-navy-900 dark:hover:text-white"
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

        <div className="shrink-0 border-t bg-white dark:bg-card px-4 py-3 sm:px-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(input);
            }}
            className="flex items-end gap-2 rounded-lg border p-2"
          >
            {/* Never disabled while busy: interrupting with a new question is
                the point, and Stop is right there for abandoning one. */}
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
              placeholder={
                waitingOnSaved
                  ? "You can ask again once the answer above is in"
                  : "e.g. Class VIII students who haven't paid Term 2"
              }
              className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
            />
            {busy ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-navy-900 dark:text-white transition hover:border-red-400 hover:text-red-700"
              >
                <Square className="h-3 w-3 fill-current" />
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim() || waitingOnSaved}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-40"
              >
                Ask
                <CornerDownLeft className="h-3.5 w-3.5" />
              </button>
            )}
          </form>
          <p className="pt-2 text-xs text-muted-foreground">
            The assistant only ever sees a short preview of the rows — each table
            is fetched separately and re-checks your access. Every download is
            logged like any other export.
          </p>
        </div>
      </section>
    </div>
  );
}
