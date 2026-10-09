import { NextRequest, NextResponse } from "next/server";
import { verifyAdminOrEditorWithUser } from "@nkps/shared/lib/verify-admin";
import { fetchAllRows } from "@nkps/shared/lib/fetch-all-rows";
import { getSchoolProfile } from "@nkps/shared/lib/school-profile";
import { isWhatsAppConfigured, WHATSAPP_TEMPLATES } from "@nkps/shared/lib/messaging/whatsapp";
import {
  BUS_NOTICE_MAX_CHARS,
  sanitizeTemplateParam,
} from "@nkps/shared/lib/messaging/templates";
import { checkDbRateLimit } from "@/lib/ai/rate-limit-db";
import {
  CONTACT_COLUMNS,
  groupBusRecipients,
  type ContactableStudent,
} from "@/lib/messaging/recipients";
import { officePhoneParam, runBroadcast } from "@/lib/messaging/outbound";
import { resolveActiveYear } from "@/lib/active-year";

export const runtime = "nodejs";
// A full bus is ~60 families at four sends in flight; well inside this.
export const maxDuration = 60;

/**
 * A WhatsApp notice to every family riding one bus.
 *
 * GET  ?busId=  — what Send would do: how many riders, how many reachable
 *                 numbers, who has no number on file, the last few notices.
 * POST          — { busId, message } sends it.
 *
 * Gated on the `transport` feature, like the rest of /api/transport. The
 * client supplies a bus id and the text; the server decides who gets it and
 * never returns a phone number (last four digits at most).
 *
 * ── Who counts as "on the bus" ──────────────────────────────────────────────
 * Active enrollments in the active year with has_transport and this bus_id.
 * That is narrower than /api/transport/bus-load, which counts leavers until
 * their seat is removed: a seat is a capacity question, a message is not, and
 * telling a family whose child left in June that the bus is late in October
 * is a complaint waiting to happen.
 */

const PER_BUS_WINDOW_MS = 60 * 60 * 1000;
const PER_BUS_MAX_NOTICES = 5;
const PER_ACTOR_WINDOW_SECONDS = 3600;
const PER_ACTOR_MAX_ACTIONS = 30;
// A broadcast still 'sending' after this long is a crashed run, not one in
// flight, and must not count against the bus's hourly cap.
const IN_FLIGHT_GRACE_MS = 5 * 60 * 1000;
const RECENT_LIMIT = 3;

type AdminClient = NonNullable<
  Awaited<ReturnType<typeof verifyAdminOrEditorWithUser>>
>["admin"];

interface RiderRow {
  student_id: string;
  students: ContactableStudent | ContactableStudent[] | null;
}

async function loadBus(admin: AdminClient, busId: string) {
  const { data, error } = await admin
    .from("buses")
    .select("id, bus_number, is_active")
    .eq("id", busId)
    .maybeSingle();
  if (error) throw new Error(`bus lookup failed: ${error.message}`);
  return data as { id: string; bus_number: string; is_active: boolean } | null;
}

async function loadRiders(
  admin: AdminClient,
  busId: string,
  yearId: string
): Promise<ContactableStudent[]> {
  const { data, error, truncated } = await fetchAllRows<RiderRow>((from, to) =>
    admin
      .from("student_enrollments")
      .select(`student_id, students(${CONTACT_COLUMNS})`)
      .eq("academic_year_id", yearId)
      .eq("bus_id", busId)
      .eq("has_transport", true)
      .eq("status", "active")
      .order("id", { ascending: true })
      .range(from, to)
  );
  if (error || truncated) {
    throw new Error(error ?? "rider read stopped at the paging guard");
  }
  const students: ContactableStudent[] = [];
  for (const row of data) {
    const s = Array.isArray(row.students) ? row.students[0] : row.students;
    if (s) students.push(s);
  }
  return students;
}

export async function GET(request: NextRequest) {
  try {
    const gate = await verifyAdminOrEditorWithUser("transport");
    if (!gate) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { admin } = gate;

    const busId = request.nextUrl.searchParams.get("busId") ?? "";
    if (!busId) return NextResponse.json({ error: "busId is required." }, { status: 400 });

    const bus = await loadBus(admin, busId);
    if (!bus) return NextResponse.json({ error: "Bus not found." }, { status: 404 });

    const year = await resolveActiveYear(admin);
    const riders = year ? await loadRiders(admin, busId, year.id) : [];
    const { recipients, unreachable } = groupBusRecipients(riders);

    const [{ data: recentRows }, school] = await Promise.all([
      admin
        .from("whatsapp_broadcasts")
        .select(
          "id, created_at, body_text, recipient_count, sent_count, failed_count, skipped_count, status, profiles:actor_id(full_name)"
        )
        .eq("kind", "bus_notice")
        .eq("bus_id", busId)
        .order("created_at", { ascending: false })
        .limit(RECENT_LIMIT),
      getSchoolProfile(admin),
    ]);

    const recent = ((recentRows ?? []) as unknown as {
      id: string;
      created_at: string;
      body_text: string | null;
      recipient_count: number;
      sent_count: number;
      failed_count: number;
      skipped_count: number;
      status: string;
      profiles: { full_name: string } | { full_name: string }[] | null;
    }[]).map((r) => {
      const actor = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
      return {
        id: r.id,
        created_at: r.created_at,
        body_text: r.body_text,
        recipient_count: r.recipient_count,
        sent_count: r.sent_count,
        failed_count: r.failed_count,
        skipped_count: r.skipped_count,
        status: r.status,
        actor_name: actor?.full_name ?? null,
      };
    });

    return NextResponse.json({
      configured: isWhatsAppConfigured(),
      bus,
      year,
      riders: riders.length,
      recipients: recipients.length,
      unreachable: unreachable.map((u) => ({ id: u.id, full_name: u.full_name })),
      recent,
      maxChars: BUS_NOTICE_MAX_CHARS,
      // What the template's fixed parameters will say, so the preview is exact.
      schoolName: school.name,
      officePhone: officePhoneParam(school.phones),
    });
  } catch (err) {
    console.error("[whatsapp.bus-notice] GET failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const gate = await verifyAdminOrEditorWithUser("transport");
    if (!gate) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { admin, user, role } = gate;

    if (!isWhatsAppConfigured()) {
      return NextResponse.json(
        { error: "WhatsApp messaging is not configured yet.", code: "NOT_CONFIGURED" },
        { status: 503 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const busId = typeof body.busId === "string" ? body.busId : "";
    const message = sanitizeTemplateParam(
      typeof body.message === "string" ? body.message : "",
      BUS_NOTICE_MAX_CHARS
    );
    if (!busId || !message) {
      return NextResponse.json(
        { error: "busId and a message are required." },
        { status: 400 }
      );
    }

    const bus = await loadBus(admin, busId);
    if (!bus) return NextResponse.json({ error: "Bus not found." }, { status: 404 });

    // Per-bus cap, read from the log so a notice that failed outright does not
    // use up the hour. 'completed' rows count; a 'sending' row counts only
    // while it could genuinely still be in flight.
    const since = new Date(Date.now() - PER_BUS_WINDOW_MS).toISOString();
    const graceStart = new Date(Date.now() - IN_FLIGHT_GRACE_MS).toISOString();
    const { count: recentForBus } = await admin
      .from("whatsapp_broadcasts")
      .select("id", { count: "exact", head: true })
      .eq("kind", "bus_notice")
      .eq("bus_id", busId)
      .gte("created_at", since)
      .or(`status.eq.completed,and(status.eq.sending,created_at.gte.${graceStart})`);
    if ((recentForBus ?? 0) >= PER_BUS_MAX_NOTICES) {
      return NextResponse.json(
        {
          error: `Bus ${bus.bus_number} has already had ${PER_BUS_MAX_NOTICES} notices this hour. Please wait before sending another.`,
          code: "RATE_LIMITED",
        },
        { status: 429 }
      );
    }

    const year = await resolveActiveYear(admin);
    if (!year) {
      return NextResponse.json(
        { error: "No academic year is set up, so no one is assigned to this bus." },
        { status: 400 }
      );
    }

    const riders = await loadRiders(admin, busId, year.id);
    const { recipients, unreachable } = groupBusRecipients(riders);
    if (recipients.length === 0) {
      return NextResponse.json(
        {
          error:
            riders.length === 0
              ? "No active students are assigned to this bus."
              : "None of the students on this bus has a usable mobile number on file.",
          code: "NO_RECIPIENTS",
        },
        { status: 400 }
      );
    }

    // Cost controls last, so a request refused above for a reason of its own
    // (no riders, bus capped) never spends the sender's hourly budget. Both are
    // atomic counters (bump_rate_limit), which is what makes them safe against
    // two people pressing Send at once; the log reads above are not.
    //  - one notice per bus per minute closes the double-send race;
    //  - thirty send actions per actor per hour bounds one person's bill.
    const busGuard = await checkDbRateLimit(admin, `wa:out:bus:${busId}`, 60, 1);
    if (!busGuard.ok) {
      return NextResponse.json(
        {
          error: busGuard.checked
            ? `A notice for bus ${bus.bus_number} went out moments ago. Please wait a minute.`
            : "Messaging is unavailable right now. Please try again shortly.",
          code: "RATE_LIMITED",
        },
        { status: 429 }
      );
    }
    const actorLimit = await checkDbRateLimit(
      admin,
      `wa:out:actor:${user.id}`,
      PER_ACTOR_WINDOW_SECONDS,
      PER_ACTOR_MAX_ACTIONS
    );
    if (!actorLimit.ok) {
      return NextResponse.json(
        {
          error: actorLimit.checked
            ? "You have sent a lot of messages this hour. Please wait a while."
            : "Messaging is unavailable right now. Please try again shortly.",
          code: "RATE_LIMITED",
        },
        { status: 429 }
      );
    }

    const school = await getSchoolProfile(admin);
    const variables = [
      sanitizeTemplateParam(school.name, 100),
      sanitizeTemplateParam(bus.bus_number, 40),
      message,
      sanitizeTemplateParam(officePhoneParam(school.phones), 40),
    ];

    const result = await runBroadcast(admin, {
      kind: "bus_notice",
      actorId: user.id,
      actorRole: role,
      busId,
      academicYearId: year.id,
      templateName: WHATSAPP_TEMPLATES.busNotice,
      bodyText: message,
      recipients: recipients.map((r) => ({
        phoneE164: r.phoneE164,
        studentId: r.studentIds[0] ?? null,
        variables,
      })),
      skippedCount: unreachable.length,
      request,
      auditDetails: { riders: riders.length },
    });

    return NextResponse.json({
      ok: result.sent > 0,
      broadcastId: result.broadcastId,
      riders: riders.length,
      recipients: recipients.length,
      sent: result.sent,
      failed: result.failed,
      skipped: result.skipped,
      firstError: result.firstError,
    });
  } catch (err) {
    console.error("[whatsapp.bus-notice] POST failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
