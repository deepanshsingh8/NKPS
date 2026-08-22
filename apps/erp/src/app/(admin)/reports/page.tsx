import Link from "next/link";
import { FileSpreadsheet, Users } from "lucide-react";

/**
 * Reports index.
 *
 * One report today. It exists as a landing page rather than redirecting
 * straight to /reports/students because `reports` is a permission href
 * (packages/shared/src/lib/permissions.ts) and because fee, attendance and
 * result reports are planned siblings — a redirect would have to be unpicked
 * the moment the second one lands.
 */
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
        <Link
          href="/reports/students"
          className="group rounded-lg border bg-white p-5 transition hover:border-blue-400 hover:shadow-sm"
        >
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Users className="h-5 w-5" />
          </div>
          <h2 className="font-medium text-navy-900 group-hover:text-blue-700">
            Student Custom Report
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Any combination of student, family, enrolment, transport and
            admissions columns, for any academic session.
          </p>
          <span className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            CSV &amp; Excel
          </span>
        </Link>
      </div>
    </div>
  );
}
