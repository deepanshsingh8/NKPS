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
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Loader2, ImageIcon } from "lucide-react";
import { adminApi } from "@/lib/admin-api";
import type { GalleryEvent } from "@/types";

export default function AdminGalleryEventsPage() {
  const supabase = createClient();

  const [events, setEvents] = useState<GalleryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [imageCounts, setImageCounts] = useState<Record<string, number>>({});

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    event_date: "",
    academic_year: "",
    is_public: true,
  });

  const fetchData = useCallback(async () => {
    const { data, error } = await supabase
      .from("gallery_events")
      .select("*")
      .order("event_date", { ascending: false });

    if (error) {
      toast.error("Failed to fetch gallery events");
      setLoading(false);
      return;
    }

    setEvents((data as GalleryEvent[]) ?? []);

    // Fetch image counts per event
    if (data && data.length > 0) {
      const eventIds = data.map((e: GalleryEvent) => e.id);
      const { data: images } = await supabase
        .from("gallery_images")
        .select("gallery_event_id")
        .in("gallery_event_id", eventIds);

      const counts: Record<string, number> = {};
      (images ?? []).forEach((img: { gallery_event_id: string | null }) => {
        if (img.gallery_event_id) {
          counts[img.gallery_event_id] = (counts[img.gallery_event_id] || 0) + 1;
        }
      });
      setImageCounts(counts);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      event_date: "",
      academic_year: "",
      is_public: true,
    });
    setEditingId(null);
  };

  const openEdit = (evt: GalleryEvent) => {
    setEditingId(evt.id);
    setFormData({
      title: evt.title,
      description: evt.description ?? "",
      event_date: evt.event_date,
      academic_year: evt.academic_year ?? "",
      is_public: evt.is_public,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!formData.event_date) {
      toast.error("Event date is required");
      return;
    }

    setSubmitting(true);

    const data = {
      title: formData.title.trim(),
      description: formData.description.trim() || null,
      event_date: formData.event_date,
      academic_year: formData.academic_year.trim() || null,
      is_public: formData.is_public,
    };

    const result = editingId
      ? await adminApi({
          action: "update",
          table: "gallery_events",
          data,
          match: { column: "id", value: editingId },
        })
      : await adminApi({ action: "insert", table: "gallery_events", data });

    if (!result.success) {
      toast.error(result.error || "Failed to save event");
    } else {
      toast.success(editingId ? "Event updated" : "Event created");
      setDialogOpen(false);
      resetForm();
      await fetchData();
    }
    setSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this gallery event? Photos linked to it will be unlinked but not deleted.")) return;

    const result = await adminApi({
      action: "delete",
      table: "gallery_events",
      match: { column: "id", value: id },
    });

    if (!result.success) {
      toast.error("Failed to delete event");
      return;
    }

    toast.success("Event deleted");
    await fetchData();
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-navy-900 dark:text-white" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl font-bold text-navy-900 dark:text-white">
          Gallery Events
        </h1>
        <Button
          onClick={() => {
            resetForm();
            setDialogOpen(true);
          }}
          className="bg-navy-900 hover:bg-navy-800 text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Event
        </Button>
      </div>

      <div className="erp-table-container p-6">
        {events.length === 0 ? (
          <div className="text-center py-12 text-gray-400 dark:text-gray-500">
            <ImageIcon className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No gallery events yet</p>
            <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">
              Create events to organize photos by occasion
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Year</TableHead>
                <TableHead>Photos</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((evt) => (
                <TableRow key={evt.id}>
                  <TableCell className="font-medium">{evt.title}</TableCell>
                  <TableCell className="text-gray-600 dark:text-gray-300">
                    {formatDate(evt.event_date)}
                  </TableCell>
                  <TableCell className="text-gray-600 dark:text-gray-300">
                    {evt.academic_year || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                      {imageCounts[evt.id] || 0} photos
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {evt.is_public ? (
                      <Badge className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                        Public
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-gray-100 dark:bg-muted text-gray-500 dark:text-gray-400">
                        Hidden
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => openEdit(evt)}
                        className="text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDelete(evt.id)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Gallery Event" : "Add Gallery Event"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input
                placeholder="e.g. Annual Day 2025"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                required
              />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Input
                placeholder="Brief description of the event"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Event Date</Label>
                <Input
                  type="date"
                  value={formData.event_date}
                  onChange={(e) =>
                    setFormData({ ...formData, event_date: e.target.value })
                  }
                  required
                />
              </div>
              <div>
                <Label>Academic Year</Label>
                <Input
                  placeholder="e.g. 2024-25"
                  value={formData.academic_year}
                  onChange={(e) =>
                    setFormData({ ...formData, academic_year: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_public"
                checked={formData.is_public}
                onChange={(e) =>
                  setFormData({ ...formData, is_public: e.target.checked })
                }
                className="rounded border-gray-300 dark:border-gray-600"
              />
              <Label htmlFor="is_public" className="mb-0">
                Visible on public gallery
              </Label>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-navy-900 hover:bg-navy-800 text-white"
              >
                {submitting && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {editingId ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
