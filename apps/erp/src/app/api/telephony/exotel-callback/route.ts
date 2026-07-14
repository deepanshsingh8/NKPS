import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@nkps/shared/lib/supabase/admin";
import { mapExotelStatus } from "@nkps/shared/lib/telephony/exotel";

// Exotel POSTs call-status updates here. It can't carry our Bearer token, so
// the route is public and instead verifies the unguessable EXOTEL_CALLBACK_TOKEN
// passed in the query string (set on the StatusCallback URL when we place the
// call). Without a matching token we reject and touch nothing.

export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const expected = process.env.EXOTEL_CALLBACK_TOKEN;
  if (!expected || token !== expected) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Exotel sends form-urlencoded params; tolerate JSON too.
  let params: Record<string, string> = {};
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      params = (await request.json()) as Record<string, string>;
    } else {
      const form = await request.formData();
      for (const [k, v] of form.entries()) params[k] = String(v);
    }
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }

  const callSid = params.CallSid || params.Sid;
  if (!callSid) {
    // Nothing to reconcile against; ack so Exotel doesn't retry forever.
    return NextResponse.json({ ok: true });
  }

  const durationRaw = params.DialCallDuration || params.ConversationDuration;
  const duration = durationRaw ? parseInt(durationRaw, 10) : null;

  const admin = createAdminClient();
  const { error } = await admin
    .from("call_logs")
    .update({
      status: mapExotelStatus(params.Status),
      duration_seconds: Number.isFinite(duration as number) ? duration : null,
      recording_url: params.RecordingUrl || null,
      updated_at: new Date().toISOString(),
    })
    .eq("exotel_sid", callSid);

  if (error) {
    console.error("Exotel callback update error:", error);
    // Still 200 — a 5xx makes Exotel retry, which won't help a DB write bug.
  }

  return NextResponse.json({ ok: true });
}
