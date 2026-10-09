import { NextRequest, NextResponse } from "next/server";
import { verifyAdminOrEditorWithUser } from "@nkps/shared/lib/verify-admin";
import { getSchoolProfile } from "@nkps/shared/lib/school-profile";
import { isWhatsAppConfigured, WHATSAPP_TEMPLATES } from "@nkps/shared/lib/messaging/whatsapp";
import {
  FEE_REMINDER_DEFAULT_NOTE,
  FEE_REMINDER_NOTE_MAX_CHARS,
  formatRupeesForMessage,
  sanitizeTemplateParam,
} from "@nkps/shared/lib/messaging/templates";
import { checkDbRateLimit } from "@/lib/ai/rate-limit-db";
import { getStudentDuesPosition } from "@/lib/student-dues";
import {
  CONTACT_COLUMNS,
  phoneLast4,
  resolveParentContact,
  type ContactableStudent,
} from "@/lib/messaging/recipients";
import { officePhoneParam, runBroadcast } from "@/lib/messaging/outbound";

export const runtime = "nodejs";

/**
 * A WhatsApp fee reminder to one family, quoting what they owe today.
 *
 * GET  ?studentId=  — the amount, who will receive it (relation + last four
 *                     digits), the session, and when the last reminder went.
 * POST              — { studentId, note? } sends it.
 *
 * Gated on the `fees` feature. The amount is computed here with
 * getStudentDuesPosition — the same computeDuesBreakdown the Dues register
 * runs, late fee included — so the figure in the message is the figure on
 * the screen the office is looking at. The client never supplies an amount
 * or a number.
 */

const PER_STUDENT_WINDOW_MS = 24 * 60 * 60 * 1000;
const PER_ACTOR_WINDOW_SECONDS = 3600;
const PER_ACTOR_MAX_ACTIONS = 30;

type AdminClient = NonNullable<
  Awaited<ReturnType<typeof verifyAdminOrEditorWithUser>>
>["admin"];

interface StudentRow extends ContactableStudent {
  admission_no: string | null;
}

async function loadStudent(admin: AdminClient, studentId: string): Promise<StudentRow | null> {
  const { data, error } = await admin
    .from("students")
    .select(`${CONTACT_COLUMNS}, admission_no`)
    .eq("id", studentId)
    .maybeSingle();
  if (error) throw new Error(`student lookup failed: ${error.message}`);
  return (data as StudentRow | null) ?? null;
}

/** The last reminder that actually left for this student, if any in the window. */
async function lastReminder(
  admin: AdminClient,
  studentId: string
): Promise<{ created_at: string; status: string } | null> {
  const since = new Date(Date.now() - PER_STUDENT_WINDOW_MS).toISOString();
  const { data } = await admin
    .from("whatsapp_messages")
    .select("created_at, status")
    .eq("student_id", studentId)
    .eq("template_name", WHATSAPP_TEMPLATES.feeReminder)
    .neq("status", "failed")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { created_at: string; status: string } | null) ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const gate = await verifyAdminOrEditorWithUser("fees");
    if (!gate) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { admin } = gate;

    const studentId = request.nextUrl.searchParams.get("studentId") ?? "";
    if (!studentId) {
      return NextResponse.json({ error: "studentId is required." }, { status: 400 });
    }

    const student = await loadStudent(admin, studentId);
    if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });

    const [position, recent, school] = await Promise.all([
      getStudentDuesPosition(admin, studentId),
      lastReminder(admin, studentId),
      getSchoolProfile(admin),
    ]);
    const contact = resolveParentContact(student);

    return NextResponse.json({
      configured: isWhatsAppConfigured(),
      student: {
        id: student.id,
        full_name: student.full_name,
        admission_no: student.admission_no,
        class_label: position?.classLabel ?? "",
      },
      contact: contact
        ? { type: contact.type, label: contact.label, last4: phoneLast4(contact.phoneE164) }
        : null,
      dues: position
        ? {
            total: Math.round(position.breakdown.dues),
            lateFee: Math.round(position.breakdown.lateFee),
            billedToDate: Math.round(position.breakdown.billedToDate),
            paid: Math.round(position.breakdown.paid),
          }
        : null,
      session: position?.academicYear?.name ?? null,
      lastReminderAt: recent?.created_at ?? null,
      maxNoteChars: FEE_REMINDER_NOTE_MAX_CHARS,
      defaultNote: FEE_REMINDER_DEFAULT_NOTE,
      schoolName: school.name,
      officePhone: officePhoneParam(school.phones),
    });
  } catch (err) {
    console.error("[whatsapp.fee-reminder] GET failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const gate = await verifyAdminOrEditorWithUser("fees");
    if (!gate) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { admin, user, role } = gate;

    if (!isWhatsAppConfigured()) {
      return NextResponse.json(
        { error: "WhatsApp messaging is not configured yet.", code: "NOT_CONFIGURED" },
        { status: 503 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const studentId = typeof body.studentId === "string" ? body.studentId : "";
    const note = sanitizeTemplateParam(
      typeof body.note === "string" ? body.note : "",
      FEE_REMINDER_NOTE_MAX_CHARS
    );
    if (!studentId) {
      return NextResponse.json({ error: "studentId is required." }, { status: 400 });
    }

    const student = await loadStudent(admin, studentId);
    if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });

    const contact = resolveParentContact(student);
    if (!contact) {
      return NextResponse.json(
        {
          error: "No valid parent mobile number on file for this student.",
          code: "NO_CONTACT_NUMBER",
        },
        { status: 400 }
      );
    }

    // One reminder per family per day. Counted from the log, so a send that
    // failed does not use up the day's reminder.
    const recent = await lastReminder(admin, studentId);
    if (recent) {
      return NextResponse.json(
        {
          error: "A fee reminder already went to this family in the last 24 hours.",
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

    const position = await getStudentDuesPosition(admin, studentId);
    const amount = position ? Math.round(position.breakdown.dues) : 0;
    if (!position || amount < 1) {
      return NextResponse.json(
        { error: "This student has no fees pending today.", code: "NO_DUES" },
        { status: 400 }
      );
    }

    const school = await getSchoolProfile(admin);
    const variables = [
      sanitizeTemplateParam(school.name, 100),
      formatRupeesForMessage(amount),
      sanitizeTemplateParam(student.full_name || "your child", 80),
      sanitizeTemplateParam(position.classLabel || "class not recorded", 40),
      sanitizeTemplateParam(position.academicYear?.name ?? "the current session", 40),
      note || FEE_REMINDER_DEFAULT_NOTE,
      sanitizeTemplateParam(officePhoneParam(school.phones), 40),
    ];

    const result = await runBroadcast(admin, {
      kind: "fee_reminder",
      actorId: user.id,
      actorRole: role,
      studentId,
      academicYearId: position.academicYear?.id ?? null,
      templateName: WHATSAPP_TEMPLATES.feeReminder,
      bodyText: note || null,
      recipients: [{ phoneE164: contact.phoneE164, studentId, variables }],
      skippedCount: 0,
      request,
      auditDetails: { amount, contact_type: contact.type },
    });

    return NextResponse.json({
      ok: result.sent > 0,
      broadcastId: result.broadcastId,
      amount,
      contact: { type: contact.type, label: contact.label, last4: phoneLast4(contact.phoneE164) },
      sent: result.sent,
      failed: result.failed,
      firstError: result.firstError,
    });
  } catch (err) {
    console.error("[whatsapp.fee-reminder] POST failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
