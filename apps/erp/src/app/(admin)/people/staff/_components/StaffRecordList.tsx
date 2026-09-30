"use client";

import { useState } from "react";
import type { z } from "zod";
import { Button } from "@nkps/shared/components/ui/button";
import { Input } from "@nkps/shared/components/ui/input";
import { Label } from "@nkps/shared/components/ui/label";
import { Textarea } from "@nkps/shared/components/ui/textarea";
import { NativeSelect } from "@nkps/shared/components/ui/native-select";
import { cn } from "@nkps/shared/lib/utils";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatProfileDate } from "./StaffProfileSection";

export type RecordColumn = {
  key: string;
  label: string;
  type: "text" | "date" | "longtext" | "select";
  options?: { value: string; label: string }[];
  required?: boolean;
  wide?: boolean;
};

type Row = Record<string, string> & { id?: string };

function toRows(records: Record<string, unknown>[], columns: RecordColumn[]): Row[] {
  return records.map((r) => {
    const row: Row = {};
    if (typeof r.id === "string") row.id = r.id;
    for (const c of columns) {
      const v = r[c.key];
      row[c.key] = v === null || v === undefined ? "" : String(v).slice(0, c.type === "date" ? 10 : undefined);
    }
    return row;
  });
}

function shown(col: RecordColumn, value: string): string {
  if (!value) return "—";
  if (col.type === "date") return formatProfileDate(value) ?? value;
  if (col.type === "select") return col.options?.find((o) => o.value === value)?.label ?? value;
  return value;
}

/**
 * A repeating block on the staff profile — trainings, notices. Read-only cards
 * until "Edit"; the whole list is then edited in place and saved in one go
 * (the API replaces the stored list), so reordering or deleting several
 * entries is one save, not one per row.
 */
export function StaffRecordList({
  title,
  emptyText,
  addLabel,
  columns,
  records,
  schema,
  onSave,
}: {
  title: string;
  emptyText: string;
  addLabel: string;
  columns: RecordColumn[];
  records: Record<string, unknown>[];
  schema: z.ZodTypeAny;
  onSave: (rows: Record<string, unknown>[]) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const view = toRows(records, columns);
  const blank = (): Row => Object.fromEntries(columns.map((c) => [c.key, ""]));

  const startEdit = () => {
    setRows(view.length > 0 ? view : [blank()]);
    setErrors({});
    setEditing(true);
  };

  const setCell = (i: number, key: string, value: string) => {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
    setErrors((e) => {
      const k = `${i}.${key}`;
      if (!e[k]) return e;
      const next = { ...e };
      delete next[k];
      return next;
    });
  };

  const save = async () => {
    // A block the admin added and left entirely empty is dropped, not rejected.
    const filled = rows.filter((r) => columns.some((c) => r[c.key]?.trim()));
    const payload = filled.map((r) => {
      const out: Record<string, unknown> = r.id ? { id: r.id } : {};
      for (const c of columns) out[c.key] = r[c.key]?.trim() ? r[c.key].trim() : null;
      return out;
    });

    const check = schema.safeParse(payload);
    if (!check.success) {
      const next: Record<string, string> = {};
      for (const issue of check.error.issues) {
        const [i, key] = issue.path;
        const k = `${String(i)}.${String(key)}`;
        if (!next[k]) next[k] = issue.message;
      }
      // Map error indexes back onto the visible rows (empty rows were skipped).
      const remapped: Record<string, string> = {};
      for (const [k, msg] of Object.entries(next)) {
        const [i, key] = k.split(".");
        const visible = rows.indexOf(filled[Number(i)]);
        remapped[`${visible}.${key}`] = msg;
      }
      setErrors(remapped);
      toast.error("Some entries need fixing");
      return;
    }

    setSaving(true);
    const ok = await onSave(payload);
    setSaving(false);
    if (ok) setEditing(false);
  };

  return (
    <section className="rounded-xl border bg-white p-4 sm:p-5 dark:bg-gray-900">
      <div className="mb-4 flex items-center justify-between gap-3 border-b pb-2">
        <h2 className="font-heading text-lg text-gray-900 dark:text-gray-100">{title}</h2>
        {!editing && (
          <Button variant="outline" size="sm" onClick={startEdit} className="gap-1.5">
            <Pencil className="h-3.5 w-3.5" />
            {view.length > 0 ? "Edit" : "Add"}
          </Button>
        )}
      </div>

      {!editing ? (
        view.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{emptyText}</p>
        ) : (
          <ol className="space-y-3">
            {view.map((r, i) => (
              <li key={r.id ?? i} className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800/50">
                <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
                  {columns.map((c) => (
                    <div key={c.key} className={cn("min-w-0", c.wide && "sm:col-span-2 lg:col-span-4")}>
                      <dt className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        {c.label}
                      </dt>
                      <dd className="whitespace-pre-line break-words text-sm text-gray-800 dark:text-gray-100">
                        {shown(c, r[c.key])}
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ol>
        )
      ) : (
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={r.id ?? `new-${i}`} className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  #{i + 1}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove entry"
                  className="text-red-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30"
                  onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {columns.map((c) => {
                  const err = errors[`${i}.${c.key}`];
                  const id = `rec-${i}-${c.key}`;
                  const cls = cn("w-full", err && "border-red-500 focus-visible:ring-red-500");
                  return (
                    <div key={c.key} className={cn("min-w-0 space-y-1.5", c.wide && "sm:col-span-2 lg:col-span-4")}>
                      <Label htmlFor={id}>
                        {c.label}
                        {c.required ? " *" : ""}
                      </Label>
                      {c.type === "select" ? (
                        <NativeSelect id={id} className={cls} value={r[c.key]} onChange={(e) => setCell(i, c.key, e.target.value)}>
                          <option value="">—</option>
                          {c.options?.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </NativeSelect>
                      ) : c.type === "longtext" ? (
                        <Textarea id={id} className={cls} rows={2} value={r[c.key]} onChange={(e) => setCell(i, c.key, e.target.value)} />
                      ) : (
                        <Input id={id} className={cls} type={c.type === "date" ? "date" : "text"} value={r[c.key]} onChange={(e) => setCell(i, c.key, e.target.value)} />
                      )}
                      {err && <p className="text-xs text-red-600 dark:text-red-400">{err}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setRows((rs) => [...rs, blank()])}>
            <Plus className="h-3.5 w-3.5" />
            {addLabel}
          </Button>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
