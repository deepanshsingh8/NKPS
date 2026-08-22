"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@nkps/shared/lib/supabase/client";
import { adminApi, fetchRowDependencies } from "@nkps/shared/lib/admin-api";
import { describeDependencies } from "@nkps/shared/lib/row-dependencies";
import { Button } from "@nkps/shared/components/ui/button";
import { Input } from "@nkps/shared/components/ui/input";
import { Label } from "@nkps/shared/components/ui/label";
import { Badge } from "@nkps/shared/components/ui/badge";
import { Checkbox } from "@nkps/shared/components/ui/checkbox";
import { Card, CardContent } from "@nkps/shared/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@nkps/shared/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@nkps/shared/components/ui/table";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, BookOpen } from "lucide-react";

/**
 * Streams master (Science / Commerce / Humanities).
 *
 * The table has always existed, with name, code, is_active and sort_order —
 * it was designed as a master — but nothing could edit it. Its only writers
 * were the two historical importers, which auto-create a stream whenever a
 * sheet names one they don't recognise. A typo in an import file therefore
 * created a permanent junk stream with no way to rename, deactivate or remove
 * it. This is that missing screen.
 */

interface Stream {
  id: string;
  name: string;
  code: string | null;
  is_active: boolean;
  sort_order: number;
}

interface UsageCounts {
  classes: number;
  subjects: number;
  fee_structures: number;
}

const emptyForm = { name: "", code: "", is_active: true, sort_order: 0 };

export default function StreamsPage() {
  const [streams, setStreams] = useState<Stream[]>([]);
  const [usage, setUsage] = useState<Record<string, UsageCounts>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Stream | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const [{ data: rows }, { data: classes }, { data: streamSubjects }, { data: fees }] =
      await Promise.all([
        supabase
          .from("streams")
          .select("id, name, code, is_active, sort_order")
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
        supabase.from("classes").select("stream_id"),
        supabase.from("stream_subjects").select("stream_id"),
        supabase.from("fee_structures").select("stream_id"),
      ]);

    // What each stream is actually holding up. Deleting one that classes point
    // at would strand them (the FK is ON DELETE SET NULL), so the count has to
    // be on screen before the delete button is.
    const counts: Record<string, UsageCounts> = {};
    const bump = (id: string | null, key: keyof UsageCounts) => {
      if (!id) return;
      counts[id] ??= { classes: 0, subjects: 0, fee_structures: 0 };
      counts[id][key] += 1;
    };
    for (const c of classes ?? []) bump(c.stream_id as string | null, "classes");
    for (const s of streamSubjects ?? []) bump(s.stream_id as string | null, "subjects");
    for (const f of fees ?? []) bump(f.stream_id as string | null, "fee_structures");

    setStreams((rows as Stream[]) ?? []);
    setUsage(counts);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...emptyForm,
      sort_order: streams.length
        ? Math.max(...streams.map((s) => s.sort_order ?? 0)) + 1
        : 0,
    });
    setDialogOpen(true);
  };

  const openEdit = (s: Stream) => {
    setEditing(s);
    setForm({
      name: s.name,
      code: s.code ?? "",
      is_active: s.is_active,
      sort_order: s.sort_order ?? 0,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const name = form.name.trim();
    if (!name) {
      toast.error("Name is required");
      return;
    }
    // Two streams with the same name make every stream dropdown ambiguous,
    // and the importers match on name — so a duplicate would silently split
    // one stream's data across two rows.
    const clash = streams.find(
      (s) => s.id !== editing?.id && s.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (clash) {
      toast.error(`A stream named "${clash.name}" already exists`);
      return;
    }

    setSaving(true);
    const payload = {
      name,
      code: form.code.trim() || null,
      is_active: form.is_active,
      sort_order: Number(form.sort_order) || 0,
    };
    const res = editing
      ? await adminApi({
          action: "update",
          table: "streams",
          data: payload,
          match: { column: "id", value: editing.id },
        })
      : await adminApi({ action: "insert", table: "streams", data: payload });
    setSaving(false);

    if (!res.success) {
      toast.error(res.error ?? "Failed to save stream");
      return;
    }
    toast.success(editing ? "Stream updated" : "Stream added");
    setDialogOpen(false);
    load();
  };

  const handleDelete = async (s: Stream) => {
    // The "Used by" column above is a summary built from what this page reads
    // under RLS; the delete rule comes from the server so that this screen and
    // the Streams tab of /academics/subjects can never disagree about whether
    // the same stream is deletable.
    const deps = await fetchRowDependencies("streams", s.id);
    if (deps && deps.blockingTotal > 0) {
      toast.error(
        `"${s.name}" is used by ${describeDependencies(deps.blocking)}. Deactivate it instead — deleting would strand those records.`,
        { duration: 10000 }
      );
      return;
    }

    const willRemove = deps ? describeDependencies(deps.cascade) : "";
    if (
      !confirm(
        `Delete the stream "${s.name}"?${willRemove ? `\n\nThis also removes ${willRemove}.` : ""}\n\nThis cannot be undone.`
      )
    )
      return;

    const res = await adminApi({
      action: "delete",
      table: "streams",
      match: { column: "id", value: s.id },
    });
    if (!res.success) {
      toast.error(res.error ?? "Failed to delete stream", { duration: 10000 });
      return;
    }
    toast.success("Stream deleted");
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl">Streams</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Science, Commerce, Humanities — used by XI–XII classes, subject
            assignments and per-stream fee schedules.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Add Stream
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : streams.length === 0 ? (
            <div className="text-center py-12">
              <BookOpen className="h-10 w-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-gray-500 dark:text-gray-400">
                No streams yet.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-28">Code</TableHead>
                    <TableHead className="w-24">Order</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead>Used by</TableHead>
                    <TableHead className="w-24 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {streams.map((s) => {
                    const u = usage[s.id];
                    const parts = [
                      u?.classes ? `${u.classes} class${u.classes === 1 ? "" : "es"}` : null,
                      u?.subjects ? `${u.subjects} subject link${u.subjects === 1 ? "" : "s"}` : null,
                      u?.fee_structures
                        ? `${u.fee_structures} fee row${u.fee_structures === 1 ? "" : "s"}`
                        : null,
                    ].filter(Boolean);
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="text-gray-500 dark:text-gray-400">
                          {s.code || "—"}
                        </TableCell>
                        <TableCell className="text-gray-500 dark:text-gray-400">
                          {s.sort_order}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={
                              s.is_active
                                ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400"
                                : "bg-gray-100 text-gray-600 dark:bg-muted dark:text-gray-400"
                            }
                          >
                            {s.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-gray-500 dark:text-gray-400">
                          {parts.length > 0 ? parts.join(" · ") : "Nothing yet"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEdit(s)}
                              className="text-blue-500 hover:text-blue-700 p-1"
                              aria-label={`Edit ${s.name}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(s)}
                              className="text-red-500 hover:text-red-700 p-1 disabled:opacity-40"
                              aria-label={`Delete ${s.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Stream" : "Add Stream"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs font-medium">Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Science"
              />
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Imports match streams by name, so keep the spelling consistent
                with what your sheets use.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Code</Label>
                <Input
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="SCI"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Sort order</Label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))
                  }
                />
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id="stream-active"
                checked={form.is_active}
                onCheckedChange={(v) =>
                  setForm((f) => ({ ...f, is_active: v === true }))
                }
                className="mt-0.5"
              />
              <div>
                <Label htmlFor="stream-active" className="text-xs font-medium cursor-pointer">
                  Active
                </Label>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  Inactive streams stay attached to existing records but are
                  retired from new selections.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editing ? "Save changes" : "Add stream"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
