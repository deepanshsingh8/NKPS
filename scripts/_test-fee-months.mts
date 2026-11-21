// Bus-month checks for apps/erp/src/lib/fees.ts: June is not charged.
//
//   npx tsx scripts/_test-fee-months.mts

import {
  annualizedAmount, amountBilledToDate, computeInstalmentLedger, isTransportBillableMonth,
  resolveTransportLine, sessionMonths, transportBillableMonths, transportMonthFees, transportMonthLedger,
} from "../apps/erp/src/lib/fees";

let pass = 0, fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log("PASS", label); }
  else { fail++; console.log("FAIL", label, "\n   got :", g, "\n   want:", w); }
};

const months = sessionMonths("2026-04-01", "2027-03-31");
eq("session has 12 months", months.length, 12);
eq("June is not billable", isTransportBillableMonth("2026-06"), false);
eq("eleven billable months", transportBillableMonths(months).length, 11);

const stopFees = [{ bus_stop_id: "stopA", stop_name: "Rajawas", amount: 1000, frequency: "monthly", is_active: true }];

// No history: the current arrangement, every month the bus runs.
const flat = resolveTransportLine({ hasTransport: true, busStopId: "stopA", direction: "both", feeOverride: null, stopFees, transportPeriods: [], sessionMonthList: months })!;
eq("flat line is priced month by month", flat.month_fees?.length, 12);
eq("flat line: June costs nothing", flat.month_fees?.find((m) => m.month === "2026-06")?.amount, 0);
eq("flat line: annual is eleven months", annualizedAmount(flat), 11000);
eq("billed to 20 Nov: Apr–Nov less June = 7 months", amountBilledToDate(flat, "2026-11-20", "2026-04-01"), 7000);
eq("billed to 15 Jun: Apr, May only", amountBilledToDate(flat, "2026-06-15", "2026-04-01"), 2000);

// With a history: same rule.
const hist = transportMonthFees({
  periods: [{ effective_from: "2026-04-01", has_transport: true, bus_stop_id: "stopA", transport_direction: "both", transport_fee_override: null }],
  sessionMonthList: months, stopFees,
})!;
eq("history: June costs nothing, keeps the stop", hist.find((m) => m.month === "2026-06"), { month: "2026-06", amount: 0, bus_stop_id: "stopA" });
eq("history: eleven charges", hist.reduce((s, m) => s + m.amount, 0), 11000);

// The month strip: June is "free", not "off", and July is upcoming on 20 Jun.
const strip = transportMonthLedger({ months, fee: 1000, monthFees: flat.month_fees, busStopId: "stopA", payments: [], today: "2026-06-20" });
eq("strip: June is free", strip.find((m) => m.month === "2026-06")?.state, "free");
eq("strip: May is due", strip.find((m) => m.month === "2026-05")?.state, "due");
eq("strip: July is upcoming (payable in advance)", strip.find((m) => m.month === "2026-07")?.state, "upcoming");

// The quarter rows: Q1 reads April – May and charges two months.
const ledger = computeInstalmentLedger({ lines: [flat], payments: [], today: "2026-11-20", yearStartDate: "2026-04-01", sessionMonthList: months });
const q1 = ledger.rows.find((r) => r.key === "stopA:Q1")!;
eq("Q1 months exclude June", q1.months, ["2026-04", "2026-05"]);
eq("Q1 amount is two months", q1.amount, 2000);
eq("Q3 amount is three months", ledger.rows.find((r) => r.key === "stopA:Q3")!.amount, 3000);
eq("dues to 20 Nov: 7 months", ledger.dues, 7000);

// A quarterly stop fee is left alone (not priced month by month).
const quarterly = resolveTransportLine({ hasTransport: true, busStopId: "stopQ", direction: "both", feeOverride: null,
  stopFees: [{ bus_stop_id: "stopQ", stop_name: "Q", amount: 3000, frequency: "quarterly", is_active: true }], transportPeriods: [], sessionMonthList: months })!;
eq("quarterly stop fee has no month pricing", quarterly.month_fees, null);
eq("quarterly annual unchanged", annualizedAmount(quarterly), 12000);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
