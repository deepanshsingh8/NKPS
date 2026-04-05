"use client";

import { useState, useCallback } from "react";
import * as XLSX from "xlsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Upload,
  Download,
  Loader2,
  AlertCircle,
  CheckCircle2,
  X,
} from "lucide-react";

interface ClassOption {
  id: string;
  name: string;
  section: string;
}

interface ParsedRow {
  admission_no: string;
  full_name: string;
  father_name: string;
  mother_name: string;
  date_of_birth: string;
  gender: string;
  phone: string;
  address: string;
  roll_number: number | undefined;
  email: string;
  blood_group: string;
  category: string;
  aadhar_number: string;
  previous_school: string;
  errors: string[];
}

interface StudentBulkUploadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classes: ClassOption[];
  onSuccess: () => void;
}

// Flexible column name mapping
const COLUMN_ALIASES: Record<string, string[]> = {
  admission_no: [
    "admission no",
    "adm no",
    "admission number",
    "admno",
    "sr no",
    "sr. no",
    "serial no",
    "s.no",
    "s no",
  ],
  full_name: [
    "name",
    "student name",
    "full name",
    "student's name",
    "pupil name",
  ],
  father_name: [
    "father name",
    "father's name",
    "father",
    "fathers name",
    "f/name",
    "f name",
  ],
  mother_name: [
    "mother name",
    "mother's name",
    "mother",
    "mothers name",
    "m/name",
    "m name",
  ],
  date_of_birth: ["dob", "date of birth", "birth date", "birthdate", "d.o.b", "d.o.b."],
  gender: ["gender", "sex", "m/f"],
  phone: ["phone", "mobile", "contact", "phone no", "mobile no", "contact no", "phone number"],
  address: ["address", "residential address", "home address"],
  roll_number: ["roll no", "roll number", "roll", "rollno", "roll no."],
  email: ["email", "e-mail", "email id", "email address", "mail"],
  blood_group: ["blood group", "blood type", "bloodgroup", "bg"],
  category: ["category", "caste", "caste category", "reservation", "social category"],
  aadhar_number: ["aadhar", "aadhaar", "aadhar no", "aadhaar no", "aadhar number", "aadhaar number", "uid", "aadhar no."],
  previous_school: ["previous school", "prev school", "last school", "school", "previous institution"],
};

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9\s/]/g, "").trim();
}

function mapHeaders(headers: string[]): Record<number, string> {
  const mapping: Record<number, string> = {};

  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    if (!normalized) return;

    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (
        normalized === field ||
        aliases.some((alias) => normalized === alias || normalized.includes(alias))
      ) {
        mapping[index] = field;
        break;
      }
    }
  });

  return mapping;
}

function normalizeGender(value: string): string {
  const v = value.toLowerCase().trim();
  if (v === "m" || v === "male" || v === "boy") return "male";
  if (v === "f" || v === "female" || v === "girl") return "female";
  if (v === "other" || v === "o") return "other";
  return "";
}

function normalizeDateString(value: string): string {
  if (!value) return "";
  // Handle DD/MM/YYYY or DD-MM-YYYY
  const parts = value.split(/[/\-\.]/);
  if (parts.length === 3) {
    const [a, b, c] = parts;
    // If first part looks like a day (1-31) and third looks like a year (4 digits)
    if (a.length <= 2 && c.length === 4) {
      return `${c}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`;
    }
    // Already YYYY-MM-DD
    if (a.length === 4) {
      return `${a}-${b.padStart(2, "0")}-${c.padStart(2, "0")}`;
    }
  }
  return value;
}

function validateRow(row: ParsedRow): string[] {
  const errors: string[] = [];
  if (!row.admission_no || row.admission_no.trim() === "") {
    errors.push("Admission number is required");
  }
  if (!row.full_name || row.full_name.trim().length < 2) {
    errors.push("Name is required (min 2 chars)");
  }
  return errors;
}

export function StudentBulkUpload({
  open,
  onOpenChange,
  classes,
  onSuccess,
}: StudentBulkUploadProps) {
  const [step, setStep] = useState<"upload" | "preview">("upload");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [fileName, setFileName] = useState("");

  const resetState = () => {
    setStep("upload");
    setSelectedClassId("");
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
      reader.onload = (evt) => {
        try {
          const data = new Uint8Array(evt.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const rawRows = XLSX.utils.sheet_to_json<string[]>(sheet, {
            header: 1,
          });

          if (rawRows.length < 2) {
            toast.error("File must have a header row and at least one data row");
            return;
          }

          const headers = rawRows[0].map(String);
          const columnMap = mapHeaders(headers);

          if (!Object.values(columnMap).includes("admission_no")) {
            toast.error(
              'Could not find "Admission No" column. Please check the headers.'
            );
            return;
          }
          if (!Object.values(columnMap).includes("full_name")) {
            toast.error(
              'Could not find "Name" column. Please check the headers.'
            );
            return;
          }

          const parsed: ParsedRow[] = [];
          for (let i = 1; i < rawRows.length; i++) {
            const row = rawRows[i];
            if (!row || row.every((cell) => !cell || String(cell).trim() === "")) {
              continue; // skip empty rows
            }

            const record: ParsedRow = {
              admission_no: "",
              full_name: "",
              father_name: "",
              mother_name: "",
              date_of_birth: "",
              gender: "",
              phone: "",
              address: "",
              roll_number: undefined,
              email: "",
              blood_group: "",
              category: "",
              aadhar_number: "",
              previous_school: "",
              errors: [],
            };

            for (const [colIndex, field] of Object.entries(columnMap)) {
              const cellValue = String(row[Number(colIndex)] ?? "").trim();
              if (field === "roll_number") {
                const num = parseInt(cellValue, 10);
                record.roll_number = isNaN(num) ? undefined : num;
              } else if (field === "gender") {
                record[field] = normalizeGender(cellValue);
              } else if (field === "date_of_birth") {
                record[field] = normalizeDateString(cellValue);
              } else {
                (record as unknown as Record<string, unknown>)[field] = cellValue;
              }
            }

            record.errors = validateRow(record);
            parsed.push(record);
          }

          if (parsed.length === 0) {
            toast.error("No data rows found in the file");
            return;
          }

          setParsedRows(parsed);
          setStep("preview");
          toast.success(`Parsed ${parsed.length} rows from ${file.name}`);
        } catch (err) {
          console.error("File parse error:", err);
          toast.error("Failed to parse file. Please ensure it is a valid Excel or CSV file.");
        }
      };
      reader.readAsArrayBuffer(file);
      // Reset input so same file can be re-selected
      e.target.value = "";
    },
    []
  );

  const validRows = parsedRows.filter((r) => r.errors.length === 0);
  const invalidRows = parsedRows.filter((r) => r.errors.length > 0);

  const removeRow = (index: number) => {
    setParsedRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!selectedClassId) {
      toast.error("Please select a class");
      return;
    }
    if (validRows.length === 0) {
      toast.error("No valid rows to import");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/erp/students/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          class_id: selectedClassId,
          students: validRows.map((r) => ({
            admission_no: r.admission_no,
            full_name: r.full_name,
            father_name: r.father_name || undefined,
            mother_name: r.mother_name || undefined,
            date_of_birth: r.date_of_birth || undefined,
            gender: r.gender || undefined,
            phone: r.phone || undefined,
            address: r.address || undefined,
            roll_number: r.roll_number,
            email: r.email || undefined,
            blood_group: r.blood_group || undefined,
            category: r.category || undefined,
            aadhar_number: r.aadhar_number || undefined,
            previous_school: r.previous_school || undefined,
          })),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to import students");
        return;
      }

      toast.success(
        `Successfully imported ${data.inserted} student${data.inserted === 1 ? "" : "s"}`
      );

      if (data.errors?.length > 0) {
        toast.warning(
          `${data.errors.length} student(s) had errors and were skipped`
        );
      }

      onSuccess();
      handleClose(false);
    } catch {
      toast.error("Failed to import students");
    } finally {
      setSubmitting(false);
    }
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      [
        "Admission No",
        "Name",
        "Father's Name",
        "Mother's Name",
        "DOB (DD/MM/YYYY)",
        "Gender (M/F)",
        "Phone",
        "Address",
        "Roll No",
        "Email",
        "Blood Group",
        "Category",
        "Aadhar Number",
        "Previous School",
      ],
      ["1001", "Rahul Kumar", "Rajesh Kumar", "Sunita Devi", "15/03/2012", "M", "9876543210", "123, Main Street", "1", "", "O+", "General", "", ""],
    ]);

    // Set column widths
    ws["!cols"] = [
      { wch: 14 },
      { wch: 20 },
      { wch: 20 },
      { wch: 20 },
      { wch: 18 },
      { wch: 12 },
      { wch: 14 },
      { wch: 30 },
      { wch: 8 },
      { wch: 22 },
      { wch: 12 },
      { wch: 12 },
      { wch: 16 },
      { wch: 24 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Students");
    XLSX.writeFile(wb, "student_upload_template.xlsx");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "upload" ? "Upload Student Data" : "Preview & Import"}
          </DialogTitle>
        </DialogHeader>

        {step === "upload" ? (
          <div className="space-y-6">
            <div>
              <Label>Select Class</Label>
              <Select value={selectedClassId} onValueChange={(val) => val && setSelectedClassId(val)}>
                <SelectTrigger className="w-full mt-1">
                  <SelectValue placeholder="Choose a class..." />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id} label={`${c.name} - ${c.section}`}>
                      {c.name} - {c.section}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Upload Excel or CSV File</Label>
              <div className="mt-2 border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-navy-400 transition-colors">
                <Upload className="h-10 w-10 mx-auto text-gray-400 mb-3" />
                <p className="text-sm text-gray-600 mb-2">
                  Drop your file here or click to browse
                </p>
                <p className="text-xs text-gray-400 mb-4">
                  Supports .xlsx, .xls, and .csv files
                </p>
                <Input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileChange}
                  className="max-w-xs mx-auto"
                  disabled={!selectedClassId}
                />
                {!selectedClassId && (
                  <p className="text-xs text-amber-600 mt-2">
                    Please select a class first
                  </p>
                )}
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
                <p className="text-sm text-gray-600">
                  File: <span className="font-medium">{fileName}</span>
                </p>
                <Badge variant="secondary" className="bg-green-100 text-green-700">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {validRows.length} valid
                </Badge>
                {invalidRows.length > 0 && (
                  <Badge variant="secondary" className="bg-red-100 text-red-700">
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
                }}
              >
                Upload Different File
              </Button>
            </div>

            <div className="border rounded-xl overflow-hidden">
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Adm No</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Father&apos;s Name</TableHead>
                      <TableHead>DOB</TableHead>
                      <TableHead>Gender</TableHead>
                      <TableHead>Roll</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedRows.map((row, i) => (
                      <TableRow
                        key={i}
                        className={
                          row.errors.length > 0 ? "bg-red-50" : undefined
                        }
                      >
                        <TableCell className="text-gray-400 text-xs">
                          {i + 1}
                        </TableCell>
                        <TableCell className="font-medium">
                          {row.admission_no || "—"}
                        </TableCell>
                        <TableCell>{row.full_name || "—"}</TableCell>
                        <TableCell className="text-gray-600">
                          {row.father_name || "—"}
                        </TableCell>
                        <TableCell className="text-gray-600">
                          {row.date_of_birth || "—"}
                        </TableCell>
                        <TableCell className="text-gray-600 capitalize">
                          {row.gender || "—"}
                        </TableCell>
                        <TableCell className="text-gray-600">
                          {row.roll_number ?? "—"}
                        </TableCell>
                        <TableCell>
                          {row.errors.length > 0 ? (
                            <span
                              className="text-xs text-red-600"
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
                className="bg-navy-900 hover:bg-navy-800 text-white"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Import {validRows.length} Student{validRows.length === 1 ? "" : "s"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
