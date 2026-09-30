// Single source of truth for what a staff_members.category means: which tab of
// the staff directory it sits on, and which portal login it gets. Consumed by
// every place that provisions a login for a staff member (auto-create on add,
// bulk staff upload, the "Create login" action, and convert-to-teacher gating)
// and by the directory tabs, so the two can never drift apart.
//
// The school runs four segments:
// - Admin — Principal, Vice Principal, CBSE portal in-charge, office assistant,
//   front office. Back-office "staff" login (empty sidebar until an admin grants
//   editor_permissions).
// - Teaching — PGT, TGT, PRT, Mother Teachers and the coordinators. "teacher"
//   login with a linked `teachers` record.
// - Additional staff — Scout & Guide, NCC, coaches, PTI. Not class teachers, but
//   they take Games/activity periods, and the timetable can only place someone
//   who has a `teachers` record, so they get the teacher login too.
// - Drivers & helpers — bus drivers and peons. No login at all.

import type { StaffCategory } from "@nkps/shared/types";

export type StaffPortalRole = "teacher" | "staff";

export type StaffGroup = "admin" | "teaching" | "additional" | "support";

/** The four segments, in the order the school lists them — the directory tabs. */
export const STAFF_GROUPS: { key: StaffGroup; label: string }[] = [
  { key: "admin", label: "Admin" },
  { key: "teaching", label: "Teaching" },
  { key: "additional", label: "Additional Staff" },
  { key: "support", label: "Drivers & Helpers" },
];

type CategoryRule = {
  label: string;
  group: StaffGroup;
  portalRole: StaffPortalRole | null;
};

// Keep the keys in sync with staffCategoryEnum in validations.ts and the CHECK
// on staff_members.category. Order here is dropdown order.
const CATEGORY_RULES = {
  management: { label: "Management", group: "admin", portalRole: "staff" },
  admin: { label: "Office & Administration", group: "admin", portalRole: "staff" },
  pgt: { label: "PGT", group: "teaching", portalRole: "teacher" },
  tgt: { label: "TGT", group: "teaching", portalRole: "teacher" },
  prt: { label: "PRT", group: "teaching", portalRole: "teacher" },
  motherTeachers: { label: "Mother Teachers", group: "teaching", portalRole: "teacher" },
  prePrimaryCoordinator: { label: "Pre-primary Coordinator", group: "teaching", portalRole: "teacher" },
  primaryCoordinator: { label: "Primary Coordinator", group: "teaching", portalRole: "teacher" },
  middleCoordinator: { label: "Middle Coordinator", group: "teaching", portalRole: "teacher" },
  seniorCoordinator: { label: "Senior Coordinator", group: "teaching", portalRole: "teacher" },
  additionalStaff: { label: "Additional Staff", group: "additional", portalRole: "teacher" },
  busDriver: { label: "Bus Drivers", group: "support", portalRole: null },
  peon: { label: "Peons", group: "support", portalRole: null },
} satisfies Record<StaffCategory, CategoryRule>;

const RULES: Record<string, CategoryRule | undefined> = CATEGORY_RULES;

/** Every category with its display label, in dropdown order. */
export const STAFF_CATEGORY_OPTIONS: { value: StaffCategory; label: string }[] =
  (Object.keys(CATEGORY_RULES) as StaffCategory[]).map((value) => ({
    value,
    label: CATEGORY_RULES[value].label,
  }));

export function staffCategoryLabel(category: string): string {
  return RULES[category]?.label ?? category;
}

/**
 * Whether members of this category get a linked `teachers` record — what makes
 * them selectable as a class, subject or timetable teacher. True for every
 * category whose login is a teacher login.
 */
export function staffNeedsTeacherRecord(category: string): boolean {
  return RULES[category]?.portalRole === "teacher";
}

/**
 * The portal role a login for this staff category should receive, or `null`
 * when the category should not get a login (e.g. busDriver, peon).
 */
export function staffPortalRole(category: string): StaffPortalRole | null {
  return RULES[category]?.portalRole ?? null;
}

/** The directory tab a category belongs on. Unknown categories fall to support. */
export function staffCategoryGroup(category: string): StaffGroup {
  return RULES[category]?.group ?? "support";
}
