import { normalizeIndianMobile } from "@nkps/shared/lib/telephony/exotel";

/**
 * Which number a message to "the parent" actually goes to.
 *
 * Server-only. The client never sees a number — a dialog is told the relation
 * and the last four digits, nothing more — and never supplies one, so the
 * office cannot be made to message an arbitrary phone through the school's
 * account (same rule as click-to-call).
 *
 * ── One number per student ──────────────────────────────────────────────────
 * Every message is billed, and a family that gets the same bus notice on two
 * handsets gains nothing. `students.sms_mobile_source` is the office's own
 * choice of which column "receives messages" (migration 089); it wins when
 * set and valid. Otherwise father → mother → guardian. The student's own phone
 * is used only when the office pointed sms_mobile_source at it — a message
 * about a child's fees should not land on the child by default.
 */

export type ParentContactType = "father" | "mother" | "guardian" | "student";

export interface ContactableStudent {
  id: string;
  full_name: string | null;
  phone?: string | null;
  father_name?: string | null;
  father_mobile?: string | null;
  mother_name?: string | null;
  mother_mobile?: string | null;
  guardian_name?: string | null;
  guardian_mobile?: string | null;
  sms_mobile_source?: string | null;
}

export interface ParentContact {
  type: ParentContactType;
  /** The relation, for the UI: "Father", "Mother", "Guardian", "Student". */
  label: string;
  phoneE164: string;
}

/** The columns a recipient lookup must select from `students`. */
export const CONTACT_COLUMNS =
  "id, full_name, phone, father_name, father_mobile, mother_name, mother_mobile, guardian_name, guardian_mobile, sms_mobile_source";

const COLUMN_FOR: Record<ParentContactType, keyof ContactableStudent> = {
  father: "father_mobile",
  mother: "mother_mobile",
  guardian: "guardian_mobile",
  student: "phone",
};

const LABEL_FOR: Record<ParentContactType, string> = {
  father: "Father",
  mother: "Mother",
  guardian: "Guardian",
  student: "Student",
};

function contactOf(student: ContactableStudent, type: ParentContactType): ParentContact | null {
  const raw = student[COLUMN_FOR[type]];
  const phoneE164 = normalizeIndianMobile(typeof raw === "string" ? raw : null);
  if (!phoneE164) return null;
  return { type, label: LABEL_FOR[type], phoneE164 };
}

export function resolveParentContact(student: ContactableStudent): ParentContact | null {
  const preferred = student.sms_mobile_source;
  if (
    preferred === "father" ||
    preferred === "mother" ||
    preferred === "guardian" ||
    preferred === "student"
  ) {
    const chosen = contactOf(student, preferred);
    if (chosen) return chosen;
  }
  return (
    contactOf(student, "father") ??
    contactOf(student, "mother") ??
    contactOf(student, "guardian")
  );
}

/** Last four digits, for the UI and the message log. Never the full number. */
export function phoneLast4(phoneE164: string): string {
  return phoneE164.slice(-4);
}

export interface BusRecipient {
  phoneE164: string;
  /** Every student this number stands for — siblings share one message. */
  studentIds: string[];
  contactType: ParentContactType;
}

export interface UnreachableStudent {
  id: string;
  full_name: string;
}

/**
 * Collapses a bus's riders to the numbers that will be messaged.
 *
 * Siblings on the same bus usually share a parent's number; one notice per
 * number, with both children recorded against it. The unreachable list is
 * for the office, not the parent: these are the rows whose contact data
 * needs fixing on People → Students.
 */
export function groupBusRecipients(students: ContactableStudent[]): {
  recipients: BusRecipient[];
  unreachable: UnreachableStudent[];
} {
  const byPhone = new Map<string, BusRecipient>();
  const unreachable: UnreachableStudent[] = [];
  for (const s of students) {
    const contact = resolveParentContact(s);
    if (!contact) {
      unreachable.push({ id: s.id, full_name: s.full_name ?? "" });
      continue;
    }
    const existing = byPhone.get(contact.phoneE164);
    if (existing) existing.studentIds.push(s.id);
    else {
      byPhone.set(contact.phoneE164, {
        phoneE164: contact.phoneE164,
        studentIds: [s.id],
        contactType: contact.type,
      });
    }
  }
  return { recipients: [...byPhone.values()], unreachable };
}
