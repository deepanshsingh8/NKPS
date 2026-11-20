"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { adminFetch } from "@nkps/shared/lib/admin-api";
import { Button } from "@nkps/shared/components/ui/button";
import { Checkbox } from "@nkps/shared/components/ui/checkbox";
import { Input } from "@nkps/shared/components/ui/input";
import { Label } from "@nkps/shared/components/ui/label";
import { NativeSelect } from "@nkps/shared/components/ui/native-select";
import type { TransportDirection } from "@nkps/shared/types";

interface HistoryEntry {
  id: string;
  effective_from: string;
  has_transport: boolean;
  bus_stop_id: string | null;
  stop_name: string | null;
  transport_direction: TransportDirection;
  transport_fee_override: number | null;
  source: string;
  note: string | null;
  recorded_by_name: string | null;
}

const SOURCE_LABEL: Record<string, string> = {
  baseline: "at the start of the session",
  assignment: "Student Assignments",
  change_request: "Transport → Changes",
  correction: "recorded as a past change",
  unrecorded: "changed without a date — dated the day it was made",
};

const DIRECTION_LABEL: Record<TransportDirection, string> = {
  both: "both ways",
  pickup_only: "pickup only",
  drop_only: "drop only",
};

function formatDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * A student's bus arrangement over the session (migration 140): what it was
 * from each date. The bus fee for a month is the arrangement in force that
 * month, so this is also where a change made before today — on the old
 * Assignments screen, which kept no date — is put right: record it as a past
 * change with the date it really happened.
 */
export function TransportHistoryPanel({
  enrollmentId,
  stops,
  sessionStart,
  sessionEnd,
  onChanged,
}: {
  enrollmentId: string;
  stops: Array<{ id: string; name: string }>;
  sessionStart: string | null;
  sessionEnd: string | null;
  onChanged: () => void;
}) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    effective_from: "",
    has_transport: true,
    bus_stop_id: "",
    transport_direction: "both" as TransportDirection,
    transport_fee_override: "",
    note: "",
  });

  // Bumped after a change, to read the history again.
  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(async () => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await adminFetch(`/api/transport/assignments/${enrollmentId}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          toast.error(data.error ?? "Failed to load the transport history");
          return;
        }
        setAvailable(data.available !== false);
        setEntries(data.periods ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enrollmentId, reloadKey]);

  const remove = async (entry: HistoryEntry) => {
    if (
      !window.confirm(
        `Remove the change from ${formatDate(entry.effective_from)}? The bus fee is priced again without it.`
      )
    ) {
      return;
    }
    setBusyId(entry.id);
    try {
      const res = await adminFetch(
        `/api/transport/assignments/${enrollmentId}?period_id=${entry.id}`,
        { method: "DELETE" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to remove the entry");
        return;
      }
      toast.success("Removed from the history");
      await load();
      onChanged();
    } finally {
      setBusyId(null);
    }
  };

  const savePast = async () => {
    if (!form.effective_from) {
      toast.error("Pick the date the change took effect");
      return;
    }
    if (form.has_transport && !form.bus_stop_id) {
      toast.error("Pick the stop");
      return;
    }
    const fee = Number(form.transport_fee_override);
    if (form.has_transport && form.transport_direction !== "both" && !(fee > 0)) {
      toast.error("A one-side fee greater than 0 is required");
      return;
    }
    setSaving(true);
    try {
      const res = await adminFetch(`/api/transport/assignments/${enrollmentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "past",
          effective_from: form.effective_from,
          has_transport: form.has_transport,
          bus_stop_id: form.has_transport ? form.bus_stop_id : null,
          transport_direction: form.has_transport ? form.transport_direction : "both",
          transport_fee_override:
            form.has_transport && form.transport_direction !== "both" ? fee : null,
          note: form.note.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to record the change");
        return;
      }
      toast.success("Past change recorded — the bus fee is re-priced from that month.");
      setFormOpen(false);
      setForm((f) => ({ ...f, effective_from: "", note: "" }));
      await load();
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-gray-700 dark:text-gray-200">Transport history</p>
        {available && !formOpen && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Record a past change
          </Button>
        )}
      </div>

      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
      ) : !available ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          The history starts once the database update (migration 140) has been run.
        </p>
      ) : entries && entries.length > 0 ? (
        <ul className="space-y-1.5">
          {entries.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-2 text-xs">
              <div className="min-w-0">
                <span className="font-medium text-navy-900 dark:text-white">
                  From {formatDate(e.effective_from)}:
                </span>{" "}
                {e.has_transport
                  ? `${e.stop_name ?? "a stop since removed"}, ${DIRECTION_LABEL[e.transport_direction] ?? e.transport_direction}${
                      e.transport_direction !== "both" && e.transport_fee_override != null
                        ? ` (₹${e.transport_fee_override} a month)`
                        : ""
                    }`
                  : "not on the bus"}
                <span className="block text-gray-500 dark:text-gray-400">
                  {SOURCE_LABEL[e.source] ?? e.source}
                  {e.recorded_by_name ? ` · ${e.recorded_by_name}` : ""}
                  {e.note ? ` · ${e.note}` : ""}
                </span>
              </div>
              {e.source !== "baseline" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => remove(e)}
                  disabled={busyId === e.id}
                  aria-label={`Remove the change from ${formatDate(e.effective_from)}`}
                  title="Remove this entry (entered by mistake)"
                  className="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                  {busyId === e.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          No changes recorded — the bus fee is charged at the current assignment for
          every month. If the stop changed earlier this session, record it as a past
          change so each month is charged at the stop actually used.
        </p>
      )}

      {formOpen && (
        <div className="space-y-2 rounded-md bg-gray-50 dark:bg-muted/40 p-2.5">
          <div className="space-y-1">
            <Label className="text-xs">From (the day the change took effect)</Label>
            <Input
              type="date"
              value={form.effective_from}
              min={sessionStart ?? undefined}
              max={sessionEnd ?? undefined}
              onChange={(ev) => setForm((f) => ({ ...f, effective_from: ev.target.value }))}
            />
          </div>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={form.has_transport}
              onCheckedChange={(v) => setForm((f) => ({ ...f, has_transport: v === true }))}
            />
            On the bus from that date
          </label>
          {form.has_transport && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Stop</Label>
                <NativeSelect
                  value={form.bus_stop_id}
                  onChange={(ev) => setForm((f) => ({ ...f, bus_stop_id: ev.target.value }))}
                  className="w-full"
                >
                  <option value="">Select stop</option>
                  {stops.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Direction</Label>
                <NativeSelect
                  value={form.transport_direction}
                  onChange={(ev) =>
                    setForm((f) => ({ ...f, transport_direction: ev.target.value as TransportDirection }))
                  }
                  className="w-full"
                >
                  <option value="both">Both ways</option>
                  <option value="pickup_only">Pickup only</option>
                  <option value="drop_only">Drop only</option>
                </NativeSelect>
              </div>
              {form.transport_direction !== "both" && (
                <div className="space-y-1">
                  <Label className="text-xs">One-side fee (a month)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.transport_fee_override}
                    onChange={(ev) => setForm((f) => ({ ...f, transport_fee_override: ev.target.value }))}
                  />
                </div>
              )}
            </>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Note (optional)</Label>
            <Input
              value={form.note}
              onChange={(ev) => setForm((f) => ({ ...f, note: ev.target.value }))}
              placeholder="e.g. Moved house in August; changed on the old screen"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={savePast} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              Record change
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
