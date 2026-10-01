"use client";

import { useState, useCallback } from "react";
// xlsx parses to roughly 900KB. Nothing on this screen needs it until
// someone picks a file or asks for the template, so it is fetched then
// rather than shipped with the page that renders the button.
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@nkps/shared/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nkps/shared/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@nkps/shared/components/ui/table";
import { Button } from "@nkps/shared/components/ui/button";
import { Input } from "@nkps/shared/components/ui/input";
import { Label } from "@nkps/shared/components/ui/label";
import { Badge } from "@nkps/shared/components/ui/badge";
import { toast } from "sonner";
import {
  Upload,
  Download,
  Loader2,
  AlertCircle,
  CheckCircle2,
  X,
} from "lucide-react";
import { adminFetch } from "@nkps/shared/lib/admin-api";
import { STAFF_CATEGORY_OPTIONS } from "@nkps/shared/lib/staff-roles";
import {
  STAFF_PROFILE_FIELDS,
  normalizeStaffProfileValue,
  type StaffProfileField,
} from "@nkps/shared/lib/staff-profile-fields";
import { staffProfileFieldsSchema } from "@nkps/shared/lib/validations";
import type { StaffCategory } from "@nkps/shared/types";

const CATEGORY_OPTIONS = STAFF_CATEGORY_OPTIONS;

interface ParsedRow {
  name: string;
  subject: string;
  category: string;
  email: string;
  phone: string;
  date_of_birth: string;
  address: string;
  qualifications: string;
  license_number: string;
  // Full-profile columns (staff_details), keyed by registry key, already
  // normalised and validated. A value that failed validation is left out and
  // named in `warnings` rather than failing the whole row.
  details: Record<string, unknown>;
  warnings: string[];
  errors: string[];
}

const CATEGORY_LABEL_TO_VALUE: Record<string, StaffCategory> = {};
for (const c of CATEGORY_OPTIONS) {
  CATEGORY_LABEL_TO_VALUE[c.label.toLowerCase()] = c.value;
  CATEGORY_LABEL_TO_VALUE[c.value.toLowerCase()] = c.value;
}
// Common shorthand aliases
CATEGORY_LABEL_TO_VALUE["mother teacher"] = "motherTeachers";
CATEGORY_LABEL_TO_VALUE["mother teachers"] = "motherTeachers";
CATEGORY_LABEL_TO_VALUE["admin"] = "admin";
CATEGORY_LABEL_TO_VALUE["administrative staff"] = "admin";
CATEGORY_LABEL_TO_VALUE["administration"] = "admin";
CATEGORY_LABEL_TO_VALUE["office"] = "admin";
CATEGORY_LABEL_TO_VALUE["additional staff"] = "additionalStaff";
CATEGORY_LABEL_TO_VALUE["bus driver"] = "busDriver";
CATEGORY_LABEL_TO_VALUE["bus drivers"] = "busDriver";
CATEGORY_LABEL_TO_VALUE["peons"] = "peon";

function resolveCategory(raw: string): StaffCategory | null {
  if (!raw) return null;
  const key = raw.toLowerCase().trim();
  return CATEGORY_LABEL_TO_VALUE[key] ?? null;
}

interface StaffBulkUploadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

// Flexible column name mapping
const COLUMN_ALIASES: Record<string, string[]> = {
  name: [
    "name",
    "name of the staff member",
    "full name",
    "staff name",
    "teacher name",
    "employee name",
    "emp name",
  ],
  // "Designation" and "Department" are profile columns of their own now; a
  // sheet with only a Designation column still works — see the fallback in
  // the row loop.
  subject: [
    "subject",
    "role",
    "position",
    "subject/designation",
    "subject / designation",
  ],
  email: [
    "email",
    "e-mail",
    "email id",
    "email address",
    "mail",
  ],
  phone: [
    "phone",
    "mobile",
    "contact",
    "phone no",
    "mobile no",
    "contact no",
    "phone number",
    "mob",
  ],
  date_of_birth: [
    "dob",
    "date of birth",
    "birth date",
    "birthdate",
    "d.o.b",
    "d.o.b.",
  ],
  address: [
    "address",
    "residential address",
    "home address",
  ],
  qualifications: [
    "qualifications",
    "qualification",
    "degree",
    "education",
    "degrees",
    "educational qualification",
  ],
  category: [
    "category",
    "type",
    "staff category",
    "staff type",
    "group",
    "department type",
  ],
  license_number: [
    "license number",
    "licence number",
    "license no",
    "licence no",
    "driving license",
    "driving licence",
    "dl number",
    "dl no",
    "license",
    "licence",
  ],
};

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9\s/]/g, "").trim();
}

// Profile columns only live on staff_details; the staff_members ones (phone,
// email, address, …) are already covered by COLUMN_ALIASES above.
const DETAIL_FIELDS = STAFF_PROFILE_FIELDS.filter((f) => f.table === "staff_details");
const DETAIL_HEADERS = new Map<string, StaffProfileField>();
for (const f of DETAIL_FIELDS) {
  for (const h of [f.label, f.key.replace(/_/g, " "), ...(f.aliases ?? [])]) {
    DETAIL_HEADERS.set(normalizeHeader(h), f);
  }
}
const DETAIL_PREFIX = "detail:";

function mapHeaders(headers: string[]): Record<number, string> {
  const mapping: Record<number, string> = {};
  const taken = new Set<string>();
  const claim = (index: number, field: string) => {
    mapping[index] = field;
    taken.add(field);
  };

  // Pass 1: exact matches, core columns then profile columns. Exact profile
  // matches must win over the substring pass below, or "Father's Name" would
  // be read as the staff member's own name.
  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    if (!normalized) return;
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (!taken.has(field) && (normalized === field || aliases.includes(normalized))) {
        claim(index, field);
        return;
      }
    }
    const detail = DETAIL_HEADERS.get(normalized);
    if (detail && !taken.has(DETAIL_PREFIX + detail.key)) {
      claim(index, DETAIL_PREFIX + detail.key);
    }
  });

  // Pass 2: substring fallback for core columns only, and only for a field no
  // column has claimed yet — a second match must not overwrite the first.
  headers.forEach((header, index) => {
    if (mapping[index]) return;
    const normalized = normalizeHeader(header);
    if (!normalized) return;
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (!taken.has(field) && aliases.some((alias) => normalized.includes(alias))) {
        claim(index, field);
        return;
      }
    }
  });

  return mapping;
}

/** Normalise + validate one profile cell; undefined value = blank. */
function parseDetailCell(
  field: StaffProfileField,
  raw: string
): { value?: unknown; warning?: string } {
  const text = field.type === "date" ? normalizeDateString(raw) : raw;
  const value = normalizeStaffProfileValue(field, text);
  if (value === undefined) return {};
  const check = staffProfileFieldsSchema.safeParse({ [field.key]: value });
  if (!check.success) {
    const msg = check.error.issues[0]?.message ?? "invalid";
    return { warning: `${field.label}: ${msg} ("${raw}") — skipped` };
  }
  return { value: (check.data as Record<string, unknown>)[field.key] };
}

function excelSerialToDate(serial: number): string {
  const epoch = new Date(1899, 11, 30);
  const date = new Date(epoch.getTime() + serial * 86400000);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeDateString(value: string): string {
  if (!value) return "";
  const num = Number(value);
  if (!isNaN(num) && num > 1000 && num < 100000) {
    return excelSerialToDate(num);
  }
  const parts = value.split(/[/\-\.]/);
  if (parts.length === 3) {
    const [a, b, c] = parts;
    if (a.length <= 2 && c.length === 4) {
      return `${c}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`;
    }
    if (a.length === 4) {
      return `${a}-${b.padStart(2, "0")}-${c.padStart(2, "0")}`;
    }
  }
  return value;
}

function toTitleCase(value: string): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizePhone(value: string): string {
  if (!value) return "";
  const cleaned = value.replace(/[eE]+\d+$/, "");
  return cleaned.replace(/\.0+$/, "").trim();
}

function isValidDate(d: string): boolean {
  if (!d) return true;
  const match = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(d);
  return !isNaN(date.getTime());
}

function validateRow(row: ParsedRow, categoryRequired: boolean): string[] {
  const errors: string[] = [];
  if (!row.name || row.name.trim().length < 2) {
    errors.push("Name is required (min 2 chars)");
  }
  if (!row.subject || row.subject.trim() === "") {
    errors.push("Subject/designation is required");
  }
  if (categoryRequired && !row.category) {
    errors.push("Category is required");
  }
  if (row.category && !resolveCategory(row.category)) {
    errors.push(`Unknown category: "${row.category}"`);
  }
  if (row.date_of_birth && !isValidDate(row.date_of_birth)) {
    row.date_of_birth = "";
  }
  return errors;
}

export function StaffBulkUpload({
  open,
  onOpenChange,
  onSuccess,
}: StaffBulkUploadProps) {
  const [step, setStep] = useState<"upload" | "preview">("upload");
  const [selectedCategory, setSelectedCategory] = useState<StaffCategory | "">("");
  const [hasFileCategory, setHasFileCategory] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [fileName, setFileName] = useState("");

  const resetState = () => {
    setStep("upload");
    setSelectedCategory("");
    setHasFileCategory(false);
    setParsedRows([]);
    setFileName("");
    setSubmitting(false);
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) resetState();
    onOpenChange(isOpen);
  };

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setFileName(file.name);

      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const XLSX = await import("xlsx");
          const data = new Uint8Array(evt.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const rawRows = XLSX.utils.sheet_to_json<string[]>(sheet, {
            header: 1,
            raw: false,
            defval: "",
          });

          if (rawRows.length < 2) {
            toast.error("File must have a header row and at least one data row");
            return;
          }

          const headers = rawRows[0].map(String);
          const columnMap = mapHeaders(headers);

          if (!Object.values(columnMap).includes("name")) {
            toast.error(
              'Could not find "Name" column. Please check the headers.'
            );
            return;
          }
          if (
            !Object.values(columnMap).includes("subject") &&
            !Object.values(columnMap).includes(DETAIL_PREFIX + "designation") &&
            !Object.values(columnMap).includes(DETAIL_PREFIX + "appointed_subject")
          ) {
            toast.error(
              'Could not find a "Subject", "Designation" or "Appointed for Subject" column. Please check the headers.'
            );
            return;
          }

          const fileCategoryCol = Object.values(columnMap).includes("category");
          setHasFileCategory(fileCategoryCol);

          const parsed: ParsedRow[] = [];
          for (let i = 1; i < rawRows.length; i++) {
            const row = rawRows[i];
            if (!row || row.every((cell) => !cell || String(cell).trim() === "")) {
              continue;
            }

            const record: ParsedRow = {
              name: "",
              subject: "",
              category: "",
              email: "",
              phone: "",
              date_of_birth: "",
              address: "",
              qualifications: "",
              license_number: "",
              details: {},
              warnings: [],
              errors: [],
            };

            const NAME_FIELDS = new Set(["name", "address"]);

            for (const [colIndex, field] of Object.entries(columnMap)) {
              const cellValue = String(row[Number(colIndex)] ?? "").trim();
              if (field.startsWith(DETAIL_PREFIX)) {
                const def = DETAIL_FIELDS.find(
                  (f) => f.key === field.slice(DETAIL_PREFIX.length)
                );
                if (!def || !cellValue) continue;
                const { value, warning } = parseDetailCell(def, cellValue);
                if (warning) record.warnings.push(warning);
                else if (value !== undefined) record.details[def.key] = value;
              } else if (field === "date_of_birth") {
                record[field] = normalizeDateString(cellValue);
              } else if (field === "phone") {
                record[field] = normalizePhone(cellValue);
              } else if (field === "email") {
                record[field] = cellValue.toLowerCase();
              } else if (NAME_FIELDS.has(field)) {
                (record as unknown as Record<string, unknown>)[field] = toTitleCase(cellValue);
              } else {
                (record as unknown as Record<string, unknown>)[field] = cellValue;
              }
            }

            // No Subject column (the registration proforma has none): the
            // directory title falls back to the appointed subject, then the
            // designation — what the old single "Subject / Designation" held.
            if (!record.subject) {
              const fallback =
                record.details.appointed_subject ?? record.details.designation;
              if (typeof fallback === "string") record.subject = fallback;
            }
            record.errors = validateRow(record, fileCategoryCol);
            parsed.push(record);
          }

          if (parsed.length === 0) {
            toast.error("No data rows found in the file");
            return;
          }

          setParsedRows(parsed);
          setStep("preview");
          toast.success(`Parsed ${parsed.length} rows from ${file.name}`);
        } catch {
          toast.error("Failed to parse file. Please ensure it is a valid Excel or CSV file.");
        }
      };
      reader.readAsArrayBuffer(file);
      e.target.value = "";
    },
    []
  );

  const validRows = parsedRows.filter((r) => r.errors.length === 0);
  const invalidRows = parsedRows.filter((r) => r.errors.length > 0);
  const skipped = parsedRows.flatMap((r) =>
    r.warnings.map((w) => `${r.name || "(no name)"} — ${w}`)
  );

  const removeRow = (index: number) => {
    setParsedRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!hasFileCategory && !selectedCategory) {
      toast.error("Please select a category");
      return;
    }
    if (validRows.length === 0) {
      toast.error("No valid rows to import");
      return;
    }

    setSubmitting(true);
    try {
      const res = await adminFetch("/api/staff/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: hasFileCategory ? undefined : selectedCategory,
          staff: validRows.map((r) => ({
            name: r.name,
            subject: r.subject,
            category: hasFileCategory ? resolveCategory(r.category) : undefined,
            email: r.email || undefined,
            phone: r.phone || undefined,
            date_of_birth: r.date_of_birth || undefined,
            address: r.address || undefined,
            qualifications: r.qualifications || undefined,
            license_number: r.license_number || undefined,
            details: Object.keys(r.details).length > 0 ? r.details : undefined,
          })),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to import staff");
        return;
      }

      // Accounts whose set-password email failed are still accounts, but must
      // not be counted as "emailed" — they come back as rows needing attention.
      const usersCreated: number = data.usersCreated ?? 0;
      const emailed = usersCreated - (data.emailsFailed ?? 0);
      const userMsg = usersCreated > 0
        ? ` — ${usersCreated} portal account${usersCreated === 1 ? "" : "s"} created, ${emailed} emailed a set-password link`
        : "";
      toast.success(
        `Successfully imported ${data.inserted} staff member${data.inserted === 1 ? "" : "s"}${userMsg}`
      );

      if (data.errors?.length > 0) {
        const details = data.errors
          .slice(0, 5)
          .map((e: { name: string; error: string }) => `${e.name}: ${e.error}`)
          .join("\n");
        const more = data.errors.length > 5 ? `\n...and ${data.errors.length - 5} more` : "";
        toast.warning(
          `${data.errors.length} row${data.errors.length === 1 ? "" : "s"} need${data.errors.length === 1 ? "s" : ""} attention`,
          { description: details + more, duration: 10000 }
        );
      }

      onSuccess();
      handleClose(false);
    } catch {
      toast.error("Failed to import staff");
    } finally {
      setSubmitting(false);
    }
  };

  const downloadTemplate = async () => {
    const XLSX = await import("xlsx");
    // Core columns first, then every profile column in registry order, so the
    // school can fill one sheet from the registration forms. Only Name,
    // Subject / Designation and Category are needed; blank profile cells are
    // simply not saved.
    const detailHeaders = DETAIL_FIELDS.map((f) => f.label);
    const example: Record<string, string> = {
      employee_no: "NKPS-101",
      date_of_joining: "01/04/2015",
      gender: "Male",
      designation: "PGT",
      department: "Science",
      appointed_subject: "Mathematics",
      ctet_qualified: "Yes",
    };
    const core = [
      [
        "Name",
        "Subject / Designation",
        "Category",
        "Email",
        "Phone",
        "DOB (DD/MM/YYYY)",
        "Address",
        "Qualifications",
        "License Number (Bus Drivers only)",
      ],
      [
        "Rahul Sharma",
        "Mathematics",
        "PGT",
        "rahul@example.com",
        "9876543210",
        "15/03/1985",
        "123, Main Street, Jaipur",
        "M.Sc., B.Ed.",
        "",
      ],
      ["Priya Gupta", "PTI", "Additional Staff", "", "9876543211", "", "", "", ""],
      ["Suresh Yadav", "Bus Driver", "Bus Driver", "", "9876543212", "", "", "", "RJ14 20190001234"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(
      core.map((row, i) => [
        ...row,
        ...(i === 0
          ? detailHeaders
          : DETAIL_FIELDS.map((f) => (i === 1 ? example[f.key] ?? "" : ""))),
      ])
    );

    ws["!cols"] = [
      { wch: 22 },
      { wch: 22 },
      { wch: 22 },
      { wch: 24 },
      { wch: 14 },
      { wch: 18 },
      { wch: 30 },
      { wch: 20 },
      { wch: 28 },
      ...detailHeaders.map((h) => ({ wch: Math.max(14, h.length + 2) })),
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Staff");
    XLSX.writeFile(wb, "staff_upload_template.xlsx");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-4xl max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10">
              <Upload className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <DialogTitle>
                {step === "upload" ? "Upload Staff Data" : "Preview & Import"}
              </DialogTitle>
              <p className="text-xs text-gray-500 mt-0.5">
                {step === "upload"
                  ? "Import staff members from Excel or CSV"
                  : hasFileCategory
                    ? "Categories detected from file"
                    : selectedCategory
                      ? `Importing as ${CATEGORY_OPTIONS.find(c => c.value === selectedCategory)?.label || ""}`
                      : "Select a category below"}
              </p>
            </div>
          </div>
        </DialogHeader>

        {step === "upload" ? (
          <div className="space-y-6">
            <div>
              <Label>Upload Excel or CSV File</Label>
              <div className="mt-2 border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-navy-400 transition-colors">
                <Upload className="h-10 w-10 mx-auto text-gray-400 mb-3" />
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                  Drop your file here or click to browse
                </p>
                <p className="text-xs text-gray-400 mb-4">
                  Supports .xlsx, .xls, and .csv files. Include a &quot;Category&quot; column to assign categories per row, or select one below after upload.
                </p>
                <Input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileChange}
                  className="max-w-xs mx-auto"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={downloadTemplate}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Download Template
              </Button>
              <p className="text-xs text-gray-400">
                First row must be column headers
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  File: <span className="font-medium">{fileName}</span>
                </p>
                <Badge variant="secondary" className="bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {validRows.length} valid
                </Badge>
                {invalidRows.length > 0 && (
                  <Badge variant="secondary" className="bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    {invalidRows.length} errors
                  </Badge>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStep("upload");
                  setParsedRows([]);
                  setFileName("");
                  setHasFileCategory(false);
                }}
              >
                Upload Different File
              </Button>
            </div>

            {/* Show category selector only when file doesn't have a category column */}
            {!hasFileCategory && (
              <div>
                <Label>Select Category for All Staff</Label>
                <Select
                  value={selectedCategory}
                  onValueChange={(val) => val && setSelectedCategory(val as StaffCategory)}
                >
                  <SelectTrigger className="w-full mt-1">
                    <SelectValue placeholder="Choose a staff category..." />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value} label={c.label}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-400 mt-1">
                  No &quot;Category&quot; column detected. All rows will be imported under this category.
                </p>
              </div>
            )}

            {skipped.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                <p className="font-medium">
                  {skipped.length} profile cell{skipped.length === 1 ? " was" : "s were"} not
                  in the expected format and will be left blank. The rest of each row
                  still imports; fix these later on the staff member&apos;s profile.
                </p>
                <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                  {skipped.slice(0, 6).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                  {skipped.length > 6 && <li>…and {skipped.length - 6} more</li>}
                </ul>
              </div>
            )}

            <div className="border rounded-xl overflow-hidden">
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Subject / Designation</TableHead>
                      {hasFileCategory && <TableHead>Category</TableHead>}
                      <TableHead>Phone</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Qualifications</TableHead>
                      <TableHead>License No.</TableHead>
                      <TableHead>Profile</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedRows.map((row, i) => (
                      <TableRow
                        key={i}
                        className={
                          row.errors.length > 0 ? "bg-red-50 dark:bg-red-950/30" : undefined
                        }
                      >
                        <TableCell className="text-gray-400 text-xs">
                          {i + 1}
                        </TableCell>
                        <TableCell className="font-medium">
                          {row.name || "—"}
                        </TableCell>
                        <TableCell>{row.subject || "—"}</TableCell>
                        {hasFileCategory && (
                          <TableCell>
                            {resolveCategory(row.category) ? (
                              <Badge variant="secondary" className="text-xs">
                                {CATEGORY_OPTIONS.find(c => c.value === resolveCategory(row.category))?.label || row.category}
                              </Badge>
                            ) : (
                              <span className="text-xs text-red-500">{row.category || "—"}</span>
                            )}
                          </TableCell>
                        )}
                        <TableCell className="text-gray-600 dark:text-gray-300">
                          {row.phone || "—"}
                        </TableCell>
                        <TableCell className="text-gray-600 dark:text-gray-300">
                          {row.email || "—"}
                        </TableCell>
                        <TableCell className="text-gray-600 dark:text-gray-300">
                          {row.qualifications || "—"}
                        </TableCell>
                        <TableCell className="text-gray-600 dark:text-gray-300">
                          {row.license_number || "—"}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {Object.keys(row.details).length > 0 ? (
                            <span className="text-gray-600 dark:text-gray-300">
                              {Object.keys(row.details).length} fields
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                          {row.warnings.length > 0 && (
                            <span
                              className="ml-1.5 text-amber-600 dark:text-amber-400"
                              title={row.warnings.join("\n")}
                            >
                              · {row.warnings.length} skipped
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {row.errors.length > 0 ? (
                            <span
                              className="text-xs text-red-600 dark:text-red-400"
                              title={row.errors.join(", ")}
                            >
                              {row.errors[0]}
                            </span>
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          )}
                        </TableCell>
                        <TableCell>
                          <button
                            onClick={() => removeRow(i)}
                            className="text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => handleClose(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting || validRows.length === 0}
                className="bg-navy-900 hover:bg-navy-800 text-white dark:bg-gold-500 dark:hover:bg-gold-400 dark:text-navy-900"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Import {validRows.length} Staff Member{validRows.length === 1 ? "" : "s"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
