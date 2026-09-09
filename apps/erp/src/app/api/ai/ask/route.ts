import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { verifyAdminOrEditorWithUser } from "@nkps/shared/lib/verify-admin";
import { getSchoolProfile } from "@nkps/shared/lib/school-profile";
import { rateLimit } from "@nkps/shared/lib/rate-limit";
import { isAiConfigured, AI_MODELS } from "@/lib/ai/client";
import { startConversation } from "@/lib/ai/audit";
import { runAskTurn } from "@/lib/ai/runner";
import { buildAskSystemPrompt, buildAskContextBlock } from "@/lib/ai/prompts/ask";
import type { CallerContext, RowScope } from "@/lib/ai/caller-context";

export const runtime = "nodejs";
// The loop can make several model calls plus database work. Without this the
// platform kills it mid-turn and the user sees a blank failure.
export const maxDuration = 60;

/**
 * POST /api/ai/ask — Ask-your-school.
 *
 * Gated on the existing `reports` feature key rather than an AI-specific one:
 * this reaches exactly the data the report builder reaches, so it must be
 * exactly as privileged. A separate key would be a second, wider door onto the
 * student master wearing a different name.
 */
export async function POST(request: NextRequest) {
  if (!isAiConfigured()) {
    return NextResponse.json(
      {
        error: "The assistant is not configured on this deployment.",
        code: "NOT_CONFIGURED",
      },
      { status: 503 }
    );
  }

  const caller = await verifyAdminOrEditorWithUser("reports");
  if (!caller) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { admin, user, role } = caller;

  // Per-user, not per-IP: this endpoint is authenticated and metered, so the
  // account is the thing worth limiting. Still in-memory and per-process,
  // which is acceptable here precisely because the caller is already
  // authenticated and privileged — the public WhatsApp ingress will need a
  // DB-backed counter instead.
  const limit = rateLimit({
    name: "ai:ask",
    key: user.id,
    max: 20,
    windowSeconds: 300,
  });
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: `You've asked a lot in a short time. Try again in ${limit.resetSeconds}s.`,
        code: "RATE_LIMITED",
      },
      { status: 429 }
    );
  }

  let body: { message?: unknown; history?: unknown; allow_sensitive?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "Ask a question first." }, { status: 400 });
  }
  if (message.length > 2000) {
    return NextResponse.json({ error: "That question is too long." }, { status: 400 });
  }

  const { data: session } = await admin
    .from("academic_years")
    .select("id, name")
    .eq("is_current", true)
    .limit(1)
    .maybeSingle();

  if (!session?.id) {
    return NextResponse.json(
      { error: "No current academic session is set, so there is nothing to report on." },
      { status: 409 }
    );
  }

  const isAdmin = role === "admin";

  // Admins and editors holding the `reports` grant both see all classes —
  // matching /reports/students exactly. Teacher scoping arrives with the
  // remarks feature, which is where a narrower scope actually applies.
  const scope: RowScope = { kind: "all" };

  // Sensitive columns require BOTH admin and a deliberate opt-in from the UI.
  // Never a body default, never something the model can set.
  const allowSensitive = isAdmin && body.allow_sensitive === true;

  const school = await getSchoolProfile(admin);

  // The school's own off switch, separate from whether a key is configured.
  // A principal who wants the assistant dark during results week flips one row
  // rather than waiting on a redeploy — and the fallback profile returns false,
  // so an unreadable configuration fails closed rather than open.
  if (!school.aiEnabled) {
    return NextResponse.json(
      {
        error: "The assistant is switched off for this school.",
        code: "AI_DISABLED",
      },
      { status: 503 }
    );
  }

  const conversationId = await startConversation({
    admin,
    channel: "erp_web",
    feature: "ask",
    actorId: user.id,
    actorRole: role,
    scope,
    model: AI_MODELS.ask,
    academicYearId: session.id as string,
  });

  const ctx: CallerContext = {
    channel: "erp_web",
    role: isAdmin ? "admin" : "editor",
    userId: user.id,
    parentId: null,
    teacherId: null,
    scope,
    allowSensitive,
    sessionId: session.id as string,
    admin,
    conversationId,
  };

  const systemPrompt = buildAskSystemPrompt({
    school,
    isAdmin,
    scopeDescription: "every class in the current session",
    allowSensitive,
  });

  // History is capped and shape-checked: it arrives from the client, so it is
  // input, not state we trust.
  const history = normaliseHistory(body.history);

  try {
    const result = await runAskTurn(
      ctx,
      systemPrompt,
      history,
      `${buildAskContextBlock(session.name as string)}\n\n${message}`
    );

    return NextResponse.json({
      reply: result.text,
      run_id: result.runId,
      stopped_by: result.stoppedBy,
    });
  } catch (err) {
    console.error("[ai.ask] turn failed:", err);
    return NextResponse.json(
      {
        error:
          "Something went wrong running that. The report builder under Reports still works.",
      },
      { status: 500 }
    );
  }
}

/**
 * Accept only well-formed prior turns, and only text.
 *
 * Tool-use blocks are deliberately dropped: replaying a client-supplied
 * tool_use without its matching tool_result would break the conversation, and
 * accepting client-supplied tool *results* would let the browser feed the
 * model fabricated data.
 */
function normaliseHistory(raw: unknown): Anthropic.MessageParam[] {
  if (!Array.isArray(raw)) return [];
  const out: Anthropic.MessageParam[] = [];
  for (const entry of raw.slice(-8)) {
    if (!entry || typeof entry !== "object") continue;
    const { role, content } = entry as { role?: unknown; content?: unknown };
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string" || !content.trim()) continue;
    out.push({ role, content: content.slice(0, 4000) });
  }
  return out;
}
