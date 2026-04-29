// Single source of truth for editor-grantable admin features.
// Used by:
//  - middleware (page-level access check)
//  - verifyAdminOrEditor (API-level access check)
//  - cms / erp sidebars (hide links the editor can't access)
//  - admin permissions UI (render checkboxes)
//
// Admins bypass all of this — they always have full access.
// /cms and /erp module dashboards are always allowed for editors who have
// any feature in that module. /erp/people/users is admin-only forever
// (preventing self-elevation).

export type FeatureKey =
  | "gallery"
  | "articles"
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
  | "exam_timetable"
  | "admit_cards"
  | "fees"
  | "timetable"
  | "calendar"
  | "attendance"
  | "results"
  | "non_scholastic_entry"
  | "class_tests"
  | "publish_results"
  | "blank_marks_list"
  | "white_sheet"
  | "green_sheet"
  | "ptm_notes"
  | "ptm_format"
  | "supplementary_exams"
  | "teacher_substitutions";

export type FeatureGroup = "cms" | "erp";

export interface FeatureDef {
  key: FeatureKey;
  label: string;
  href: string;
  group: FeatureGroup;
}

export const FEATURE_CATALOG: readonly FeatureDef[] = [
  { key: "gallery", label: "Gallery", href: "/cms/gallery", group: "cms" },
  { key: "articles", label: "Articles", href: "/cms/articles", group: "cms" },
  { key: "transfer_certificates", label: "Transfer Certificates", href: "/cms/transfer-certificates", group: "cms" },
  { key: "contact", label: "Contact Messages", href: "/cms/contact", group: "cms" },
  { key: "site_media", label: "Site Media", href: "/cms/site-media", group: "cms" },
  { key: "disclosure", label: "Disclosure", href: "/cms/disclosure", group: "cms" },
  { key: "staff", label: "Staff", href: "/erp/people/staff", group: "erp" },
  { key: "students", label: "Students", href: "/erp/people/students", group: "erp" },
  { key: "classes", label: "Classes", href: "/erp/academics/classes", group: "erp" },
  { key: "subjects", label: "Subjects", href: "/erp/academics/subjects", group: "erp" },
  { key: "academic_years", label: "Academic Years", href: "/erp/academics/years", group: "erp" },
  { key: "exam_types", label: "Exam Types", href: "/erp/exams/types", group: "erp" },
  { key: "exam_timetable", label: "Exam Timetable", href: "/erp/exams/timetable", group: "erp" },
  { key: "admit_cards", label: "Admit Cards", href: "/erp/exams/admit-cards", group: "erp" },
  { key: "fees", label: "Fees", href: "/erp/fees", group: "erp" },
  { key: "timetable", label: "Timetable", href: "/erp/timetable", group: "erp" },
  { key: "calendar", label: "Calendar", href: "/erp/calendar", group: "erp" },
  { key: "attendance", label: "Attendance", href: "/erp/attendance", group: "erp" },
  { key: "results", label: "Results", href: "/erp/exams/results", group: "erp" },
  { key: "non_scholastic_entry", label: "Non-Scholastic Entry", href: "/erp/exams/non-scholastic-assessments", group: "erp" },
  { key: "class_tests", label: "Class Tests", href: "/erp/exams/class-tests", group: "erp" },
  { key: "publish_results", label: "Publish & Finalize", href: "/erp/exams/publish", group: "erp" },
  { key: "blank_marks_list", label: "Blank Marks List", href: "/erp/exams/blank-marks-list", group: "erp" },
  { key: "white_sheet", label: "White Sheet", href: "/erp/exams/white-sheet", group: "erp" },
  { key: "green_sheet", label: "Green Sheet", href: "/erp/exams/green-sheet", group: "erp" },
  { key: "ptm_notes", label: "PTM Notes", href: "/erp/exams/ptm-notes", group: "erp" },
  { key: "ptm_format", label: "PTM Format", href: "/erp/exams/ptm-format", group: "erp" },
  { key: "supplementary_exams", label: "Supplementary Exams", href: "/erp/exams/supplementary", group: "erp" },
  { key: "teacher_substitutions", label: "Substitutions", href: "/erp/timetable/substitutions", group: "erp" },
] as const;

export const FEATURE_KEYS: readonly FeatureKey[] = FEATURE_CATALOG.map((f) => f.key);

const FEATURE_KEY_SET = new Set<string>(FEATURE_KEYS);

export function isFeatureKey(value: unknown): value is FeatureKey {
  return typeof value === "string" && FEATURE_KEY_SET.has(value);
}

// Routes editors can never access, regardless of permissions.
// /erp/registrations lives under the admin-only /erp/people/users page,
// so no editor-facing feature key exists for it — this prefix keeps any
// bookmarked editor nav from slipping through.
export const ADMIN_ONLY_PREFIXES = [
  "/erp/people/users",
  "/erp/registrations",
  "/erp/exams/grade-master",
  "/erp/exams/header-footer",
  "/erp/exams/non-scholastic-masters",
  "/erp/exams/result-master",
] as const;

export function isAdminOnlyPath(pathname: string): boolean {
  return ADMIN_ONLY_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

// Returns whether a path belongs to the CMS module, the ERP module, or neither.
// Used by middleware to dispatch access checks per module.
export function featureGroupForPath(pathname: string): FeatureGroup | null {
  if (pathname === "/cms" || pathname.startsWith("/cms/")) return "cms";
  if (pathname === "/erp" || pathname.startsWith("/erp/")) return "erp";
  return null;
}

// Map a /cms/* or /erp/* URL to its feature_key.
// Returns null for module dashboards (/cms, /erp), login pages, and admin-only
// paths (handled separately by isAdminOnlyPath).
export function featureKeyForPath(pathname: string): FeatureKey | null {
  const group = featureGroupForPath(pathname);
  if (!group) return null;
  if (pathname === "/cms" || pathname === "/cms/") return null;
  if (pathname === "/erp" || pathname === "/erp/") return null;
  if (pathname.startsWith("/cms/login")) return null;
  if (pathname.startsWith("/erp/login")) return null;
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
