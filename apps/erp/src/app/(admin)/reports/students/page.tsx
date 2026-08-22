"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@nkps/shared/lib/supabase/client";
import { adminFetch } from "@nkps/shared/lib/admin-api";
import { Button } from "@nkps/shared/components/ui/button";
import { Input } from "@nkps/shared/components/ui/input";
import { Label } from "@nkps/shared/components/ui/label";
import { Badge } from "@nkps/shared/components/ui/badge";
import { Checkbox } from "@nkps/shared/components/ui/checkbox";
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
import { Tabs, TabsList, TabsTrigger } from "@nkps/shared/components/ui/tabs";
import { toast } from "sonner";
import {
  Download,
  FileSpreadsheet,
  Loader2,
  Play,
  Search,
  X,
} from "lucide-react";
import {
  REPORT_FIELDS,
  REPORT_GROUPS,
  ALWAYS_FIELD_KEYS,
  SORTABLE_FIELDS,
  type ReportGroup,
} from "@nkps/shared/lib/report-fields";
import {
  ENROLLMENT_STATUSES,
  emptyReportFilters,
  type ReportFiltersInput,
  type TriState,
} from "@nkps/shared/lib/report-filters";
import { formatClassName } from "@nkps/shared/lib/utils";
import { useUrlState } from "@nkps/shared/lib/hooks/use-url-state";

interface Option {
  id: string;
  name: string;
  section?: string | null;
}

interface PreviewState {
  columns: { key: string; label: string; numeric: boolean }[];
  headers: string[];
  rows: (string | number | null)[][];
  total: number;
  sessionName: string;
  withheld: number;
}

const FILTER_TABS = [
  { key: "basics", label: "Basics" },
  { key: "demographics", label: "Demographics" },
  { key: "enrolment", label: "Enrolment" },
  { key: "sorting", label: "Sorting" },
] as const;

/** Preview page size. Exports are unpaged. */
const PREVIEW_ROWS = 50;

/** Columns above which a print/PDF layout stops being readable. */
const WIDE_REPORT_COLUMNS = 12;

export default function StudentReportPage() {
  const supabase = useMemo(() => createClient(), []);

  const [years, setYears] = useState<Option[]>([]);
  const [classes, setClasses] = useState<Option[]>([]);
  const [streams, setStreams] = useState<Option[]>([]);
  const [houses, setHouses] = useState<Option[]>([]);
  const [subjects, setSubjects] = useState<Option[]>([]);
  const [loadingMasters, setLoadingMasters] = useState(true);

  // Session lives in the URL so a report is a shareable link. The full field
  // selection deliberately does not — a 100-key query string is unusable, and
  // saved presets (a later phase) are the real answer to reusing a selection.
  const [sessionId, setSessionId] = useUrlState("session");

  const [filters, setFilters] = useState<ReportFiltersInput>(() =>
    emptyReportFilters("")
  );
  const [selected, setSelected] = useState<string[]>([
    "admission_no",
    "class_section",
    "father_name",
  ]);
  const [fieldSearch, setFieldSearch] = useState("");
  const [tab, setTab] = useState<(typeof FILTER_TABS)[number]["key"]>("basics");

  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [running, setRunning] = useState(false);
  const [exporting, setExporting] = useState<"csv" | "xlsx" | null>(null);

  // ── Masters ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [yearsRes, streamsRes, housesRes, subjectsRes] = await Promise.all([
        supabase.from("academic_years").select("id, name, is_current").order("name", { ascending: false }),
        supabase.from("streams").select("id, name").eq("is_active", true).order("sort_order"),
        supabase.from("houses").select("id, name").eq("is_active", true).order("sort_order"),
        supabase.from("subjects").select("id, name").eq("is_active", true).order("name"),
      ]);
      if (cancelled) return;

      const yearRows = (yearsRes.data ?? []) as (Option & { is_current?: boolean })[];
      setYears(yearRows);
      setStreams((streamsRes.data ?? []) as Option[]);
      setHouses((housesRes.data ?? []) as Option[]);
      setSubjects((subjectsRes.data ?? []) as Option[]);

      // Default to the current session rather than the newest: a school mid-way
      // through a year should not have to change the dropdown every time.
      const initial =
        sessionId || yearRows.find((y) => y.is_current)?.id || yearRows[0]?.id || "";
      if (initial) {
        setSessionId(initial);
        setFilters((f) => ({ ...f, session_id: initial }));
      }
      setLoadingMasters(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Classes are year-scoped, so the list reloads whenever the session changes —
  // and any class filter from the previous session is cleared, because those
  // ids do not exist in the new one.
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("classes")
        .select("id, name, section")
        .eq("academic_year_id", sessionId)
        .order("sort_order");
      if (cancelled) return;
      setClasses((data ?? []) as Option[]);
      setFilters((f) => ({ ...f, session_id: sessionId, class_ids: [] }));
      setPreview(null);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // ── Field picker ──────────────────────────────────────────────────────────
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const grouped = useMemo(() => {
    const needle = fieldSearch.trim().toLowerCase();
    const out: { group: ReportGroup; fields: typeof REPORT_FIELDS }[] = [];
    for (const group of REPORT_GROUPS) {
      const fields = REPORT_FIELDS.filter(
        (f) =>
          f.group === group &&
          (!needle || f.label.toLowerCase().includes(needle))
      );
      if (fields.length) out.push({ group, fields });
    }
    return out;
  }, [fieldSearch]);

  const toggleField = useCallback((key: string) => {
    if (ALWAYS_FIELD_KEYS.includes(key)) return;
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }, []);

  const toggleGroup = useCallback(
    (group: ReportGroup, on: boolean) => {
      const keys = REPORT_FIELDS.filter(
        (f) => f.group === group && !f.always
      ).map((f) => f.key);
      setSelected((prev) =>
        on
          ? [...prev, ...keys.filter((k) => !prev.includes(k))]
          : prev.filter((k) => !keys.includes(k))
      );
    },
    []
  );

  // ── Run / export ──────────────────────────────────────────────────────────
  const payload = useMemo(
    () => ({ ...filters, session_id: sessionId, fields: selected }),
    [filters, sessionId, selected]
  );

  const runPreview = useCallback(async () => {
    if (!sessionId) {
      toast.error("Pick a session first");
      return;
    }
    setRunning(true);
    try {
      const res = await adminFetch("/api/reports/students/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters: payload, page: 1, page_size: PREVIEW_ROWS }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Failed to run report");
        return;
      }
      setPreview({
        columns: json.columns,
        headers: json.headers,
        rows: json.rows,
        total: json.total,
        sessionName: json.session?.name ?? "",
        withheld: json.withheld_fields ?? 0,
      });
      if (json.withheld_fields > 0) {
        toast.warning(
          `${json.withheld_fields} restricted column(s) were withheld from this report`
        );
      }
      if (json.total === 0) toast.info("No students matched these filters");
    } catch {
      toast.error("Failed to run report");
    } finally {
      setRunning(false);
    }
  }, [payload, sessionId]);

  const exportReport = useCallback(
    async (format: "csv" | "xlsx") => {
      if (!sessionId) {
        toast.error("Pick a session first");
        return;
      }
      setExporting(format);
      try {
        // Plain fetch, not adminFetch: the export route authenticates by
        // cookie (see its header comment), and it streams a file rather than
        // JSON, so the response is read as a blob.
        const res = await fetch(`/api/reports/students/export?format=${format}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ filters: payload }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          toast.error(json.error ?? "Export failed");
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download =
          res.headers
            .get("Content-Disposition")
            ?.match(/filename="([^"]+)"/)?.[1] ?? `student-report.${format}`;
        link.click();
        URL.revokeObjectURL(url);
        toast.success(`Downloaded ${format.toUpperCase()}`);
      } catch {
        toast.error("Export failed");
      } finally {
        setExporting(null);
      }
    },
    [payload, sessionId]
  );

  // ── Filter helpers ────────────────────────────────────────────────────────
  /** base-ui Select emits `string | null`, and "all"/"none" are the
   *  no-filter sentinels. Both collapse to "" — the schema's "absent". */
  const pick = (v: string | null): string =>
    !v || v === "all" || v === "none" ? "" : v;

  const set = <K extends keyof ReportFiltersInput>(
    key: K,
    value: ReportFiltersInput[K]
  ) => setFilters((f) => ({ ...f, [key]: value }));

  const triState = (
    label: string,
    key: "is_rte" | "is_bpl" | "is_ews" | "is_cwsn" | "is_staff_ward" | "has_transport"
  ) => (
    <div key={key} className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Select
        value={(filters[key] as TriState) ?? "both"}
        onValueChange={(v) => set(key, (v ?? "both") as TriState)}
      >
        <SelectTrigger className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="both" label="Both">Both</SelectItem>
          <SelectItem value="yes" label="Yes">Yes</SelectItem>
          <SelectItem value="no" label="No">No</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  const columnWarning =
    selected.length + ALWAYS_FIELD_KEYS.length > WIDE_REPORT_COLUMNS;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-navy-900">
            Student Custom Report
          </h1>
          <p className="text-sm text-muted-foreground">
            Pick the students, pick the columns, get a sheet.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={runPreview} disabled={running || loadingMasters}>
            {running ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            Preview
          </Button>
          <Button
            variant="outline"
            onClick={() => exportReport("csv")}
            disabled={!!exporting || loadingMasters}
          >
            {exporting === "csv" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => exportReport("xlsx")}
            disabled={!!exporting || loadingMasters}
          >
            {exporting === "xlsx" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="mr-2 h-4 w-4" />
            )}
            Excel
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* ── Filters ── */}
        <div className="rounded-lg border bg-white">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList className="w-full justify-start rounded-b-none border-b bg-transparent px-2">
              {FILTER_TABS.map((t) => (
                <TabsTrigger key={t.key} value={t.key}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {tab === "basics" && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Session <span className="text-red-500">*</span>
                  </Label>
                  <Select value={sessionId ?? ""} onValueChange={(v) => setSessionId(v ?? "")}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select session" />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map((y) => (
                        <SelectItem key={y.id} value={y.id} label={y.name}>
                          {y.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">
                    Classes{" "}
                    <span className="text-muted-foreground">
                      (none = all classes)
                    </span>
                  </Label>
                  <div className="flex flex-wrap gap-1.5 rounded-md border p-2">
                    {classes.length === 0 && (
                      <span className="px-1 text-xs text-muted-foreground">
                        No classes in this session
                      </span>
                    )}
                    {classes.map((c) => {
                      const on = (filters.class_ids ?? []).includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() =>
                            set(
                              "class_ids",
                              on
                                ? (filters.class_ids ?? []).filter((id) => id !== c.id)
                                : [...(filters.class_ids ?? []), c.id]
                            )
                          }
                          className={`rounded-full border px-2.5 py-1 text-xs transition ${
                            on
                              ? "border-blue-600 bg-blue-600 text-white"
                              : "border-gray-300 bg-white hover:border-blue-400"
                          }`}
                        >
                          {formatClassName({
                            name: c.name,
                            section: c.section ?? "",
                          })}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Student Name contains</Label>
                  <Input
                    className="h-9"
                    value={filters.name_contains ?? ""}
                    onChange={(e) => set("name_contains", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Father&apos;s Name contains</Label>
                  <Input
                    className="h-9"
                    value={filters.father_name_contains ?? ""}
                    onChange={(e) => set("father_name_contains", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Section</Label>
                  <Input
                    className="h-9"
                    value={filters.section ?? ""}
                    onChange={(e) => set("section", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Admission Date from</Label>
                  <Input
                    type="date"
                    className="h-9"
                    value={filters.admission_date_from ?? ""}
                    onChange={(e) => set("admission_date_from", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Admission Date to</Label>
                  <Input
                    type="date"
                    className="h-9"
                    value={filters.admission_date_to ?? ""}
                    onChange={(e) => set("admission_date_to", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Date of Birth from</Label>
                  <Input
                    type="date"
                    className="h-9"
                    value={filters.dob_from ?? ""}
                    onChange={(e) => set("dob_from", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Date of Birth to</Label>
                  <Input
                    type="date"
                    className="h-9"
                    value={filters.dob_to ?? ""}
                    onChange={(e) => set("dob_to", e.target.value)}
                  />
                </div>
              </>
            )}

            {tab === "demographics" && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Gender</Label>
                  <Select
                    value={filters.gender ?? "all"}
                    onValueChange={(v) => set("gender", pick(v))}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" label="All">All</SelectItem>
                      <SelectItem value="male" label="Male">Male</SelectItem>
                      <SelectItem value="female" label="Female">Female</SelectItem>
                      <SelectItem value="other" label="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Category</Label>
                  <Select
                    value={filters.category ?? "all"}
                    onValueChange={(v) => set("category", pick(v))}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" label="All">All</SelectItem>
                      {["General", "SC", "ST", "OBC", "MBC"].map((c) => (
                        <SelectItem key={c} value={c} label={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Rural / Urban</Label>
                  <Select
                    value={filters.area_type ?? "all"}
                    onValueChange={(v) => set("area_type", pick(v))}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" label="All">All</SelectItem>
                      <SelectItem value="rural" label="Rural">Rural</SelectItem>
                      <SelectItem value="urban" label="Urban">Urban</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {triState("RTE", "is_rte")}
                {triState("BPL", "is_bpl")}
                {triState("EWS", "is_ews")}
                {triState("CWSN", "is_cwsn")}
                {triState("Staff Ward", "is_staff_ward")}
              </>
            )}

            {tab === "enrolment" && (
              <>
                <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                  <Label className="text-xs">Status</Label>
                  <div className="flex flex-wrap gap-3 rounded-md border p-2">
                    {ENROLLMENT_STATUSES.map((s) => {
                      const on = (filters.statuses ?? []).includes(s);
                      return (
                        <label
                          key={s}
                          className="flex cursor-pointer items-center gap-2 text-sm capitalize"
                        >
                          <Checkbox
                            checked={on}
                            onCheckedChange={() => {
                              const cur = filters.statuses ?? [];
                              const next = on
                                ? cur.filter((v) => v !== s)
                                : [...cur, s];
                              // At least one status must stay ticked; an empty
                              // set is a report of nothing, which reads as a bug.
                              if (next.length) set("statuses", next);
                            }}
                          />
                          {s}
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Stream</Label>
                  <Select
                    value={filters.stream_id ?? "all"}
                    onValueChange={(v) => set("stream_id", pick(v))}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" label="All">All</SelectItem>
                      {streams.map((s) => (
                        <SelectItem key={s.id} value={s.id} label={s.name}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">House</Label>
                  <Select
                    value={filters.house_id ?? "all"}
                    onValueChange={(v) => set("house_id", pick(v))}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" label="All">All</SelectItem>
                      {houses.map((h) => (
                        <SelectItem key={h.id} value={h.id} label={h.name}>
                          {h.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Subject</Label>
                  <Select
                    value={filters.subject_id ?? "all"}
                    onValueChange={(v) => set("subject_id", pick(v))}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" label="All">All</SelectItem>
                      {subjects.map((s) => (
                        <SelectItem key={s.id} value={s.id} label={s.name}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {triState("Transport", "has_transport")}
                <div className="space-y-1.5">
                  <Label className="text-xs">New / Old</Label>
                  <Select
                    value={filters.new_old ?? "both"}
                    onValueChange={(v) =>
                      set("new_old", (v ?? "both") as "both" | "new" | "old")
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="both" label="Both">Both</SelectItem>
                      <SelectItem value="new" label="New">
                        New (admitted this session)
                      </SelectItem>
                      <SelectItem value="old" label="Old">Old</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {tab === "sorting" && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Sort By</Label>
                  <Select
                    value={filters.sort_by ?? "none"}
                    onValueChange={(v) => set("sort_by", pick(v))}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" label="Default (name)">
                        Default (name)
                      </SelectItem>
                      {SORTABLE_FIELDS.map((f) => (
                        <SelectItem key={f.key} value={f.key} label={f.label}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Direction</Label>
                  <Select
                    value={filters.sort_dir ?? "asc"}
                    onValueChange={(v) => set("sort_dir", (v ?? "asc") as "asc" | "desc")}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asc" label="Ascending">Ascending</SelectItem>
                      <SelectItem value="desc" label="Descending">Descending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div />
                <div className="space-y-1.5">
                  <Label className="text-xs">Then By</Label>
                  <Select
                    value={filters.then_by ?? "none"}
                    onValueChange={(v) => set("then_by", pick(v))}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" label="None">None</SelectItem>
                      {SORTABLE_FIELDS.filter((f) => f.key !== filters.sort_by).map(
                        (f) => (
                          <SelectItem key={f.key} value={f.key} label={f.label}>
                            {f.label}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Direction</Label>
                  <Select
                    value={filters.then_dir ?? "asc"}
                    onValueChange={(v) => set("then_dir", (v ?? "asc") as "asc" | "desc")}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asc" label="Ascending">Ascending</SelectItem>
                      <SelectItem value="desc" label="Descending">Descending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Field picker ── */}
        <div className="flex max-h-[70vh] flex-col rounded-lg border bg-white">
          <div className="space-y-2 border-b p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Display / Print Fields</span>
              <Badge variant="secondary">
                {selected.length + ALWAYS_FIELD_KEYS.length} selected
              </Badge>
            </div>
            {/* The old ERP's worst UI: 111 unlabelled checkboxes in a 200px
                scroller with no search. This is the fix. */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-8 pl-7 text-sm"
                placeholder="Search fields…"
                value={fieldSearch}
                onChange={(e) => setFieldSearch(e.target.value)}
              />
            </div>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => setSelected([])}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-red-600"
              >
                <X className="h-3 w-3" /> Clear selection
              </button>
            )}
            {columnWarning && (
              <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                {selected.length + ALWAYS_FIELD_KEYS.length} columns — fine for
                Excel, too wide to print legibly.
              </p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {grouped.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No fields match “{fieldSearch}”
              </p>
            )}
            {grouped.map(({ group, fields }) => {
              const selectable = fields.filter((f) => !f.always);
              const allOn =
                selectable.length > 0 &&
                selectable.every((f) => selectedSet.has(f.key));
              return (
                <div key={group} className="mb-4">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {group}
                    </span>
                    {selectable.length > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleGroup(group, !allOn)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        {allOn ? "None" : "All"}
                      </button>
                    )}
                  </div>
                  <div className="space-y-1">
                    {fields.map((f) => (
                      <label
                        key={f.key}
                        className={`flex items-center gap-2 rounded px-1 py-0.5 text-sm ${
                          f.always
                            ? "cursor-default opacity-60"
                            : "cursor-pointer hover:bg-gray-50"
                        }`}
                      >
                        <Checkbox
                          checked={f.always || selectedSet.has(f.key)}
                          disabled={f.always}
                          onCheckedChange={() => toggleField(f.key)}
                        />
                        <span className="flex-1">{f.label}</span>
                        {f.sensitive && (
                          <span
                            title="Restricted — admins only"
                            className="text-[10px] uppercase text-amber-600"
                          >
                            PII
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Preview ── */}
      {preview && (
        <div className="rounded-lg border bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <div className="text-sm">
              <span className="font-medium">{preview.total}</span> student
              {preview.total === 1 ? "" : "s"} · session {preview.sessionName}
              {preview.total > preview.rows.length && (
                <span className="text-muted-foreground">
                  {" "}
                  · showing first {preview.rows.length}
                </span>
              )}
            </div>
            {preview.withheld > 0 && (
              <Badge variant="secondary" className="bg-amber-100 text-amber-900">
                {preview.withheld} column(s) withheld
              </Badge>
            )}
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {preview.headers.map((h, i) => (
                    <TableHead key={i} className="whitespace-nowrap">
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.rows.map((row, r) => (
                  <TableRow key={r}>
                    {row.map((cell, c) => (
                      <TableCell
                        key={c}
                        className={`whitespace-nowrap ${
                          preview.columns[c]?.numeric ? "text-right tabular-nums" : ""
                        }`}
                      >
                        {cell ?? ""}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
