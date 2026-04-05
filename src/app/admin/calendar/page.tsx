"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Loader2, CalendarDays } from "lucide-react";
import { adminApi } from "@/lib/admin-api";
import type { CalendarEvent, CalendarEventType } from "@/types";

const EVENT_TYPES: CalendarEventType[] = [
  "exam",
  "holiday",
  "event",
  "pta_meeting",
  "other",
];

const EVENT_TYPE_LABELS: Record<CalendarEventType, string> = {
  exam: "Exam",
  holiday: "Holiday",
  event: "Event",
  pta_meeting: "PTA Meeting",
  other: "Other",
};

const EVENT_TYPE_COLORS: Record<CalendarEventType, string> = {
  exam: "bg-blue-100 text-blue-700 border-blue-200",
  holiday: "bg-green-100 text-green-700 border-green-200",
  event: "bg-amber-100 text-amber-700 border-amber-200",
  pta_meeting: "bg-purple-100 text-purple-700 border-purple-200",
  other: "bg-gray-100 text-gray-700 border-gray-200",
};

interface ClassOption {
  id: string;
  name: string;
  section: string;
}

export default function AdminCalendarPage() {
  const supabase = createClient();

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<CalendarEventType | "all">(
    "all"
  );
  const [addEventOpen, setAddEventOpen] = useState(false);
  const [editEventOpen, setEditEventOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editData, setEditData] = useState({
    title: "",
    description: "",
    event_type: "event" as CalendarEventType,
    start_date: "",
    end_date: "",
    class_id: "",
  });
  const [newEvent, setNewEvent] = useState({
    title: "",
    description: "",
    event_type: "event" as CalendarEventType,
    start_date: "",
    end_date: "",
    class_id: "",
  });

  const fetchEvents = useCallback(async () => {
    let query = supabase
      .from("calendar_events")
      .select("*")
      .order("start_date", { ascending: true });

    if (activeFilter !== "all") {
      query = query.eq("event_type", activeFilter);
    }

    const { data, error } = await query;
    if (error) {
      toast.error("Failed to fetch events");
      return;
    }
    setEvents((data as CalendarEvent[]) ?? []);
    setLoading(false);
  }, [supabase, activeFilter]);

  const fetchClasses = useCallback(async () => {
    const { data } = await supabase
      .from("classes")
      .select("id, name, section")
      .order("name", { ascending: true });
    setClasses((data ?? []) as ClassOption[]);
  }, [supabase]);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleAddEvent = async () => {
    if (!newEvent.title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!newEvent.start_date) {
      toast.error("Start date is required");
      return;
    }

    setSubmitting(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      toast.error("Not authenticated");
      setSubmitting(false);
      return;
    }

    const result = await adminApi({
      action: "insert",
      table: "calendar_events",
      data: {
        title: newEvent.title,
        description: newEvent.description || null,
        event_type: newEvent.event_type,
        start_date: newEvent.start_date,
        end_date: newEvent.end_date || null,
        class_id: newEvent.class_id || null,
        created_by: session.user.id,
      },
    });

    if (!result.success) {
      toast.error(`Failed to add event: ${result.error}`);
    } else {
      toast.success("Event added");
      setAddEventOpen(false);
      setNewEvent({
        title: "",
        description: "",
        event_type: "event",
        start_date: "",
        end_date: "",
        class_id: "",
      });
      fetchEvents();
    }
    setSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this event? This cannot be undone.")) return;

    const result = await adminApi({
      action: "delete",
      table: "calendar_events",
      match: { column: "id", value: id },
    });

    if (!result.success) {
      toast.error(`Failed to delete: ${result.error}`);
      return;
    }
    toast.success("Event deleted");
    fetchEvents();
  };

  const openEdit = (evt: CalendarEvent) => {
    setEditingEvent(evt);
    setEditData({
      title: evt.title,
      description: evt.description ?? "",
      event_type: evt.event_type,
      start_date: evt.start_date,
      end_date: evt.end_date ?? "",
      class_id: evt.class_id ?? "",
    });
    setEditEventOpen(true);
  };

  const handleEditEvent = async () => {
    if (!editingEvent) return;
    if (!editData.title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!editData.start_date) {
      toast.error("Start date is required");
      return;
    }

    setSubmitting(true);

    const result = await adminApi({
      action: "update",
      table: "calendar_events",
      data: {
        title: editData.title,
        description: editData.description || null,
        event_type: editData.event_type,
        start_date: editData.start_date,
        end_date: editData.end_date || null,
        class_id: editData.class_id || null,
      },
      match: { column: "id", value: editingEvent.id },
    });

    if (!result.success) {
      toast.error(`Failed to update event: ${result.error}`);
    } else {
      toast.success("Event updated");
      setEditEventOpen(false);
      setEditingEvent(null);
      fetchEvents();
    }
    setSubmitting(false);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl font-bold text-navy-900">
          Calendar Management
        </h1>
        <Button
          className="bg-navy-900 hover:bg-navy-800 text-white"
          onClick={() => setAddEventOpen(true)}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Event
        </Button>
      </div>

      {/* Filter buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setActiveFilter("all")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            activeFilter === "all"
              ? "bg-navy-900 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          All
        </button>
        {EVENT_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => setActiveFilter(type)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              activeFilter === type
                ? "bg-navy-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {EVENT_TYPE_LABELS[type]}
          </button>
        ))}
      </div>

      <Card className="bg-white rounded-2xl shadow-sm">
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-navy-900" />
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No events found.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((evt) => (
                  <TableRow key={evt.id}>
                    <TableCell className="font-medium">
                      {evt.title}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          EVENT_TYPE_COLORS[evt.event_type] ??
                          EVENT_TYPE_COLORS.other
                        }
                      >
                        {EVENT_TYPE_LABELS[evt.event_type] ?? evt.event_type}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(evt.start_date)}</TableCell>
                    <TableCell>
                      {evt.end_date ? formatDate(evt.end_date) : "--"}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-gray-500">
                      {evt.description || "--"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEdit(evt)}
                          className="text-blue-500 hover:text-blue-700 p-1"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(evt.id)}
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add Event Dialog */}
      <Dialog open={addEventOpen} onOpenChange={setAddEventOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Calendar Event</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                placeholder="Event title"
                value={newEvent.title}
                onChange={(e) =>
                  setNewEvent({ ...newEvent, title: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input
                placeholder="Brief description"
                value={newEvent.description}
                onChange={(e) =>
                  setNewEvent({ ...newEvent, description: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Event Type</Label>
              <select
                value={newEvent.event_type}
                onChange={(e) =>
                  setNewEvent({
                    ...newEvent,
                    event_type: e.target.value as CalendarEventType,
                  })
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                {EVENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {EVENT_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={newEvent.start_date}
                onChange={(e) =>
                  setNewEvent({ ...newEvent, start_date: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>End Date (optional)</Label>
              <Input
                type="date"
                value={newEvent.end_date}
                onChange={(e) =>
                  setNewEvent({ ...newEvent, end_date: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Class (optional, leave blank for all)</Label>
              <select
                value={newEvent.class_id}
                onChange={(e) =>
                  setNewEvent({ ...newEvent, class_id: e.target.value })
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">All Classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}-{c.section}
                  </option>
                ))}
              </select>
            </div>
            <Button
              onClick={handleAddEvent}
              disabled={submitting}
              className="w-full bg-navy-900 hover:bg-navy-800 text-white"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Add Event"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Event Dialog */}
      <Dialog open={editEventOpen} onOpenChange={setEditEventOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Calendar Event</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                placeholder="Event title"
                value={editData.title}
                onChange={(e) =>
                  setEditData({ ...editData, title: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input
                placeholder="Brief description"
                value={editData.description}
                onChange={(e) =>
                  setEditData({ ...editData, description: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Event Type</Label>
              <select
                value={editData.event_type}
                onChange={(e) =>
                  setEditData({
                    ...editData,
                    event_type: e.target.value as CalendarEventType,
                  })
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                {EVENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {EVENT_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={editData.start_date}
                onChange={(e) =>
                  setEditData({ ...editData, start_date: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>End Date (optional)</Label>
              <Input
                type="date"
                value={editData.end_date}
                onChange={(e) =>
                  setEditData({ ...editData, end_date: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Class (optional, leave blank for all)</Label>
              <select
                value={editData.class_id}
                onChange={(e) =>
                  setEditData({ ...editData, class_id: e.target.value })
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">All Classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}-{c.section}
                  </option>
                ))}
              </select>
            </div>
            <Button
              onClick={handleEditEvent}
              disabled={submitting}
              className="w-full bg-navy-900 hover:bg-navy-800 text-white"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Update Event"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
