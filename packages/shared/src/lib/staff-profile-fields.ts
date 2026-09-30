// The staff profile field registry — every field on the full staff record, in
// the sections and order the school asked for ("Staff Details in ERP 2026" +
// the teacher-registration proforma). One list drives:
//
//   - the zod schema the profile API validates with (validations.ts),
//   - the section-by-section profile page (/people/staff/[id]),
//   - the extra columns the staff Excel upload understands.
//
// Adding a field: add it here, add the column in a migration (and
// supabase-schema.sql), done. `table` says which table the column lives on.
// Most fields are on `staff_details`, which is readable by admins and
// `staff`-feature editors only (migration 131) — bank, PAN and Aadhaar must
// never land on `staff_members`, which every teacher login can read. The few
// `staff_members` fields here are the ones that existed before the profile and
// are still shown elsewhere (directory table, public site, teacher mirror).
//
// Deliberately absent: "Class Teacher" and "Classes Taught" from the proforma.
// Both are derived from the ERP's own class and subject assignments and shown
// on the staff member's view; a stored copy would only drift from them.

export type StaffProfileSection =
  | "basic"
  | "official"
  | "contact"
  | "documents"
  | "licence";

export const STAFF_PROFILE_SECTIONS: { key: StaffProfileSection; title: string }[] = [
  { key: "basic", title: "Employee Basic Details" },
  { key: "official", title: "Official Info" },
  { key: "contact", title: "Contact Info" },
  { key: "documents", title: "Bank, Statutory & Experience" },
  { key: "licence", title: "Driving Licence" },
];

export type StaffProfileFieldType =
  | "text"
  | "longtext"
  | "date"
  | "year"
  | "enum"
  | "boolean"
  | "bus";

/** Format checks beyond the type. Values are normalised before the check. */
export type StaffProfileFormat =
  | "mobile"
  | "email"
  | "pincode"
  | "aadhaar"
  | "pan"
  | "ifsc";

export interface StaffProfileField {
  key: string;
  label: string;
  section: StaffProfileSection;
  table: "staff_members" | "staff_details";
  type: StaffProfileFieldType;
  options?: { value: string; label: string }[];
  format?: StaffProfileFormat;
  /** Required on the profile form. Only the pre-existing core fields are. */
  required?: boolean;
  /** Extra spreadsheet headers that mean this field (label is always one). */
  aliases?: string[];
  placeholder?: string;
  /** Spans the full row on the form. */
  wide?: boolean;
  /** Only meaningful for this category; hidden elsewhere. */
  onlyFor?: string;
}

export const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

export const CASTE_CATEGORY_OPTIONS = [
  { value: "general", label: "General" },
  { value: "obc", label: "OBC" },
  { value: "sc", label: "SC" },
  { value: "st", label: "ST" },
  { value: "mbc", label: "MBC" },
  { value: "sbc", label: "SBC" },
  { value: "ews", label: "EWS" },
];

export const BLOOD_GROUP_OPTIONS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(
  (v) => ({ value: v, label: v })
);

export const MARITAL_STATUS_OPTIONS = [
  { value: "unmarried", label: "Unmarried" },
  { value: "married", label: "Married" },
  { value: "divorcee", label: "Divorcee" },
];

export const PAYMENT_MODE_OPTIONS = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "cash", label: "Cash" },
];

export const STAFF_PROFILE_FIELDS: StaffProfileField[] = [
  // ── 1. Employee basic details ──────────────────────────────────────────
  { key: "employee_no", label: "Emp No.", section: "basic", table: "staff_details", type: "text", aliases: ["emp no", "employee no", "employee number", "emp code", "employee code", "employee id", "emp id"] },
  { key: "date_of_joining", label: "Date of Joining", section: "basic", table: "staff_details", type: "date", aliases: ["join date", "joining date", "doj"] },
  { key: "name", label: "Full Name", section: "basic", table: "staff_members", type: "text", required: true },
  { key: "gender", label: "Gender", section: "basic", table: "staff_details", type: "enum", options: GENDER_OPTIONS, aliases: ["sex"] },
  { key: "date_of_birth", label: "Date of Birth", section: "basic", table: "staff_members", type: "date", aliases: ["dob", "birth date", "d.o.b"] },
  { key: "father_name", label: "Father's Name", section: "basic", table: "staff_details", type: "text", aliases: ["father name", "fathers name"] },
  { key: "mother_name", label: "Mother's Name", section: "basic", table: "staff_details", type: "text", aliases: ["mother name", "mothers name"] },
  { key: "spouse_name", label: "Spouse Name", section: "basic", table: "staff_details", type: "text", aliases: ["spouse", "husband name", "wife name"] },
  { key: "caste_category", label: "Category (Caste)", section: "basic", table: "staff_details", type: "enum", options: CASTE_CATEGORY_OPTIONS, aliases: ["caste", "caste category", "social category"] },
  { key: "blood_group", label: "Blood Group", section: "basic", table: "staff_details", type: "enum", options: BLOOD_GROUP_OPTIONS },
  { key: "aadhaar_number", label: "Aadhaar No.", section: "basic", table: "staff_details", type: "text", format: "aadhaar", aliases: ["aadhar", "aadhar no", "aadhar number", "aadhaar", "aadhaar number"] },
  { key: "name_as_per_aadhaar", label: "Name as per Aadhaar", section: "basic", table: "staff_details", type: "text", aliases: ["employee name as per aadhar card", "name as per aadhar"] },
  { key: "pan_number", label: "PAN", section: "basic", table: "staff_details", type: "text", format: "pan", aliases: ["pan no", "pan number", "pan card"] },
  { key: "marital_status", label: "Marital Status", section: "basic", table: "staff_details", type: "enum", options: MARITAL_STATUS_OPTIONS },
  { key: "marriage_date", label: "Date of Marriage", section: "basic", table: "staff_details", type: "date", aliases: ["marriage date"] },
  { key: "relieving_date", label: "Relieving Date", section: "basic", table: "staff_details", type: "date" },
  { key: "relieving_reason", label: "Relieving Reason", section: "basic", table: "staff_details", type: "text", wide: true },

  // ── 2. Official info ───────────────────────────────────────────────────
  { key: "subject", label: "Subject / Designation (shown in directory)", section: "official", table: "staff_members", type: "text", required: true },
  { key: "designation", label: "Designation", section: "official", table: "staff_details", type: "text" },
  { key: "department", label: "Department", section: "official", table: "staff_details", type: "text", aliases: ["dept"] },
  { key: "appointed_subject", label: "Appointed for Subject", section: "official", table: "staff_details", type: "text" },
  { key: "additional_subject", label: "Additional Subject", section: "official", table: "staff_details", type: "text" },
  { key: "emp_group", label: "Emp Group", section: "official", table: "staff_details", type: "text", aliases: ["employee group"] },
  { key: "reporting_authority", label: "Reporting Authority", section: "official", table: "staff_details", type: "text", aliases: ["reporting", "reports to"] },
  { key: "employee_level", label: "Employee Level", section: "official", table: "staff_details", type: "text", aliases: ["emp level"] },
  { key: "employee_status", label: "Employee Status", section: "official", table: "staff_details", type: "text", aliases: ["emp status"], placeholder: "e.g. Permanent, Probation, Contract" },
  { key: "probation_date", label: "Probation Date", section: "official", table: "staff_details", type: "date" },
  { key: "confirmation_date", label: "Confirmation Date", section: "official", table: "staff_details", type: "date" },
  { key: "notice_period", label: "Notice Period", section: "official", table: "staff_details", type: "text", placeholder: "e.g. 1 month" },
  { key: "highest_academic_qualification", label: "Highest Academic Qualification", section: "official", table: "staff_details", type: "text" },
  { key: "highest_professional_qualification", label: "Highest Professional Qualification", section: "official", table: "staff_details", type: "text" },
  { key: "tenth_board", label: "10th Board", section: "official", table: "staff_details", type: "text" },
  { key: "tenth_roll_no", label: "10th Roll No.", section: "official", table: "staff_details", type: "text", aliases: ["10th board roll number", "10th roll number"] },
  { key: "tenth_passing_year", label: "10th Passing Year", section: "official", table: "staff_details", type: "year", aliases: ["10th board class passing year", "10th year"] },
  { key: "ctet_qualified", label: "CTET Qualified", section: "official", table: "staff_details", type: "boolean", aliases: ["ctet", "if ctet qualified"] },
  { key: "ctet_roll_no", label: "CTET Roll No.", section: "official", table: "staff_details", type: "text", aliases: ["ctet roll number"] },
  { key: "ctet_pass_year", label: "CTET Pass Year", section: "official", table: "staff_details", type: "year" },
  { key: "rtet_qualified", label: "RTET Qualified", section: "official", table: "staff_details", type: "boolean", aliases: ["rtet", "if rtet qualified", "reet qualified"] },
  { key: "rtet_roll_no", label: "RTET Roll No.", section: "official", table: "staff_details", type: "text", aliases: ["rtet roll number"] },
  { key: "rtet_pass_year", label: "RTET Pass Year", section: "official", table: "staff_details", type: "year" },
  { key: "school_location", label: "School Location", section: "official", table: "staff_details", type: "text" },
  { key: "voter_id", label: "Voter ID No.", section: "official", table: "staff_details", type: "text", aliases: ["voter id", "voter id number", "epic no"] },
  { key: "passport_no", label: "Passport No.", section: "official", table: "staff_details", type: "text", aliases: ["passport number"] },
  { key: "passport_expiry", label: "Passport Expiry Date", section: "official", table: "staff_details", type: "date", aliases: ["passport end date"] },
  { key: "punch_machine_id", label: "Punch / Machine ID", section: "official", table: "staff_details", type: "text", aliases: ["punch machine code", "machine id", "biometric id"] },
  { key: "cbse_oasis_uid", label: "CBSE OASIS UID No.", section: "official", table: "staff_details", type: "text", aliases: ["cbse oaiss uid no", "oasis uid", "cbse uid"] },
  { key: "udise_national_code", label: "National Code (UDISE)", section: "official", table: "staff_details", type: "text", aliases: ["national code", "udise code"] },
  { key: "nic_id", label: "NIC ID (PSP)", section: "official", table: "staff_details", type: "text", aliases: ["nic id"] },
  { key: "bus_id", label: "Bus Staff Travels In", section: "official", table: "staff_details", type: "bus" },
  { key: "remarks", label: "Remarks", section: "official", table: "staff_details", type: "longtext", wide: true },

  // ── 3. Contact info ────────────────────────────────────────────────────
  { key: "phone", label: "Mobile (WhatsApp)", section: "contact", table: "staff_members", type: "text", format: "mobile", aliases: ["mobile", "mobile number", "whatsapp", "phone"] },
  { key: "alternate_mobile", label: "Alternate Mobile", section: "contact", table: "staff_details", type: "text", format: "mobile", aliases: ["alternate mobile number", "alternate phone"] },
  { key: "office_contact", label: "Contact (Office)", section: "contact", table: "staff_details", type: "text", aliases: ["office contact", "office phone"] },
  { key: "email", label: "Email", section: "contact", table: "staff_members", type: "text", format: "email" },
  { key: "address", label: "Present Address — Line 1", section: "contact", table: "staff_members", type: "text", wide: true, aliases: ["present address", "address line 1"] },
  { key: "address_line2", label: "Present Address — Line 2", section: "contact", table: "staff_details", type: "text", wide: true, aliases: ["address line 2"] },
  { key: "city", label: "City", section: "contact", table: "staff_details", type: "text" },
  { key: "state", label: "State", section: "contact", table: "staff_details", type: "text" },
  { key: "pincode", label: "PIN", section: "contact", table: "staff_details", type: "text", format: "pincode", aliases: ["pin code", "present pin code", "pin"] },
  { key: "permanent_address", label: "Permanent Address", section: "contact", table: "staff_details", type: "longtext", wide: true },
  { key: "permanent_pincode", label: "Permanent PIN", section: "contact", table: "staff_details", type: "text", format: "pincode", aliases: ["permanent pin code"] },

  // ── 4. Bank, statutory & experience ("Document Info") ──────────────────
  { key: "bank_account_no", label: "Bank Account No.", section: "documents", table: "staff_details", type: "text", aliases: ["bank account number", "account number", "account no"] },
  { key: "ifsc_code", label: "IFSC Code", section: "documents", table: "staff_details", type: "text", format: "ifsc", aliases: ["ifsc", "ifsc code of the bank"] },
  { key: "bank_name", label: "Bank Name", section: "documents", table: "staff_details", type: "text", aliases: ["name of the bank"] },
  { key: "bank_branch_address", label: "Branch Address", section: "documents", table: "staff_details", type: "text", aliases: ["branch", "branch address"] },
  { key: "name_as_per_bank", label: "Name as per Bank Account", section: "documents", table: "staff_details", type: "text" },
  { key: "payment_mode", label: "Payment Mode", section: "documents", table: "staff_details", type: "enum", options: PAYMENT_MODE_OPTIONS },
  { key: "qualifications", label: "Qualification (shown in directory)", section: "documents", table: "staff_members", type: "text", aliases: ["qualification", "qualifications"] },
  { key: "experience", label: "Experience", section: "documents", table: "staff_details", type: "text", placeholder: "e.g. 8 years" },
  { key: "experience_detail", label: "Experience Detail", section: "documents", table: "staff_details", type: "longtext", wide: true },
  { key: "uan_no", label: "UAN No.", section: "documents", table: "staff_details", type: "text", aliases: ["uan", "uan number"] },
  { key: "pf_no", label: "PF No.", section: "documents", table: "staff_details", type: "text", aliases: ["pf number"] },
  { key: "esi_no", label: "ESI No.", section: "documents", table: "staff_details", type: "text", aliases: ["esi number", "esic no"] },
  { key: "apply_max_pf_limit", label: "Apply Maximum PF Limit", section: "documents", table: "staff_details", type: "boolean" },

  // ── 5. Driving licence ─────────────────────────────────────────────────
  { key: "license_number", label: "Driving Licence No.", section: "licence", table: "staff_members", type: "text", aliases: ["driving licence number", "driving license", "driving licence", "license number", "licence number", "dl no", "dl number"] },
  { key: "license_issue_date", label: "Licence Issue Date", section: "licence", table: "staff_details", type: "date", aliases: ["driving license issue date"] },
  { key: "license_expiry_date", label: "Licence Expiry Date", section: "licence", table: "staff_details", type: "date", aliases: ["driving license expiry date"] },
  { key: "license_issue_place", label: "Licence Issue Place", section: "licence", table: "staff_details", type: "text", aliases: ["driving license issue place"] },
];

const BY_KEY = new Map(STAFF_PROFILE_FIELDS.map((f) => [f.key, f]));

export function getStaffProfileField(key: string): StaffProfileField | undefined {
  return BY_KEY.get(key);
}

/** Columns written to staff_details (everything but the core staff_members ones). */
export const STAFF_DETAIL_KEYS = STAFF_PROFILE_FIELDS.filter(
  (f) => f.table === "staff_details"
).map((f) => f.key);

// ── Value normalisation (shared by the form, the API and the Excel upload) ──

/** Canonical stored form of a raw value, or undefined if it is blank. */
export function normalizeStaffProfileValue(
  field: StaffProfileField,
  raw: unknown
): string | boolean | number | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === "boolean") return field.type === "boolean" ? raw : undefined;
  const text = String(raw).trim();
  if (text === "") return undefined;

  switch (field.type) {
    case "boolean": {
      const t = text.toLowerCase();
      if (["yes", "y", "true", "1", "qualified"].includes(t)) return true;
      if (["no", "n", "false", "0", "not qualified"].includes(t)) return false;
      return text; // left for the schema to reject
    }
    case "year": {
      const n = Number(text);
      return Number.isInteger(n) ? n : text;
    }
    case "enum": {
      const t = text.toLowerCase();
      const hit = field.options?.find(
        (o) => o.value.toLowerCase() === t || o.label.toLowerCase() === t
      );
      return hit ? hit.value : text;
    }
  }

  switch (field.format) {
    case "mobile": {
      let d = text.replace(/[\s\-()]/g, "");
      if (d.startsWith("+91")) d = d.slice(3);
      else if (d.startsWith("91") && d.length === 12) d = d.slice(2);
      else if (d.startsWith("0") && d.length === 11) d = d.slice(1);
      return d;
    }
    case "aadhaar":
    case "pincode":
      return text.replace(/[\s-]/g, "");
    case "pan":
    case "ifsc":
      return text.replace(/\s/g, "").toUpperCase();
    case "email":
      return text.toLowerCase();
  }
  return text;
}

export const STAFF_PROFILE_FORMAT_RULES: Record<
  StaffProfileFormat,
  { test: (v: string) => boolean; message: string }
> = {
  mobile: { test: (v) => /^[6-9]\d{9}$/.test(v), message: "Enter a valid 10-digit mobile number" },
  email: { test: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), message: "Enter a valid email" },
  pincode: { test: (v) => /^\d{6}$/.test(v), message: "PIN must be 6 digits" },
  aadhaar: { test: (v) => /^\d{12}$/.test(v), message: "Aadhaar must be 12 digits" },
  pan: { test: (v) => /^[A-Z]{5}\d{4}[A-Z]$/.test(v), message: "PAN looks like ABCDE1234F" },
  ifsc: { test: (v) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v), message: "IFSC looks like SBIN0001234" },
};

// ── Trainings and notices (child lists on the profile) ─────────────────────

export const NOTICE_ISSUER_OPTIONS = [
  { value: "management", label: "Management" },
  { value: "principal", label: "Principal" },
  { value: "vice_principal", label: "Vice Principal" },
];
