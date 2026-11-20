import type {
  EffectiveFeeLine,
  FeeFrequency,
  FeeStructure,
  FeeStudentType,
  TransportDirection,
  TransportFeeLine,
} from "@nkps/shared/types";

export const FEE_FREQ_MULTIPLIER: Record<string, number> = {
  monthly: 12,
  quarterly: 4,
  annual: 1,
  one_time: 1,
};

type Annualizable = { amount: number | string; frequency: string };

export function annualizedAmount(fs: Annualizable): number {
  const mult = FEE_FREQ_MULTIPLIER[fs.frequency] ?? 1;
  return Number(fs.amount) * mult;
}

export function sumAnnualized(structures: Annualizable[]): number {
  return structures.reduce((sum, fs) => sum + annualizedAmount(fs), 0);
}

// How many months a recurring fee advances between charges.
const FEE_FREQ_STEP_MONTHS: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
};

// Whole months from `from` to `to` (both YYYY-MM-DD), counting a month only
// once its day-of-month has been reached. 10 Apr → 6 Aug is 3 months, not 4.
function wholeMonthsBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.slice(0, 10).split("-").map(Number);
  const [ty, tm, td] = to.slice(0, 10).split("-").map(Number);
  const months = (ty - fy) * 12 + (tm - fm);
  return td >= fd ? months : months - 1;
}

// What a fee line has actually become payable for as of `today`.
//
// The annualized amount answers "what does this student owe for the year";
// the dues register needs "what does this student owe *right now*". A tuition
// instalment due in January is not an arrear in August, and listing it as one
// makes the register useless for chasing actual defaulters.
//
//   • one_time / annual  — the whole amount once its due date arrives; nothing
//                          before that. This is every schedule row.
//   • monthly / quarterly — one charge per elapsed period since the anchor,
//                          capped at the year's full count. Anchor is the row's
//                          own due date, else the academic year's start.
//   • no anchor at all    — billed in full. An undated fee has no schedule to
//                          defer it by, and under-reporting a real debt is the
//                          worse error.
export function amountBilledToDate(
  fs: { amount: number | string; frequency: string; due_date?: string | null },
  today: string,
  yearStartDate?: string | null
): number {
  const amount = Number(fs.amount);
  if (!Number.isFinite(amount)) return 0;
  const step = FEE_FREQ_STEP_MONTHS[fs.frequency];

  if (!step) {
    // Charged once. Payable from its due date; undated means payable now.
    if (fs.due_date && fs.due_date.slice(0, 10) > today.slice(0, 10)) return 0;
    return amount;
  }

  const anchor = (fs.due_date ?? yearStartDate ?? "").slice(0, 10);
  if (!anchor) return annualizedAmount(fs);
  if (anchor > today.slice(0, 10)) return 0;

  const periodsMax = FEE_FREQ_MULTIPLIER[fs.frequency] ?? 1;
  const elapsed = Math.floor(wholeMonthsBetween(anchor, today) / step) + 1;
  return amount * Math.min(Math.max(elapsed, 0), periodsMax);
}

export function sumBilledToDate(
  structures: Annualizable[] & { due_date?: string | null }[],
  today: string,
  yearStartDate?: string | null
): number {
  return structures.reduce(
    (sum, fs) => sum + amountBilledToDate(fs, today, yearStartDate),
    0
  );
}

// Whether a fee line's student_type restriction admits this student.
// A line marked 'both' (the default, and every legacy row) bills everyone.
// `studentType` of null means "unknown" — bill only the unrestricted lines
// rather than guessing, so an unresolvable admission date never silently
// levies an admission fee on a returning student.
export function feeAppliesToStudentType(
  lineType: FeeStudentType | null | undefined,
  studentType: FeeStudentType | null
): boolean {
  const restriction = lineType ?? "both";
  if (restriction === "both") return true;
  return restriction === studentType;
}

// Classify a student as newly-admitted vs returning for a given academic year.
// "New" means their admission date falls inside the year being billed — the
// same rule the office uses when deciding whether the admission/registration
// fee is chargeable. Returns null when either date is missing, which callers
// treat as "restricted lines don't apply".
export function resolveStudentType(
  admissionDate: string | null | undefined,
  year: { start_date: string | null; end_date: string | null } | null
): FeeStudentType | null {
  if (!admissionDate || !year?.start_date) return null;
  const admitted = admissionDate.slice(0, 10);
  if (admitted < year.start_date.slice(0, 10)) return "existing";
  // An admission dated after the year closes isn't this year's intake either.
  if (year.end_date && admitted > year.end_date.slice(0, 10)) return "existing";
  return "new";
}

// Resolve which fee_structures rows actually apply to a given student.
//
// Override rule: if a stream-specific structure exists for the student's
// stream and a given fee_type, the class-wide (stream_id NULL) structure for
// the same fee_type is hidden. Structures belonging to other streams are
// dropped. Transport rows shouldn't exist in fee_structures any more (they
// live in bus_stop_fees after migration 074) — but we filter defensively.
//
// Student-type rule (migration 085): a schedule row may bill only newly
// admitted or only returning students. It is applied AFTER the stream
// override is computed, so a stream that defines a 'new'-only admission fee
// still suppresses the class-wide row for that head — otherwise a returning
// XI Science student would fall back to the class-wide schedule the stream
// deliberately replaced.
export function resolveEffectiveFeeStructures(
  structures: FeeStructure[],
  opts: {
    studentStreamId: string | null;
    studentType?: FeeStudentType | null;
    /**
     * Skip the student-type rule, keeping only the stream override.
     *
     * For anything that decides what a student OWES this must stay false —
     * that is the whole point of the rule. The historical day-book importer
     * sets it when placing money that was ALREADY received: 209 students in
     * the 2026-27 import paid an admission fee, some of them returning
     * students the schedule would not have billed, and their receipts still
     * have to land somewhere. It is used there as a per-head fallback, not as
     * the primary resolution.
     */
    ignoreStudentType?: boolean;
  }
): FeeStructure[] {
  const { studentStreamId, studentType = null, ignoreStudentType = false } = opts;

  const visible = structures.filter((fs) => {
    if (fs.fee_type === "Transport") return false;
    if (fs.stream_id && fs.stream_id !== studentStreamId) return false;
    return true;
  });

  const overriddenTypes = new Set(
    visible
      .filter((fs) => fs.stream_id && fs.stream_id === studentStreamId)
      .map((fs) => fs.fee_type)
  );

  return visible.filter(
    (fs) =>
      !(fs.stream_id == null && overriddenTypes.has(fs.fee_type)) &&
      (ignoreStudentType || feeAppliesToStudentType(fs.student_type, studentType))
  );
}

// Chronological order of a schedule as the office reads it: earliest due date
// first, then the explicit instalment number, then the fee head. Rows without
// a due date (legacy recurring fees) sort last so the dated schedule leads.
export function compareScheduleRows(
  a: Pick<FeeStructure, "due_date" | "instalment_no" | "fee_type">,
  b: Pick<FeeStructure, "due_date" | "instalment_no" | "fee_type">
): number {
  if (a.due_date !== b.due_date) {
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date < b.due_date ? -1 : 1;
  }
  const an = a.instalment_no ?? Number.MAX_SAFE_INTEGER;
  const bn = b.instalment_no ?? Number.MAX_SAFE_INTEGER;
  if (an !== bn) return an - bn;
  return a.fee_type.localeCompare(b.fee_type);
}

// Human label for a fee line: the instalment name when the row belongs to a
// schedule ("1st Instalment (Tuition Fee)"), else the bare fee head. Used on
// the payments dropdown, receipts and the parent/student portals so a family
// paying the 2nd instalment sees which instalment they paid.
export function feeLineLabel(line: {
  fee_type: string;
  instalment_name?: string | null;
}): string {
  const name = line.instalment_name?.trim();
  return name ? `${line.fee_type} — ${name}` : line.fee_type;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// `fee_payments.month` holds three shapes, depending on where the row came
// from: "2026-04" from the record-payment form's month picker (transport,
// waivers), "April, 2026" copied from a schedule row's month_label, and "APR"
// from a day-book import, which carries no year. The first is the one a
// person can't read at a glance, so it becomes "April 2026"; the others are
// already words and pass through as written.
export function formatFeeMonth(month: string | null | undefined): string | null {
  const raw = month?.trim();
  if (!raw) return null;
  const iso = /^(\d{4})-(\d{2})$/.exec(raw);
  if (iso) {
    const name = MONTH_NAMES[Number(iso[2]) - 1];
    if (name) return `${name} ${iso[1]}`;
  }
  return raw;
}

// Chronological sort key ("YYYY-MM") for the same column, so a sort puts
// March 2027 after April 2026 rather than alphabetically before it. A value
// with no year to place it ("APR") sorts after the dated ones, by its text.
export function feeMonthSortKey(month: string | null | undefined): string | null {
  const raw = month?.trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  const named = /^([A-Za-z]+)[\s,]+(\d{4})$/.exec(raw);
  if (named) {
    const word = named[1].toLowerCase();
    const idx = MONTH_NAMES.findIndex((m) =>
      m.toLowerCase().startsWith(word.slice(0, 3))
    );
    if (idx >= 0 && word.length >= 3) {
      return `${named[2]}-${String(idx + 1).padStart(2, "0")}`;
    }
  }
  return `~${raw.toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// Transport months — several bus months in one payment (migration 139)
// ---------------------------------------------------------------------------

/** Every month of the session as YYYY-MM, from its start date to its end date. */
export function sessionMonths(startDate: string, endDate: string): string[] {
  const [sy, sm] = startDate.slice(0, 7).split("-").map(Number);
  const [ey, em] = endDate.slice(0, 7).split("-").map(Number);
  if (!sy || !sm || !ey || !em) return [];
  const out: string[] = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    if (out.length > 24) break; // a runaway range is a bad session, not a long one
  }
  return out;
}

export type TransportMonthState = "paid" | "part" | "due" | "upcoming";

export interface TransportMonthStatus {
  /** YYYY-MM */
  month: string;
  fee: number;
  settled: number;
  remaining: number;
  state: TransportMonthState;
}

/**
 * Each session month of a bus fee, with what has been settled against it.
 * `payments` are the student's rows (any line); only this stop's are read.
 * A payment stored with an unreadable month ("APR", no year) or none at all
 * is not placed on any month — it still counts in the dues total.
 */
export function transportMonthLedger(opts: {
  months: string[];
  fee: number;
  busStopId: string;
  payments: Array<{
    bus_stop_id?: string | null;
    month?: string | null;
    status: string;
    amount_paid: number | string;
    refund_amount?: number | string | null;
    waiver_amount?: number | string | null;
  }>;
  /** YYYY-MM-DD */
  today: string;
}): TransportMonthStatus[] {
  const settledByMonth = new Map<string, number>();
  for (const p of opts.payments) {
    if (p.bus_stop_id !== opts.busStopId) continue;
    if (!["paid", "partial", "refunded"].includes(p.status)) continue;
    const key = feeMonthSortKey(p.month);
    if (!key || key.startsWith("~")) continue;
    settledByMonth.set(key, (settledByMonth.get(key) ?? 0) + settledAmount({
      fee_structure_id: null,
      amount_paid: p.amount_paid,
      refund_amount: p.refund_amount,
      waiver_amount: p.waiver_amount,
    }));
  }
  const thisMonth = opts.today.slice(0, 7);
  return opts.months.map((month) => {
    const settled = Math.round((settledByMonth.get(month) ?? 0) * 100) / 100;
    const remaining = Math.max(0, Math.round((opts.fee - settled) * 100) / 100);
    const state: TransportMonthState =
      remaining <= 0.005
        ? "paid"
        : settled > 0
          ? "part"
          : month <= thisMonth
            ? "due"
            : "upcoming";
    return { month, fee: opts.fee, settled, remaining, state };
  });
}

export type MonthAllocation =
  | { ok: true; slices: Array<{ month: string; amount: number; full: boolean }> }
  | { ok: false; error: string };

/**
 * Split one payment across the ticked bus months, oldest first — what a fee
 * counter does. Every month but the last must be paid in full; the last may
 * be part-paid. The form previews with this and the payments route enforces
 * it, so the two can never disagree.
 */
export function allocateAcrossMonths(
  amount: number,
  months: Array<{ month: string; remaining: number }>
): MonthAllocation {
  if (months.length === 0) {
    return { ok: false, error: "Pick the month(s) this bus fee is for." };
  }
  const sorted = [...months].sort((a, b) => a.month.localeCompare(b.month));
  const paid = sorted.find((m) => m.remaining <= 0.005);
  if (paid) {
    return {
      ok: false,
      error: `${formatFeeMonth(paid.month)} is already paid. Untick it.`,
    };
  }
  const total = Math.round(sorted.reduce((s, m) => s + m.remaining, 0) * 100) / 100;
  if (amount > total + 0.005) {
    return {
      ok: false,
      error: `₹${amount} is more than the ${sorted.length} month${
        sorted.length === 1 ? "" : "s"
      } ticked still owe (₹${total}). Tick another month, or reduce the amount.`,
    };
  }
  const slices: Array<{ month: string; amount: number; full: boolean }> = [];
  let left = Math.round(amount * 100) / 100;
  for (const m of sorted) {
    const take = Math.round(Math.min(m.remaining, left) * 100) / 100;
    if (take <= 0) {
      const needed =
        Math.round(
          sorted
            .slice(0, sorted.indexOf(m))
            .reduce((s, x) => s + x.remaining, 0) * 100
        ) / 100;
      return {
        ok: false,
        error: `₹${amount} doesn't reach ${formatFeeMonth(m.month)}. Untick it, or take more than ₹${needed}.`,
      };
    }
    slices.push({ month: m.month, amount: take, full: take >= m.remaining - 0.005 });
    left = Math.round((left - take) * 100) / 100;
  }
  return { ok: true, slices };
}

/** "April – June 2026", "April, May and July 2026", "December 2026 – January 2027". */
export function formatMonthSpan(months: string[]): string {
  const sorted = [...new Set(months)].sort();
  if (sorted.length === 0) return "";
  if (sorted.length === 1) return formatFeeMonth(sorted[0]) ?? sorted[0];
  const idx = (m: string) => {
    const [y, mo] = m.split("-").map(Number);
    return y * 12 + mo;
  };
  const consecutive = sorted.every((m, i) => i === 0 || idx(m) === idx(sorted[i - 1]) + 1);
  const name = (m: string) => MONTH_NAMES[Number(m.slice(5, 7)) - 1] ?? m;
  const sameYear = sorted[0].slice(0, 4) === sorted[sorted.length - 1].slice(0, 4);
  if (consecutive) {
    return sameYear
      ? `${name(sorted[0])} – ${name(sorted[sorted.length - 1])} ${sorted[0].slice(0, 4)}`
      : `${formatFeeMonth(sorted[0])} – ${formatFeeMonth(sorted[sorted.length - 1])}`;
  }
  if (sameYear) {
    const names = sorted.map(name);
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} ${sorted[0].slice(0, 4)}`;
  }
  return sorted.map((m) => formatFeeMonth(m)).join(", ");
}

// The date a late fee starts accruing from. Schedules set an explicit grace
// date (due 01/04 → late fee from 12/04); rows without one fall back to the
// due date, which is how every pre-085 structure behaved.
// A discount is stored as a waiver row: amount_paid 0 by schema, the value in
// waiver_amount. A history that prints amount_paid shows every discount as
// ₹0 — which is how applied discounts came to be filed a second time.
export function isDiscountPayment(p: { payment_method?: string | null }): boolean {
  return p.payment_method === "waiver";
}

/** The figure a payment-history row shows: a discount's value, or the cash received. */
export function paymentDisplayAmount(p: {
  payment_method?: string | null;
  amount_paid: number | string | null;
  waiver_amount?: number | string | null;
}): number {
  return isDiscountPayment(p)
    ? Number(p.waiver_amount ?? 0)
    : Number(p.amount_paid ?? 0);
}

export function lateFeeAnchorDate(fs: {
  due_date: string | null;
  late_fee_start_date?: string | null;
}): string | null {
  return fs.late_fee_start_date ?? fs.due_date;
}

// Late fee owed on a single unsettled fee line as of `today` (YYYY-MM-DD).
//
//   min( max(amount * late_fee_percent/100, daysOverdue * late_fee_per_day),
//        late_fee_max ?? Infinity )
//
// Returns 0 when the line isn't overdue yet or carries no late-fee rule. The
// caller decides whether the line is still owed — this function only prices
// the surcharge. Shared by the admin dues view and the per-student pages so
// the two can't drift.
export function computeLateFee(
  fs: {
    amount: number | string;
    due_date: string | null;
    late_fee_start_date?: string | null;
    late_fee_percent?: number | string | null;
    late_fee_per_day?: number | string | null;
    late_fee_max?: number | string | null;
  },
  today: string
): number {
  const anchor = lateFeeAnchorDate(fs);
  if (!anchor || anchor >= today) return 0;
  const pct = Number(fs.late_fee_percent ?? 0);
  const perDay = Number(fs.late_fee_per_day ?? 0);
  if (pct === 0 && perDay === 0) return 0;
  const daysOverdue = Math.max(
    0,
    Math.floor((Date.parse(today) - Date.parse(anchor)) / 86_400_000)
  );
  const raw = Math.max((Number(fs.amount) * pct) / 100, daysOverdue * perDay);
  const cap = fs.late_fee_max != null ? Number(fs.late_fee_max) : Infinity;
  return Math.min(raw, cap);
}

// A per-year fee row for a stop, joined with its stop name.
export type StopFeeLookup = {
  bus_stop_id: string;
  stop_name: string;
  amount: number | string;
  frequency: string;
  is_active: boolean;
};

// Synthesize a transport fee line from the student's assigned bus stop.
//
// Fee is the stop's flat amount, UNLESS the student has a one-side facility
// (direction != 'both'), in which case the per-student custom override is the
// billed amount. Returns null if the student isn't opted in, has no stop, or
// the stop has no active fee for the year.
export function resolveTransportLine(opts: {
  hasTransport: boolean;
  busStopId: string | null;
  direction: TransportDirection;
  feeOverride: number | null;
  stopFees: StopFeeLookup[];
}): TransportFeeLine | null {
  const { hasTransport, busStopId, direction, feeOverride, stopFees } = opts;
  if (!hasTransport || !busStopId) return null;
  const fee = stopFees.find((f) => f.bus_stop_id === busStopId && f.is_active);
  if (!fee) return null;

  const isOneSide = direction !== "both";
  const amount =
    isOneSide && feeOverride != null ? Number(feeOverride) : Number(fee.amount);

  return {
    kind: "transport_stop",
    id: fee.bus_stop_id,
    fee_type: "Transport",
    amount,
    frequency: fee.frequency as FeeFrequency,
    due_date: null,
    late_fee_percent: 0,
    late_fee_fixed_amount: 0,
    late_fee_per_day: 0,
    late_fee_max: null,
    late_fee_start_date: null,
    stream_id: null,
    instalment_no: null,
    instalment_name: null,
    month_label: null,
    student_type: "both",
    stop_name: fee.stop_name,
    direction,
  };
}

// Combine the academic and transport lines into one array consumers can map
// over. `fee_structure` rows get a `kind: 'fee_structure'` tag so caller can
// branch when recording payments (different FK).
export function resolveEffectiveFeeLines(opts: {
  structures: FeeStructure[];
  studentStreamId: string | null;
  studentType?: FeeStudentType | null;
  hasTransport: boolean;
  busStopId: string | null;
  direction: TransportDirection;
  feeOverride: number | null;
  stopFees: StopFeeLookup[];
}): EffectiveFeeLine[] {
  const academic = resolveEffectiveFeeStructures(opts.structures, {
    studentStreamId: opts.studentStreamId,
    studentType: opts.studentType ?? null,
  })
    .sort(compareScheduleRows)
    .map<EffectiveFeeLine>((fs) => ({ ...fs, kind: "fee_structure" }));
  const transport = resolveTransportLine(opts);
  return transport ? [...academic, transport] : academic;
}

// ---------------------------------------------------------------------------
// Billing cutoff — a student who has left stops being billed
// ---------------------------------------------------------------------------

// Enrollment statuses that end a student's liability. 'passed' and 'failed'
// are year-end bookkeeping on a student who was on the roll all year, so they
// are deliberately NOT here — the whole session is still owed.
const EXIT_STATUSES = new Set(["exited", "terminated"]);

/** An enrollment, reduced to the three fields the cutoff is derived from. */
export type BillableEnrollment = {
  status?: string | null;
  exit_date?: string | null;
  status_changed_at?: string | null;
};

/**
 * The last date this enrollment may be billed for, or null for "still on the
 * roll, bill to today".
 *
 * Dues are computed from the calendar, not the roster: amountBilledToDate()
 * charges every instalment whose due date has passed. Left alone, a student
 * who exited after the first quarter keeps acquiring the second quarter's
 * instalment, then the third — arrears the school never meant to raise, which
 * then distort the register, the No-Dues list and every total built on them.
 *
 * `exit_date` (migration 123) is the office's recorded last day on the roll
 * and is the authority. `status_changed_at` is the fallback for the exits that
 * predate the column and for the bulk importers that write `status` directly:
 * it is when the exit was TYPED, so it is later than the truth whenever the
 * paperwork lagged, but a late cutoff still beats no cutoff at all.
 *
 * Note this reads `status` first — a date left behind on an enrollment that
 * was later re-activated is ignored, not applied.
 */
export function resolveBillingCutoff(
  enrollment: BillableEnrollment | null | undefined
): string | null {
  if (!enrollment) return null;
  if (!enrollment.status || !EXIT_STATUSES.has(enrollment.status)) return null;
  const recorded = enrollment.exit_date ?? enrollment.status_changed_at;
  return recorded ? recorded.slice(0, 10) : null;
}

/**
 * The date a dues calculation should treat as "now" for one student: today,
 * or their leaving date once they have left. Never later than `today`, so a
 * leaving date typed into the future cannot bill a student ahead of the clock.
 */
export function effectiveBillingDate(
  today: string,
  billingCutoff: string | null | undefined
): string {
  const day = today.slice(0, 10);
  if (!billingCutoff) return day;
  const cutoff = billingCutoff.slice(0, 10);
  return cutoff < day ? cutoff : day;
}

// ---------------------------------------------------------------------------
// Dues
// ---------------------------------------------------------------------------

// A receipt row, reduced to the fields the dues maths reads. Waiver rows have
// amount_paid 0 by schema and carry their value in waiver_amount.
export type DuesPaymentRow = {
  fee_structure_id: string | null;
  amount_paid: number | string;
  waiver_amount?: number | string | null;
  refund_amount?: number | string | null;
};

// Net cash a receipt actually settled. A partial refund leaves amount_paid
// intact and records the returned portion separately, so the settled figure is
// the difference (never negative), plus any waived amount.
export function settledAmount(p: DuesPaymentRow): number {
  return (
    Math.max(0, Number(p.amount_paid) - Number(p.refund_amount ?? 0)) +
    Number(p.waiver_amount ?? 0)
  );
}

export interface DuesBreakdown {
  /**
   * Whole-year obligation across every applicable line — or, for a student who
   * has left, the obligation up to their leaving date. A leaver's year ended
   * when they did, so their full-session figure is not a debt anyone will
   * collect.
   */
  expected: number;
  /** The slice of `expected` that has actually fallen due as of `today`. */
  billedToDate: number;
  /** Settled cash + waivers, net of refunds. */
  paid: number;
  /** Surcharge on overdue, individually-unsettled lines. Zero once cleared. */
  lateFee: number;
  /** What is owed today: `billedToDate - paid`, floored at 0, plus lateFee. */
  dues: number;
}

/**
 * Price one student's position from their resolved fee lines and receipts.
 *
 * The single source of truth for "what does this student owe": the class-wide
 * register and the per-student payment screen both call this, so the figure an
 * operator reads next to a student's name is the same one the Dues report
 * counts them under.
 *
 * `lines` must already be narrowed to the student (stream overrides applied,
 * student-type restriction honoured, their own transport stop priced) —
 * `resolveEffectiveFeeLines` produces exactly that. `payments` must already be
 * scoped to the academic year being billed and to receipt-bearing statuses.
 */
export function computeDuesBreakdown(opts: {
  lines: EffectiveFeeLine[];
  payments: DuesPaymentRow[];
  /** YYYY-MM-DD. One reference for a whole pass, so neighbouring rows agree. */
  today: string;
  /** Anchor for recurring lines that carry no due date of their own. */
  yearStartDate?: string | null;
  /**
   * Last date this student may be billed for — `resolveBillingCutoff()` of
   * their enrollment. Null (the default) means they are still on the roll and
   * billing runs to `today`.
   *
   * Every caller that prices a roster which can include leavers must pass
   * this. Omitting it bills a student who left in June for the whole session,
   * which is the bug migration 123 exists to fix.
   */
  billingCutoff?: string | null;
}): DuesBreakdown {
  const {
    lines,
    payments,
    today,
    yearStartDate = null,
    billingCutoff = null,
  } = opts;

  // Everything below prices as of this date, not today's. For a student still
  // on the roll the two are the same; for one who has left, the calendar stops
  // on their last day and no later instalment is ever charged.
  const asOf = effectiveBillingDate(today, billingCutoff);

  // A leaver owes what had fallen due by the day they left, and nothing for
  // the rest of the session — so their "expected" is that same figure rather
  // than the annualised total, and the register stops reporting a year's fees
  // against a child who attended one quarter of it.
  const expected = billingCutoff
    ? lines.reduce((sum, l) => sum + amountBilledToDate(l, asOf, yearStartDate), 0)
    : lines.reduce((sum, l) => sum + annualizedAmount(l), 0);
  const billedToDate = lines.reduce(
    (sum, l) => sum + amountBilledToDate(l, asOf, yearStartDate),
    0
  );
  const paid = payments.reduce((sum, p) => sum + settledAmount(p), 0);

  // Net settled per fee structure, so the late-fee pass can ask "is THIS line
  // still owed?" rather than gating on the student's aggregate balance — a
  // line paid on time must not be surcharged because another one is overdue.
  const paidByStructure = new Map<string, number>();
  for (const p of payments) {
    if (!p.fee_structure_id) continue;
    paidByStructure.set(
      p.fee_structure_id,
      (paidByStructure.get(p.fee_structure_id) ?? 0) + settledAmount(p)
    );
  }

  // Transport lines carry no late-fee rule, so they are skipped outright
  // rather than relying on computeLateFee returning 0 for them.
  //
  // Both halves run on `asOf`, so a leaver's surcharge freezes on the day they
  // left instead of compounding for the rest of the session. The per-line
  // "still owed?" test uses the billed-to-cutoff amount for them too: judging a
  // part-year liability against the annualised figure would mark a fully
  // settled line unpaid and surcharge it.
  const lateFee = lines.reduce((sum, l) => {
    if (l.kind !== "fee_structure") return sum;
    const lineExpected = billingCutoff
      ? amountBilledToDate(l, asOf, yearStartDate)
      : annualizedAmount(l);
    if ((paidByStructure.get(l.id) ?? 0) >= lineExpected) return sum;
    return sum + computeLateFee(l, asOf);
  }, 0);

  // Money paid ahead against a future instalment still counts as settled, so a
  // family that clears the year in April shows Nil rather than a phantom
  // credit. The surcharge stops as soon as everything billed is covered.
  const baseDues = Math.max(0, billedToDate - paid);
  const effectiveLateFee = baseDues > 0 ? lateFee : 0;

  return {
    expected,
    billedToDate,
    paid,
    lateFee: effectiveLateFee,
    dues: baseDues + effectiveLateFee,
  };
}

// ---------------------------------------------------------------------------
// Instalment-wise position — which quarter the money is owed against
// ---------------------------------------------------------------------------
//
// computeDuesBreakdown() answers "how much does this student owe today" with
// one number: everything billed to date, less everything settled. That is the
// right headline, but it cannot say WHICH instalment is unpaid — money paid
// ahead on the third instalment quietly covers an unpaid second one, and the
// fee office reported it could no longer tell "the quarter against which the
// amount is due". The ledger below splits the same money per instalment (and
// per quarter of bus months), and is built so that its total is the
// headline's total to the paisa:
//
//   dues = max(0, Σ dueNow − credit) + lateFee
//
// where `credit` is money settled beyond what its own row has billed (paid
// ahead) plus money that fits no row at all (a removed instalment, a bus
// payment with no readable month).

export type Quarter = 1 | 2 | 3 | 4;

/** Quarter of the session a date falls in: its first three months are Q1. */
export function academicQuarterOf(date: string, yearStartDate: string): Quarter {
  const [y, m] = date.slice(0, 7).split("-").map(Number);
  const [sy, sm] = yearStartDate.slice(0, 7).split("-").map(Number);
  const diff = (y - sy) * 12 + (m - sm);
  return Math.min(4, Math.floor(Math.max(0, diff) / 3) + 1) as Quarter;
}

export type LedgerPayment = DuesPaymentRow & {
  bus_stop_id?: string | null;
  month?: string | null;
  payment_method?: string | null;
};

export type InstalmentState = "paid" | "part" | "overdue" | "due" | "upcoming";

export interface InstalmentPosition {
  /** The line id, or `<stop id>:Q<n>` for a quarter of bus months. */
  key: string;
  kind: "fee_structure" | "transport";
  /** The fee line, for its label (instalment name, stop). */
  line: EffectiveFeeLine;
  /** For a bus-fee quarter: the months it covers (YYYY-MM). */
  months: string[] | null;
  quarter: Quarter | null;
  due_date: string | null;
  /** Whole-session amount of this row — to the leaving date, for a leaver. */
  amount: number;
  /** The slice of `amount` that has fallen due. */
  billed: number;
  /** Cash received against this row, net of refunds. */
  paid: number;
  discount: number;
  /** `amount − paid − discount`, floored at 0. */
  outstanding: number;
  /** `billed − paid − discount`, floored at 0: what is owed on it today. */
  dueNow: number;
  /** Settled beyond what has fallen due — money paid ahead. */
  advance: number;
  lateFee: number;
  state: InstalmentState;
}

export interface InstalmentLedger {
  rows: InstalmentPosition[];
  /** Settled money that fits no row. Counts as credit. */
  unallocated: number;
  /** Σ dueNow by quarter, academic lines and bus fee kept apart. */
  dueByQuarter: { academic: Record<Quarter, number>; transport: Record<Quarter, number> };
  /** Σ outstanding (whole session) by quarter. */
  outstandingByQuarter: { academic: Record<Quarter, number>; transport: Record<Quarter, number> };
  /** Σ dueNow over every row. */
  dueNowGross: number;
  /** Paid ahead plus unallocated — what nets the gross figure down to the headline. */
  credit: number;
  /** Discounts recorded for the session, on any row or none. */
  discount: number;
  /** Equals computeDuesBreakdown().lateFee. */
  lateFee: number;
  /** Equals computeDuesBreakdown().dues. */
  dues: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const zeroQuarters = (): Record<Quarter, number> => ({ 1: 0, 2: 0, 3: 0, 4: 0 });

function rowState(row: { outstanding: number; billed: number; paid: number; discount: number; lateFee: number }): InstalmentState {
  if (row.outstanding <= 0.005) return "paid";
  const settled = row.paid + row.discount;
  if (row.billed <= 0.005) return settled > 0 ? "part" : "upcoming";
  if (settled > 0.005) return "part";
  return row.lateFee > 0 ? "overdue" : "due";
}

export function computeInstalmentLedger(opts: {
  lines: EffectiveFeeLine[];
  /** The session's receipts, as computeDuesBreakdown takes them. */
  payments: LedgerPayment[];
  today: string;
  yearStartDate: string | null;
  /** The session's months (sessionMonths()), for placing bus fees by month. */
  sessionMonthList: string[];
  billingCutoff?: string | null;
}): InstalmentLedger {
  const { lines, payments, today, yearStartDate, sessionMonthList } = opts;
  const billingCutoff = opts.billingCutoff ?? null;
  const asOf = effectiveBillingDate(today, billingCutoff);
  const quarterOf = (d: string | null) =>
    d && yearStartDate ? academicQuarterOf(d, yearStartDate) : null;
  const used = new Set<number>();
  const cash = (p: DuesPaymentRow) =>
    Math.max(0, Number(p.amount_paid) - Number(p.refund_amount ?? 0));
  const waived = (p: DuesPaymentRow) => Number(p.waiver_amount ?? 0);
  const rows: InstalmentPosition[] = [];

  for (const line of lines) {
    const monthly = line.kind === "transport_stop" && line.frequency === "monthly";
    if (!monthly) {
      // An instalment — or a non-monthly bus fee, which bills as one row.
      let paid = 0;
      let discount = 0;
      payments.forEach((p, i) => {
        const match =
          line.kind === "transport_stop"
            ? p.bus_stop_id === line.id
            : p.fee_structure_id === line.id;
        if (!match) return;
        used.add(i);
        paid += cash(p);
        discount += waived(p);
      });
      const billed = amountBilledToDate(line, asOf, yearStartDate);
      const amount = billingCutoff ? billed : annualizedAmount(line);
      const settled = paid + discount;
      // The same per-line test computeDuesBreakdown applies.
      const lateFee =
        line.kind === "fee_structure" && settled < amount
          ? computeLateFee(line, asOf)
          : 0;
      const row = {
        amount: r2(amount),
        billed: r2(billed),
        paid: r2(paid),
        discount: r2(discount),
        outstanding: r2(Math.max(0, amount - settled)),
        dueNow: r2(Math.max(0, billed - settled)),
        advance: r2(Math.max(0, settled - billed)),
        lateFee,
      };
      rows.push({
        key: line.id,
        kind: line.kind === "transport_stop" ? "transport" : "fee_structure",
        line,
        months: null,
        quarter: quarterOf(line.due_date ?? yearStartDate),
        due_date: line.due_date ?? null,
        ...row,
        state: rowState(row),
      });
      continue;
    }

    // A monthly bus fee, one row per quarter of months. Which months have
    // fallen due is taken from amountBilledToDate, so the billed total is
    // exactly the headline's.
    const fee = Number(line.amount);
    const billedTotal = amountBilledToDate(line, asOf, yearStartDate);
    const billedCount = fee > 0 ? Math.round(billedTotal / fee) : 0;
    const monthsInScope = billingCutoff
      ? sessionMonthList.slice(0, billedCount)
      : sessionMonthList;
    const settledByMonth = new Map<string, { paid: number; discount: number }>();
    payments.forEach((p, i) => {
      if (p.bus_stop_id !== line.id) return;
      const key = feeMonthSortKey(p.month);
      if (!key || key.startsWith("~") || !monthsInScope.includes(key)) return;
      used.add(i);
      const cur = settledByMonth.get(key) ?? { paid: 0, discount: 0 };
      cur.paid += cash(p);
      cur.discount += waived(p);
      settledByMonth.set(key, cur);
    });
    const byQuarter = new Map<Quarter, string[]>();
    for (const m of monthsInScope) {
      const q = quarterOf(`${m}-01`) ?? 1;
      byQuarter.set(q, [...(byQuarter.get(q) ?? []), m]);
    }
    for (const [q, months] of byQuarter) {
      let paid = 0;
      let discount = 0;
      let billed = 0;
      for (const m of months) {
        const st = settledByMonth.get(m);
        paid += st?.paid ?? 0;
        discount += st?.discount ?? 0;
        if (sessionMonthList.indexOf(m) < billedCount) billed += fee;
      }
      const amount = fee * months.length;
      const settled = paid + discount;
      const row = {
        amount: r2(amount),
        billed: r2(billed),
        paid: r2(paid),
        discount: r2(discount),
        outstanding: r2(Math.max(0, amount - settled)),
        dueNow: r2(Math.max(0, billed - settled)),
        advance: r2(Math.max(0, settled - billed)),
        lateFee: 0,
      };
      rows.push({
        key: `${line.id}:Q${q}`,
        kind: "transport",
        line,
        months,
        quarter: q,
        due_date: `${months[0]}-01`,
        ...row,
        state: rowState(row),
      });
    }
  }

  let unallocated = 0;
  let discount = 0;
  let totalSettled = 0;
  payments.forEach((p, i) => {
    const settled = cash(p) + waived(p);
    totalSettled += settled;
    discount += waived(p);
    if (!used.has(i)) unallocated += settled;
  });

  const dueByQuarter = { academic: zeroQuarters(), transport: zeroQuarters() };
  const outstandingByQuarter = { academic: zeroQuarters(), transport: zeroQuarters() };
  let dueNowGross = 0;
  let advance = 0;
  let billedTotal = 0;
  let lateFeeSum = 0;
  for (const row of rows) {
    const bucket = row.kind === "transport" ? "transport" : "academic";
    const q = row.quarter ?? 1;
    dueByQuarter[bucket][q] = r2(dueByQuarter[bucket][q] + row.dueNow);
    outstandingByQuarter[bucket][q] = r2(outstandingByQuarter[bucket][q] + row.outstanding);
    dueNowGross += row.dueNow;
    advance += row.advance;
    billedTotal += row.billed;
    lateFeeSum += row.lateFee;
  }
  // The headline, from the same aggregates computeDuesBreakdown uses.
  const baseDues = Math.max(0, billedTotal - totalSettled);
  const lateFee = baseDues > 0 ? lateFeeSum : 0;

  return {
    rows,
    unallocated: r2(unallocated),
    dueByQuarter,
    outstandingByQuarter,
    dueNowGross: r2(dueNowGross),
    credit: r2(advance + unallocated),
    discount: r2(discount),
    lateFee: r2(lateFee),
    dues: r2(baseDues + lateFee),
  };
}

// ---------------------------------------------------------------------------
// Collection summary
// ---------------------------------------------------------------------------

/** One student's position, as the dashboard needs it. */
export interface FeeCollectionEntry {
  breakdown: DuesBreakdown;
  /**
   * The waived slice of `breakdown.paid`. Kept apart because a waiver settles
   * a due without any money arriving, and a collection figure that counts it
   * as cash reports money the school does not have.
   */
  waived: number;
}

export interface FeeCollectionSummary {
  /** Cash banked from these students, net of refunds and of waivers. */
  collected: number;
  /** Fees written off. */
  waived: number;
  /** Cash received against instalments that have not fallen due yet. */
  advance: number;
  /** The settled slice of `dueToDate`: `settled + dues - lateFee === dueToDate`. */
  settled: number;
  /** Whole-session obligation. */
  expected: number;
  /** The slice of `expected` that has fallen due. */
  dueToDate: number;
  /** Outstanding today, late fee included. */
  dues: number;
  /** The late-fee part of `dues`. */
  lateFee: number;
  studentsClear: number;
  studentsWithDues: number;
  studentsTotal: number;
  /** `settled` over `dueToDate`, 0-100. */
  percentage: number;
  /** The same measure over the whole session, 0-100. */
  percentageOfYear: number;
}

// Paise are real (fee amounts are numeric(10,2)); anything below them is float
// noise from summing hundreds of rows and would only make totals look odd.
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Roll a cohort's per-student positions into the figures one card shows.
 *
 * Everything is summed per student and nothing is netted across the cohort:
 * a family paying the whole year in April must not cancel out a family in
 * arrears. That is why `settled` caps each student's payments at what that
 * student has been billed, and the excess is reported as `advance` instead —
 * a school-wide `collected / dueToDate` counts money against an obligation
 * that has not been raised yet, and reads as progress the school hasn't made.
 *
 * The cohort is the caller's choice, but it must be ONE cohort: every figure
 * here has to come from the same students the obligation was computed for, or
 * the ratio compares two different schools (receipts from students who have
 * left the roll over a denominator that excludes them).
 */
export function summariseFeeCollection(
  entries: FeeCollectionEntry[]
): FeeCollectionSummary {
  let collected = 0;
  let waived = 0;
  let advance = 0;
  let settled = 0;
  let settledOfYear = 0;
  let expected = 0;
  let dueToDate = 0;
  let dues = 0;
  let lateFee = 0;
  let studentsClear = 0;
  let studentsWithDues = 0;

  for (const { breakdown, waived: w } of entries) {
    expected += breakdown.expected;
    dueToDate += breakdown.billedToDate;
    dues += breakdown.dues;
    lateFee += breakdown.lateFee;
    settled += Math.min(breakdown.paid, breakdown.billedToDate);
    settledOfYear += Math.min(breakdown.paid, breakdown.expected);
    advance += Math.max(0, breakdown.paid - breakdown.billedToDate);
    // breakdown.paid is cash + waivers, both already net of refunds.
    collected += breakdown.paid - w;
    waived += w;
    if (breakdown.dues > 0) studentsWithDues++;
    else studentsClear++;
  }

  return {
    collected: round2(collected),
    waived: round2(waived),
    advance: round2(advance),
    settled: round2(settled),
    expected: round2(expected),
    dueToDate: round2(dueToDate),
    dues: round2(dues),
    lateFee: round2(lateFee),
    studentsClear,
    studentsWithDues,
    studentsTotal: entries.length,
    percentage: dueToDate > 0 ? Math.round((settled / dueToDate) * 100) : 0,
    percentageOfYear:
      expected > 0 ? Math.round((settledOfYear / expected) * 100) : 0,
  };
}
