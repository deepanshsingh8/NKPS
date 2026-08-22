import Link from "next/link";
import {
  BarChart3,
  CalendarCheck,
  FileSpreadsheet,
  ReceiptText,
  Users,
} from "lucide-react";

/**
 * Reports index.
 *
 * All four cards land on the same builder. Fee, Attendance and Result are
 * `?focus=` entry points that start with a suggested column set and sort —
 * they are shortcuts, not separate screens, and the picker stays fully open
 * once you arrive.
 *
 * Building them as one engine rather than four is what lets a single sheet
 * combine fee balance, attendance % and class in one row. Four siloed reports
 * would each have to re-implement the same session/class/status filtering and
 * still could not answer "show me the students who are behind on fees AND
 * below 75% attendance", which is the question a school actually asks.
 */
const REPORTS = [
  {
    href: "/reports/students",
    icon: Users,
    title: "Student Custom Report",
    blurb:
      "Any combination of student, family, enrolment, transport and admissions columns, for any academic session.",
  },
  {
    href: "/reports/students?focus=fees",
    icon: ReceiptText,
    title: "Fee Report",
    blurb:
      "Billed, paid, concession and balance for the session, sorted by who owes most.",
  },
  {
    href: "/reports/students?focus=attendance",
    icon: CalendarCheck,
    title: "Attendance Report",
    blurb:
      "Days present, absent and marked, with percentage — lowest attendance first.",
  },
  {
    href: "/reports/students?focus=results",
    icon: BarChart3,
    title: "Result Report",
    blurb:
      "Marks obtained against maximum across every exam recorded for the session.",
  },
] as const;

export default function ReportsPage() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-navy-900">
          Reports
        </h1>
        <p className="text-sm text-muted-foreground">
          Build a sheet: choose the rows, choose the columns, export it.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((report) => (
          <Link
            key={report.href}
            href={report.href}
            className="group rounded-lg border bg-white p-5 transition hover:border-blue-400 hover:shadow-sm"
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <report.icon className="h-5 w-5" />
            </div>
            <h2 className="font-medium text-navy-900 group-hover:text-blue-700">
              {report.title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{report.blurb}</p>
            <span className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              CSV, Excel &amp; PDF
            </span>
          </Link>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Fee, Attendance and Result open the same builder with a suggested set of
        columns — change anything, or combine them in one sheet.
      </p>
    </div>
  );
}
