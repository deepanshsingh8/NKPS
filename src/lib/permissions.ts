// Single source of truth for editor-grantable admin features.
// Used by:
//  - middleware (page-level access check)
//  - verifyAdminOrEditor (API-level access check)
//  - admin sidebar (hide links the editor can't access)
//  - admin permissions UI (render checkboxes)
//
// Admins bypass all of this — they always have full access.
// /admin (dashboard) is always allowed for editors.
// /admin/users is admin-only forever (preventing self-elevation).

export type FeatureKey =
  | "gallery"
  | "transfer_certificates"
  | "contact"
  | "site_media"
  | "disclosure"
  | "staff"
  | "students"
  | "classes"
  | "subjects"
  | "academic_years"
  | "exam_types"
  | "fees"
  | "timetable"
  | "calendar"
  | "attendance"
  | "results"
  | "registrations";

export type FeatureGroup = "content" | "erp";

export interface FeatureDef {
  key: FeatureKey;
  label: string;
  href: string;
  group: FeatureGroup;
}

export const FEATURE_CATALOG: readonly FeatureDef[] = [
  { key: "gallery", label: "Gallery", href: "/admin/gallery", group: "content" },
  { key: "transfer_certificates", label: "Transfer Certificates", href: "/admin/transfer-certificates", group: "content" },
  { key: "contact", label: "Contact Messages", href: "/admin/contact", group: "content" },
  { key: "site_media", label: "Site Media", href: "/admin/site-media", group: "content" },
  { key: "disclosure", label: "Disclosure", href: "/admin/disclosure", group: "content" },
  { key: "staff", label: "Staff", href: "/admin/staff", group: "erp" },
  { key: "students", label: "Students", href: "/admin/students", group: "erp" },
  { key: "classes", label: "Classes", href: "/admin/classes", group: "erp" },
  { key: "subjects", label: "Subjects", href: "/admin/subjects", group: "erp" },
  { key: "academic_years", label: "Academic Years", href: "/admin/academic-years", group: "erp" },
  { key: "exam_types", label: "Exam Types", href: "/admin/exam-types", group: "erp" },
  { key: "fees", label: "Fees", href: "/admin/fees", group: "erp" },
  { key: "timetable", label: "Timetable", href: "/admin/timetable", group: "erp" },
  { key: "calendar", label: "Calendar", href: "/admin/calendar", group: "erp" },
  { key: "attendance", label: "Attendance", href: "/admin/attendance", group: "erp" },
  { key: "results", label: "Results", href: "/admin/results", group: "erp" },
  { key: "registrations", label: "Registrations", href: "/admin/registrations", group: "erp" },
] as const;

export const FEATURE_KEYS: readonly FeatureKey[] = FEATURE_CATALOG.map((f) => f.key);

const FEATURE_KEY_SET = new Set<string>(FEATURE_KEYS);

export function isFeatureKey(value: unknown): value is FeatureKey {
  return typeof value === "string" && FEATURE_KEY_SET.has(value);
}

// Routes editors can never access, regardless of permissions.
export const ADMIN_ONLY_PREFIXES = ["/admin/users"] as const;

export function isAdminOnlyPath(pathname: string): boolean {
  return ADMIN_ONLY_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

// Map any /admin/* URL to its feature_key.
// Returns null for /admin (dashboard, always-allowed) and admin-only paths
// (handled separately by isAdminOnlyPath).
export function featureKeyForPath(pathname: string): FeatureKey | null {
  if (!pathname.startsWith("/admin")) return null;
  if (pathname === "/admin" || pathname === "/admin/") return null;
  if (pathname.startsWith("/admin/login")) return null;
  if (isAdminOnlyPath(pathname)) return null;

  // Match longest prefix first (none currently nest, but be safe).
  const sorted = [...FEATURE_CATALOG].sort((a, b) => b.href.length - a.href.length);
  for (const f of sorted) {
    if (pathname === f.href || pathname.startsWith(`${f.href}/`)) {
      return f.key;
    }
  }
  return null;
}
