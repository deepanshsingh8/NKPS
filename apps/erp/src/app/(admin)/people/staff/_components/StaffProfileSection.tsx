"use client";

import { useState } from "react";
import { Button } from "@nkps/shared/components/ui/button";
import { Input } from "@nkps/shared/components/ui/input";
import { Label } from "@nkps/shared/components/ui/label";
import { Textarea } from "@nkps/shared/components/ui/textarea";
import { NativeSelect } from "@nkps/shared/components/ui/native-select";
import { cn } from "@nkps/shared/lib/utils";
import type { StaffProfileField } from "@nkps/shared/lib/staff-profile-fields";
import { staffProfileFieldsSchema } from "@nkps/shared/lib/validations";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";

export type ProfileValues = Record<string, unknown>;
export type BusOption = { id: string; bus_number: string };

const ERROR_INPUT = "border-red-500 focus-visible:ring-red-500";

export function formatProfileDate(iso: unknown): string | null {
  if (typeof iso !== "string" || !iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/** Read-only text for one field's stored value; null renders as a dash. */
function displayValue(field: StaffProfileField, value: unknown, buses: BusOption[]): string | null {
  if (value === null || value === undefined || value === "") return null;
  switch (field.type) {
    case "boolean":
      return value ? "Yes" : "No";
    case "date":
      return formatProfileDate(value);
    case "enum":
      return field.options?.find((o) => o.value === value)?.label ?? String(value);
    case "bus":
      return buses.find((b) => b.id === value)?.bus_number ?? "Bus no longer active";
    default:
      return String(value);
  }
}

/** The form's string for a stored value ("" when blank). */
function draftValue(field: StaffProfileField, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (field.type === "boolean") return value ? "yes" : "no";
  if (field.type === "date") return String(value).slice(0, 10);
  return String(value);
}

function toDraft(fields: StaffProfileField[], values: ProfileValues): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f.key, draftValue(f, values[f.key])]));
}

/**
 * One section of the staff profile (Basic, Official, Contact, …), rendered
 * straight from the field registry. Read-only until "Edit"; saving sends only
 * the fields that changed, validated first with the schema the API uses.
 */
export function StaffProfileSection({
  title,
  fields,
  values,
  buses,
  onSave,
  note,
}: {
  title: string;
  fields: StaffProfileField[];
  values: ProfileValues;
  buses: BusOption[];
  onSave: (patch: Record<string, unknown>) => Promise<boolean>;
  note?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const startEdit = () => {
    setDraft(toDraft(fields, values));
    setErrors({});
    setEditing(true);
  };

  const save = async () => {
    const initial = toDraft(fields, values);
    const patch: Record<string, unknown> = {};
    for (const f of fields) {
      if (draft[f.key] === initial[f.key]) continue;
      patch[f.key] = draft[f.key] === "" ? null : draft[f.key];
    }
    if (Object.keys(patch).length === 0) {
      setEditing(false);
      return;
    }

    const check = staffProfileFieldsSchema.safeParse(patch);
    if (!check.success) {
      const next: Record<string, string> = {};
      for (const [key, msgs] of Object.entries(check.error.flatten().fieldErrors)) {
        if (msgs?.[0]) next[key] = msgs[0];
      }
      setErrors(next);
      const labels = fields.filter((f) => next[f.key]).map((f) => f.label);
      toast.error(`Please fix: ${labels.join(", ")}`);
      return;
    }

    setSaving(true);
    const ok = await onSave(patch);
    setSaving(false);
    if (ok) setEditing(false);
  };

  const setField = (key: string, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    if (errors[key]) {
      setErrors((e) => {
        const next = { ...e };
        delete next[key];
        return next;
      });
    }
  };

  return (
    <section className="rounded-xl border bg-white p-4 sm:p-5 dark:bg-gray-900">
      <div className="mb-4 flex items-center justify-between gap-3 border-b pb-2">
        <h2 className="font-heading text-lg text-gray-900 dark:text-gray-100">{title}</h2>
        {!editing && (
          <Button variant="outline" size="sm" onClick={startEdit} className="gap-1.5">
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
        )}
      </div>
      {note && (
        <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">{note}</p>
      )}

      <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((f) => {
          const wide = f.wide ? "sm:col-span-2 lg:col-span-3" : undefined;
          if (!editing) {
            const shown = displayValue(f, values[f.key], buses);
            return (
              <div key={f.key} className={cn("min-w-0", wide)}>
                <p className="mb-1 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {f.label}
                </p>
                <p className="whitespace-pre-line break-words text-sm text-gray-800 dark:text-gray-100">
                  {shown ?? "—"}
                </p>
              </div>
            );
          }
          const err = errors[f.key];
          const id = `staff-field-${f.key}`;
          const common = {
            id,
            "aria-invalid": err ? true : undefined,
            className: cn("w-full", err && ERROR_INPUT),
          };
          return (
            <div key={f.key} className={cn("min-w-0 space-y-1.5", wide)}>
              <Label htmlFor={id}>
                {f.label}
                {f.required ? " *" : ""}
              </Label>
              {f.type === "enum" || f.type === "boolean" || f.type === "bus" ? (
                <NativeSelect
                  {...common}
                  value={draft[f.key] ?? ""}
                  onChange={(e) => setField(f.key, e.target.value)}
                >
                  <option value="">—</option>
                  {f.type === "boolean" ? (
                    <>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </>
                  ) : f.type === "bus" ? (
                    buses.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.bus_number}
                      </option>
                    ))
                  ) : (
                    f.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))
                  )}
                </NativeSelect>
              ) : f.type === "longtext" ? (
                <Textarea
                  {...common}
                  rows={3}
                  value={draft[f.key] ?? ""}
                  onChange={(e) => setField(f.key, e.target.value)}
                />
              ) : (
                <Input
                  {...common}
                  type={f.type === "date" ? "date" : "text"}
                  inputMode={f.type === "year" || f.format === "mobile" || f.format === "aadhaar" || f.format === "pincode" ? "numeric" : undefined}
                  placeholder={f.placeholder ?? (f.type === "year" ? "YYYY" : undefined)}
                  value={draft[f.key] ?? ""}
                  onChange={(e) => setField(f.key, e.target.value)}
                />
              )}
              {err && <p className="text-xs text-red-600 dark:text-red-400">{err}</p>}
            </div>
          );
        })}
      </div>

      {editing && (
        <div className="mt-5 flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </div>
      )}
    </section>
  );
}
