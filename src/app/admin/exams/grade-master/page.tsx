"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { adminFetch, adminPatch, adminDelete } from "@/lib/admin-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  Trash2,
  Pencil,
  Loader2,
  Star,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { formatClassName } from "@/lib/utils";
import type { Class } from "@/types";

type Scope = "scholastic" | "non_scholastic";

interface Band {
  id?: string;
  label: string;
  min_pct: number | "";
  max_pct: number | "";
  remark: string | null;
  sort_order: number;
}

interface Scale {
  id: string;
  name: string;
  scope: Scope;
  is_default: boolean;
  bands: Band[];
  assigned_class_ids: string[];
}

const defaultSeedBands: Band[] = [
  { label: "A+", min_pct: 90, max_pct: 100, remark: null, sort_order: 0 },
  { label: "A", min_pct: 80, max_pct: 89.99, remark: null, sort_order: 1 },
  { label: "B+", min_pct: 70, max_pct: 79.99, remark: null, sort_order: 2 },
  { label: "B", min_pct: 60, max_pct: 69.99, remark: null, sort_order: 3 },
  { label: "C", min_pct: 50, max_pct: 59.99, remark: null, sort_order: 4 },
  { label: "D", min_pct: 40, max_pct: 49.99, remark: null, sort_order: 5 },
  { label: "F", min_pct: 0, max_pct: 39.99, remark: null, sort_order: 6 },
];

export default function GradeMasterPage() {
  const [scales, setScales] = useState<Scale[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [scopeTab, setScopeTab] = useState<Scope>("scholastic");
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Scale | null>(null);
  const [creatingScope, setCreatingScope] = useState<Scope | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Scale | null>(null);

  const fetchScales = useCallback(async () => {
    const res = await adminFetch("/api/erp/grade-scales");
    if (!res.ok) {
      toast.error("Failed to load grade scales");
      return;
    }
    const { data } = (await res.json()) as { data: Scale[] };
    setScales(data);
  }, []);

  const fetchClasses = useCallback(async () => {
    const supabase = createClient();
    const { data: current } = await supabase
      .from("academic_years")
      .select("id")
      .eq("is_current", true)
      .maybeSingle();
    if (!current) return;
    const { data } = await supabase
      .from("classes")
      .select("*, streams:stream_id(name)")
      .eq("academic_year_id", current.id)
      .order("sort_order", { ascending: true });
    if (data) setClasses(data);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    Promise.all([fetchScales(), fetchClasses()]).finally(() => setLoading(false));
  }, [fetchScales, fetchClasses]);

  const scopedScales = scales.filter((s) => s.scope === scopeTab);

  const openCreate = (scope: Scope) => {
    setEditTarget({
      id: "",
      name: "",
      scope,
      is_default: false,
      bands: scope === "scholastic" ? [...defaultSeedBands] : [
        { label: "A", min_pct: 75, max_pct: 100, remark: "Excellent", sort_order: 0 },
        { label: "B", min_pct: 50, max_pct: 74.99, remark: "Good", sort_order: 1 },
        { label: "C", min_pct: 0, max_pct: 49.99, remark: "Needs improvement", sort_order: 2 },
      ],
      assigned_class_ids: [],
    });
    setCreatingScope(scope);
    setEditOpen(true);
  };

  const openEdit = (scale: Scale) => {
    setEditTarget({
      ...scale,
      bands: scale.bands.map((b) => ({ ...b })),
      assigned_class_ids: [...scale.assigned_class_ids],
    });
    setCreatingScope(null);
    setEditOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl font-bold text-navy-900 dark:text-white">
            Grade Master
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Define grade cutoffs globally or per class. Teachers and report cards
            pick up the applicable scale automatically.
          </p>
        </div>
        <Button
          onClick={() => openCreate(scopeTab)}
          className="bg-navy-900 text-white hover:bg-navy-900/90"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Scale
        </Button>
      </div>

      <Tabs value={scopeTab} onValueChange={(v) => setScopeTab(v as Scope)}>
        <TabsList>
          <TabsTrigger value="scholastic">Scholastic</TabsTrigger>
          <TabsTrigger value="non_scholastic">Non-Scholastic</TabsTrigger>
        </TabsList>
      </Tabs>

      {scopedScales.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            No {scopeTab === "scholastic" ? "scholastic" : "non-scholastic"}{" "}
            scales yet. Click &quot;New Scale&quot; to create one.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {scopedScales.map((scale) => (
            <Card
              key={scale.id}
              className="bg-white dark:bg-card rounded-2xl"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base font-heading flex items-center gap-2">
                    {scale.name}
                    {scale.is_default && (
                      <Badge className="bg-gold-500/15 text-gold-700 dark:text-gold-400 border-gold-500/30">
                        <Star className="h-3 w-3 mr-1 fill-current" />
                        Default
                      </Badge>
                    )}
                  </CardTitle>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {scale.assigned_class_ids.length > 0
                    ? `${scale.assigned_class_ids.length} class${scale.assigned_class_ids.length === 1 ? "" : "es"} assigned`
                    : scale.is_default
                    ? "Applies to all classes without an override"
                    : "Not assigned to any class"}
                </p>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {scale.bands.slice(0, 7).map((b, i) => (
                    <Badge
                      key={i}
                      variant="outline"
                      className="text-[10px] font-mono"
                    >
                      {b.label} {b.min_pct}–{b.max_pct}
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEdit(scale)}
                    className="flex-1"
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDeleteTarget(scale)}
                    className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {editTarget && (
        <EditScaleDialog
          open={editOpen}
          onOpenChange={(o) => {
            setEditOpen(o);
            if (!o) {
              setEditTarget(null);
              setCreatingScope(null);
            }
          }}
          scale={editTarget}
          isCreating={creatingScope !== null}
          classes={classes}
          onSaved={async () => {
            setEditOpen(false);
            setEditTarget(null);
            setCreatingScope(null);
            await fetchScales();
          }}
        />
      )}

      {deleteTarget && (
        <DeleteScaleDialog
          scale={deleteTarget}
          scales={scales}
          onOpenChange={(o) => !o && setDeleteTarget(null)}
          onDeleted={async () => {
            setDeleteTarget(null);
            await fetchScales();
          }}
        />
      )}
    </div>
  );
}

// ---------- Edit dialog ----------

function EditScaleDialog({
  open,
  onOpenChange,
  scale,
  isCreating,
  classes,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  scale: Scale;
  isCreating: boolean;
  classes: Class[];
  onSaved: () => void;
}) {
  const [name, setName] = useState(scale.name);
  const [isDefault, setIsDefault] = useState(scale.is_default);
  const [bands, setBands] = useState<Band[]>(scale.bands);
  const [assignedClassIds, setAssignedClassIds] = useState<Set<string>>(
    new Set(scale.assigned_class_ids)
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(scale.name);
    setIsDefault(scale.is_default);
    setBands(scale.bands);
    setAssignedClassIds(new Set(scale.assigned_class_ids));
  }, [scale]);

  const updateBand = (i: number, patch: Partial<Band>) => {
    setBands((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  };
  const addBand = () => {
    setBands((prev) => [
      ...prev,
      { label: "", min_pct: 0, max_pct: 0, remark: null, sort_order: prev.length },
    ]);
  };
  const removeBand = (i: number) => {
    setBands((prev) => prev.filter((_, idx) => idx !== i));
  };

  const validate = (): string | null => {
    if (!name.trim()) return "Name is required.";
    if (bands.length === 0) return "At least one grade band is required.";
    for (const b of bands) {
      if (!b.label.trim()) return "Every band needs a label.";
      if (b.min_pct === "" || b.max_pct === "") {
        return "Every band needs min% and max%.";
      }
      const min = Number(b.min_pct);
      const max = Number(b.max_pct);
      if (isNaN(min) || isNaN(max)) return "Percentages must be numbers.";
      if (min < 0 || min > 100 || max < 0 || max > 100) {
        return "Percentages must be between 0 and 100.";
      }
      if (min > max) return `"${b.label}": min% must be ≤ max%.`;
    }
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        scope: scale.scope,
        is_default: isDefault,
        bands: bands.map((b, idx) => ({
          label: b.label.trim(),
          min_pct: Number(b.min_pct),
          max_pct: Number(b.max_pct),
          remark: b.remark?.trim() || null,
          sort_order: idx,
        })),
      };

      let scaleId = scale.id;
      if (isCreating) {
        const res = await adminFetch("/api/erp/grade-scales", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const body = await res.json();
        if (!res.ok) {
          toast.error(body.error ?? "Failed to create scale");
          return;
        }
        scaleId = body.data.id;
      } else {
        const res = await adminPatch(`/api/erp/grade-scales/${scale.id}`, {
          name: payload.name,
          is_default: payload.is_default,
          bands: payload.bands,
        });
        const body = await res.json();
        if (!res.ok) {
          toast.error(body.error ?? "Failed to update scale");
          return;
        }
      }

      // Sync class assignments: assign newly-added, clear newly-removed.
      const prevIds = new Set(scale.assigned_class_ids);
      const newIds = assignedClassIds;
      const toAdd = [...newIds].filter((id) => !prevIds.has(id));
      const toRemove = [...prevIds].filter((id) => !newIds.has(id));

      for (const classId of toAdd) {
        await adminFetch("/api/erp/class-grade-scales", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ class_id: classId, grade_scale_id: scaleId }),
        });
      }
      for (const classId of toRemove) {
        await adminFetch("/api/erp/class-grade-scales", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ class_id: classId, grade_scale_id: null }),
        });
      }

      toast.success(isCreating ? "Scale created" : "Scale updated");
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isCreating ? "New Grade Scale" : "Edit Grade Scale"}
          </DialogTitle>
          <DialogDescription>
            Define the letter grade that applies to each percentage range.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. CBSE Standard"
              />
            </div>
            <div className="flex items-end gap-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="is_default"
                  checked={isDefault}
                  onCheckedChange={(v) => setIsDefault(Boolean(v))}
                  disabled={scale.is_default && !isCreating}
                />
                <Label htmlFor="is_default" className="cursor-pointer">
                  Set as default for {scale.scope === "scholastic" ? "scholastic" : "non-scholastic"} grades
                </Label>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Grade bands</Label>
              <Button variant="outline" size="sm" onClick={addBand}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add band
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Label</TableHead>
                  <TableHead className="w-24">Min %</TableHead>
                  <TableHead className="w-24">Max %</TableHead>
                  <TableHead>Remark (optional)</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bands.map((band, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Input
                        value={band.label}
                        onChange={(e) => updateBand(i, { label: e.target.value })}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        max={100}
                        value={band.min_pct}
                        onChange={(e) =>
                          updateBand(i, {
                            min_pct: e.target.value === "" ? "" : Number(e.target.value),
                          })
                        }
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        max={100}
                        value={band.max_pct}
                        onChange={(e) =>
                          updateBand(i, {
                            max_pct: e.target.value === "" ? "" : Number(e.target.value),
                          })
                        }
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={band.remark ?? ""}
                        onChange={(e) =>
                          updateBand(i, { remark: e.target.value || null })
                        }
                        className="h-8"
                        placeholder="e.g. Outstanding"
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeBand(i)}
                        className="h-7 w-7 text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div>
            <Label>Apply to classes</Label>
            <p className="text-xs text-gray-500 mt-1 mb-2">
              Selected classes use this scale instead of the default. Uncheck to
              revert a class to the default scale.
            </p>
            {classes.length === 0 ? (
              <p className="text-xs text-gray-400">No classes in the current academic year.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto border rounded-lg p-2">
                {classes.map((cls) => (
                  <label
                    key={cls.id}
                    className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900 rounded px-2 py-1"
                  >
                    <Checkbox
                      checked={assignedClassIds.has(cls.id)}
                      onCheckedChange={(checked) => {
                        setAssignedClassIds((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(cls.id);
                          else next.delete(cls.id);
                          return next;
                        });
                      }}
                    />
                    <span className="truncate">{formatClassName(cls)}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-navy-900 text-white hover:bg-navy-900/90"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {isCreating ? "Create" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Delete dialog (with promote-default guided flow) ----------

function DeleteScaleDialog({
  scale,
  scales,
  onOpenChange,
  onDeleted,
}: {
  scale: Scale;
  scales: Scale[];
  onOpenChange: (o: boolean) => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [promoteCandidate, setPromoteCandidate] = useState<string>("");

  const candidates = scales.filter(
    (s) => s.id !== scale.id && s.scope === scale.scope
  );

  const handleDelete = async () => {
    setBusy(true);
    try {
      if (scale.is_default) {
        if (!promoteCandidate) {
          toast.error("Pick a scale to promote first.");
          return;
        }
        // 1. Promote the chosen scale to default.
        const promoteRes = await adminPatch(
          `/api/erp/grade-scales/${promoteCandidate}`,
          { is_default: true }
        );
        if (!promoteRes.ok) {
          const body = await promoteRes.json();
          toast.error(body.error ?? "Failed to promote replacement scale");
          return;
        }
        // 2. Delete the original (no longer default).
        const delRes = await adminDelete(
          `/api/erp/grade-scales/${scale.id}`,
          {}
        );
        if (!delRes.ok) {
          const body = await delRes.json();
          toast.error(body.error ?? "Failed to delete scale");
          return;
        }
        toast.success("Default promoted and scale deleted");
      } else {
        const res = await adminDelete(`/api/erp/grade-scales/${scale.id}`, {});
        if (!res.ok) {
          const body = await res.json();
          toast.error(body.error ?? "Failed to delete scale");
          return;
        }
        toast.success("Scale deleted");
      }
      onDeleted();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Delete &quot;{scale.name}&quot;?
          </DialogTitle>
          <DialogDescription>
            {scale.is_default
              ? "This is the current default scale — classes without a specific override fall back to it. Pick another scale to promote first; it'll be assigned to those classes automatically."
              : scale.assigned_class_ids.length > 0
              ? `This scale is currently applied to ${scale.assigned_class_ids.length} class${scale.assigned_class_ids.length === 1 ? "" : "es"}. Remove those assignments before deleting.`
              : "This scale is not assigned to any class. Safe to delete."}
          </DialogDescription>
        </DialogHeader>

        {scale.is_default && (
          <div className="space-y-2">
            <Label>Promote to default:</Label>
            {candidates.length === 0 ? (
              <p className="text-xs text-red-600">
                No other {scale.scope} scales exist. Create one first, then come back.
              </p>
            ) : (
              <Select
                value={promoteCandidate}
                onValueChange={(v) => v && setPromoteCandidate(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick a scale..." />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={handleDelete}
            disabled={
              busy ||
              (scale.is_default && !promoteCandidate) ||
              (!scale.is_default && scale.assigned_class_ids.length > 0)
            }
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {scale.is_default ? "Promote & Delete" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
