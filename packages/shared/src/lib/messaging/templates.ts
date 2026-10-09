// The WhatsApp templates the office sends, as Meta approved them.
//
// Pure and dependency-free on purpose: the client renders the same body for
// the in-dialog preview that the server fills in for Meta, so what the office
// sees is what the parent gets. The provider client (./whatsapp.ts) is
// server-only and imports the names from here.
//
// ── Why templates at all ─────────────────────────────────────────────────────
// A business may send free text only inside the 24 hours after the recipient
// wrote to it. Parents have not written to the school's number, so every
// office-initiated message is a Meta-approved template, and the text the
// office types travels as a template PARAMETER. Meta's rules for a parameter:
// no newline, no tab, no run of more than four spaces, and the whole message
// under 1024 characters. sanitizeTemplateParam() enforces the first three;
// the per-feature caps keep the fourth.
//
// Changing a body here without re-approving it in Meta Business Manager does
// not change what parents receive — Meta sends ITS copy. Change both, together.

export interface WhatsAppTemplateSpec {
  /** Exact name in Meta Business Manager. */
  name: string;
  /** Meta category. Both are utility: transactional, no promotion. */
  category: "utility";
  language: "en";
  /** Body as approved, with {{n}} placeholders, 1-based. */
  body: string;
  /** What each placeholder carries, in order — documentation and a length check. */
  params: readonly string[];
}

export const WHATSAPP_TEMPLATE_SPECS = {
  busNotice: {
    name: "nkps_bus_notice",
    category: "utility",
    language: "en",
    body:
      "Dear Parent, this is a message from {{1}} about school bus {{2}}.\n\n" +
      "{{3}}\n\n" +
      "For any help, please call the school office on {{4}}.",
    params: ["school_name", "bus_number", "notice", "office_phone"],
  },
  feeReminder: {
    name: "nkps_fee_reminder",
    category: "utility",
    language: "en",
    body:
      "Dear Parent, this is a gentle reminder from {{1}}. Fees of Rs. {{2}} are " +
      "pending for {{3}} ({{4}}) for the session {{5}}.\n\n" +
      "{{6}}\n\n" +
      "For any queries, please call the school office on {{7}}.",
    params: [
      "school_name",
      "amount",
      "student_name",
      "class_label",
      "session_name",
      "note",
      "office_phone",
    ],
  },
} as const satisfies Record<string, WhatsAppTemplateSpec>;

export type WhatsAppTemplateKey = keyof typeof WHATSAPP_TEMPLATE_SPECS;

/** Longest notice the office may type for a bus. */
export const BUS_NOTICE_MAX_CHARS = 500;
/** Longest optional note on a fee reminder. */
export const FEE_REMINDER_NOTE_MAX_CHARS = 300;
/** Fills {{6}} when the office leaves the note blank — Meta rejects an empty parameter. */
export const FEE_REMINDER_DEFAULT_NOTE =
  "Kindly clear the pending amount at the school office at your earliest convenience.";

/**
 * Makes free text safe to travel as a template parameter.
 *
 * Every run of whitespace (including newlines and tabs) becomes one space,
 * which is the only way to satisfy Meta's "no newline, no tab, no more than
 * four consecutive spaces" rule without guessing at paragraph structure. The
 * office sees the flattened text in the preview before it sends, so nothing
 * is lost silently. Truncation adds an ellipsis so a cut is visible.
 */
export function sanitizeTemplateParam(raw: string | null | undefined, max: number): string {
  const flat = String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (flat.length <= max) return flat;
  return flat.slice(0, Math.max(0, max - 1)).trimEnd() + "…";
}

/**
 * Substitutes the parameters into the body, for the preview.
 *
 * A missing parameter is left as its placeholder rather than blanked: a
 * preview that reads "{{3}}" tells the operator the form is incomplete, while
 * a silent gap would read as a finished message.
 */
export function renderWhatsAppTemplate(
  spec: WhatsAppTemplateSpec,
  params: readonly string[]
): string {
  return spec.body.replace(/\{\{(\d+)\}\}/g, (match, n: string) => {
    const value = params[Number(n) - 1];
    return value === undefined || value === "" ? match : value;
  });
}

/** Rupees as the message states them: Indian grouping, no decimals. */
export function formatRupeesForMessage(amount: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
    Math.max(0, Math.round(amount))
  );
}
