"use client";

import React, { useEffect, useState, useCallback } from "react";
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
import {
  Plus,
  Trash2,
  Pencil,
  Loader2,
  Image as LucideImage,
  Upload,
  FolderOpen,
  ImageIcon,
  ChevronRight,
  X,
} from "lucide-react";
import { adminUpload, adminDelete, adminApi } from "@/lib/admin-api";
import { FileDropZone } from "@/components/shared/FileDropZone";
import { AcademicYearSelect } from "@/components/shared/AcademicYearSelect";
import { cn } from "@/lib/utils";
import type { GalleryImage, GalleryEvent } from "@/types";

const CATEGORIES = ["academics", "sports", "cultural", "campus", "events"];

type Tab = "images" | "events";

export default function AdminGalleryPage() {
  const [tab, setTab] = useState<Tab>("images");

  // ── Images state ──
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [imagesLoading, setImagesLoading] = useState(true);
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [altText, setAltText] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [eventId, setEventId] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);

  // ── Events state ──
  const [events, setEvents] = useState<GalleryEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [imageCounts, setImageCounts] = useState<Record<string, number>>({});
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [eventImages, setEventImages] = useState<Record<string, GalleryImage[]>>({});
  const [eventImagesLoading, setEventImagesLoading] = useState<string | null>(null);

  // ── Event upload state ──
  const [eventUploadOpen, setEventUploadOpen] = useState(false);
  const [uploadEventId, setUploadEventId] = useState<string>("");
  const [eventUploadFiles, setEventUploadFiles] = useState<FileList | null>(null);
  const [eventUploadAlt, setEventUploadAlt] = useState("");
  const [eventUploadCategory, setEventUploadCategory] = useState("events");
  const [eventUploading, setEventUploading] = useState(false);
  const [eventForm, setEventForm] = useState({
    title: "",
    description: "",
    event_date: "",
    academic_year: "",
    is_public: true,
  });

  const supabase = createClient();

  // ── Fetch images ──
  const fetchImages = useCallback(async () => {
    const { data, error } = await supabase
      .from("gallery_images")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) {
      toast.error("Failed to fetch images");
      setImagesLoading(false);
      return;
    }

    setImages((data as GalleryImage[]) ?? []);
    setImagesLoading(false);
  }, [supabase]);

  // ── Fetch events ──
  const fetchEvents = useCallback(async () => {
    const { data, error } = await supabase
      .from("gallery_events")
      .select("*")
      .order("event_date", { ascending: false });

    if (error) {
      toast.error("Failed to fetch gallery events");
      setEventsLoading(false);
      return;
    }

    const eventsData = (data as GalleryEvent[]) ?? [];
    setEvents(eventsData);

    if (eventsData.length > 0) {
      const eventIds = eventsData.map((e) => e.id);
      const { data: imgs } = await supabase
        .from("gallery_images")
        .select("gallery_event_id")
        .in("gallery_event_id", eventIds);

      const counts: Record<string, number> = {};
      (imgs ?? []).forEach((img: { gallery_event_id: string | null }) => {
        if (img.gallery_event_id) {
          counts[img.gallery_event_id] = (counts[img.gallery_event_id] || 0) + 1;
        }
      });
      setImageCounts(counts);
    }

    setEventsLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchImages();
    fetchEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Image handlers ──
  const handleImageUpload = async () => {
    if (!files || files.length === 0) {
      toast.error("Please select at least one image");
      return;
    }
    if (!altText.trim()) {
      toast.error("Please enter alt text");
      return;
    }

    setUploading(true);

    let succeeded = 0;
    let failed = 0;

    // Upload one file at a time to avoid body size limits
    for (let i = 0; i < files.length; i++) {
      try {
        const formData = new FormData();
        formData.append("files", files[i]);
        formData.append("alt", files.length > 1 ? `${altText.trim()} ${i + 1}` : altText.trim());
        formData.append("category", category);
        formData.append("currentCount", String(images.length + succeeded));
        if (eventId) {
          formData.append("gallery_event_id", eventId);
        }

        const res = await adminUpload("/api/gallery", formData);
        const data = await res.json();

        if (!res.ok) {
          toast.error(`${files[i].name}: ${data.error || "Upload failed"}`);
          failed++;
        } else if (data.results?.[0]?.success) {
          succeeded++;
        } else {
          toast.error(`${files[i].name}: ${data.results?.[0]?.error || "Upload failed"}`);
          failed++;
        }
      } catch {
        toast.error(`${files[i].name}: Upload failed`);
        failed++;
      }
    }

    if (succeeded > 0) {
      toast.success(`${succeeded} image(s) uploaded successfully${failed > 0 ? `, ${failed} failed` : ""}`);
    }

    setImageDialogOpen(false);
    setAltText("");
    setCategory(CATEGORIES[0]);
    setEventId("");
    setFiles(null);
    fetchImages();
    setUploading(false);
  };

  const handleImageDelete = async (image: GalleryImage) => {
    if (!confirm(`Delete "${image.alt}"? This cannot be undone.`)) return;

    try {
      const res = await adminDelete("/api/gallery", { id: image.id, src: image.src });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Delete failed");
        return;
      }

      toast.success("Image deleted");
      fetchImages();
    } catch {
      toast.error("An unexpected error occurred");
    }
  };

  // ── Event upload handler ──
  const openEventUpload = (evtId: string) => {
    setUploadEventId(evtId);
    setEventUploadFiles(null);
    setEventUploadAlt("");
    setEventUploadCategory("events");
    setEventUploadOpen(true);
  };

  const handleEventUpload = async () => {
    if (!eventUploadFiles || eventUploadFiles.length === 0) {
      toast.error("Please select at least one image");
      return;
    }
    if (!eventUploadAlt.trim()) {
      toast.error("Please enter a description");
      return;
    }

    setEventUploading(true);

    let succeeded = 0;
    let failed = 0;

    // Upload one file at a time to avoid body size limits
    for (let i = 0; i < eventUploadFiles.length; i++) {
      try {
        const formData = new FormData();
        formData.append("files", eventUploadFiles[i]);
        formData.append("alt", eventUploadFiles.length > 1 ? `${eventUploadAlt.trim()} ${i + 1}` : eventUploadAlt.trim());
        formData.append("category", eventUploadCategory);
        formData.append("currentCount", String(images.length + succeeded));
        formData.append("gallery_event_id", uploadEventId);

        const res = await adminUpload("/api/gallery", formData);
        const data = await res.json();

        if (!res.ok) {
          toast.error(`${eventUploadFiles[i].name}: ${data.error || "Upload failed"}`);
          failed++;
        } else if (data.results?.[0]?.success) {
          succeeded++;
        } else {
          toast.error(`${eventUploadFiles[i].name}: ${data.results?.[0]?.error || "Upload failed"}`);
          failed++;
        }
      } catch {
        toast.error(`${eventUploadFiles[i].name}: Upload failed`);
        failed++;
      }
    }

    if (succeeded > 0) {
      toast.success(`${succeeded} image(s) uploaded to event${failed > 0 ? `, ${failed} failed` : ""}`);
    }

    setEventUploadOpen(false);
    // Clear cached images for this event so they refresh on next expand
    setEventImages((prev) => {
      const next = { ...prev };
      delete next[uploadEventId];
      return next;
    });
    // Re-expand to show updated photos
    if (expandedEventId === uploadEventId) {
      setExpandedEventId(null);
      setTimeout(() => toggleEventExpand(uploadEventId), 100);
    }
    fetchImages();
    fetchEvents();
    setEventUploading(false);
  };

  // ── Event handlers ──
  const resetEventForm = () => {
    setEventForm({
      title: "",
      description: "",
      event_date: "",
      academic_year: "",
      is_public: true,
    });
    setEditingId(null);
  };

  const openEditEvent = (evt: GalleryEvent) => {
    setEditingId(evt.id);
    setEventForm({
      title: evt.title,
      description: evt.description ?? "",
      event_date: evt.event_date,
      academic_year: evt.academic_year ?? "",
      is_public: evt.is_public,
    });
    setEventDialogOpen(true);
  };

  const handleEventSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventForm.title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!eventForm.event_date) {
      toast.error("Event date is required");
      return;
    }

    setSubmitting(true);

    const data = {
      title: eventForm.title.trim(),
      description: eventForm.description.trim() || null,
      event_date: eventForm.event_date,
      academic_year: eventForm.academic_year.trim() || null,
      is_public: eventForm.is_public,
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
      setEventDialogOpen(false);
      resetEventForm();
      await fetchEvents();
    }
    setSubmitting(false);
  };

  const handleEventDelete = async (id: string) => {
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
    await fetchEvents();
  };

  // ── Expand event to show photos ──
  const toggleEventExpand = async (eventId: string) => {
    if (expandedEventId === eventId) {
      setExpandedEventId(null);
      return;
    }

    setExpandedEventId(eventId);

    // Fetch images for this event if not already cached
    if (!eventImages[eventId]) {
      setEventImagesLoading(eventId);
      const { data, error } = await supabase
        .from("gallery_images")
        .select("*")
        .eq("gallery_event_id", eventId)
        .order("sort_order", { ascending: true });

      if (!error) {
        setEventImages((prev) => ({ ...prev, [eventId]: (data as GalleryImage[]) ?? [] }));
      }
      setEventImagesLoading(null);
    }
  };

  const handleEventImageDelete = async (image: GalleryImage) => {
    if (!confirm(`Remove this photo?`)) return;

    try {
      const res = await adminDelete("/api/gallery", { id: image.id, src: image.src });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Delete failed");
        return;
      }

      toast.success("Photo removed");

      // Update cached event images
      if (image.gallery_event_id) {
        setEventImages((prev) => ({
          ...prev,
          [image.gallery_event_id!]: (prev[image.gallery_event_id!] ?? []).filter((img) => img.id !== image.id),
        }));
        setImageCounts((prev) => ({
          ...prev,
          [image.gallery_event_id!]: Math.max(0, (prev[image.gallery_event_id!] || 0) - 1),
        }));
      }

      fetchImages();
    } catch {
      toast.error("Failed to delete photo");
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl font-bold text-navy-900 dark:text-white">
          Gallery Management
        </h1>

        {tab === "images" ? (
          <Button className="bg-navy-900 hover:bg-navy-800 text-white" onClick={() => setImageDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Images
          </Button>
        ) : (
          <Button
            className="bg-navy-900 hover:bg-navy-800 text-white"
            onClick={() => {
              resetEventForm();
              setEventDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Event
          </Button>
        )}
      </div>

      {/* Toggle Tabs */}
      <div className="flex items-center gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab("images")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
            tab === "images"
              ? "bg-white text-navy-900 shadow-sm"
              : "text-gray-500 hover:text-navy-900"
          )}
        >
          <LucideImage className="h-4 w-4" />
          By Category
        </button>
        <button
          onClick={() => setTab("events")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
            tab === "events"
              ? "bg-white text-navy-900 shadow-sm"
              : "text-gray-500 hover:text-navy-900"
          )}
        >
          <FolderOpen className="h-4 w-4" />
          By Event
        </button>
      </div>

      {/* ── Images Tab ── */}
      {tab === "images" && (
        <>
          {/* Upload Dialog */}
          <Dialog open={imageDialogOpen} onOpenChange={setImageDialogOpen}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
                    <LucideImage className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <DialogTitle>Upload Gallery Images</DialogTitle>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Add photos to the school gallery</p>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-5">
                <FileDropZone
                  accept="image/*"
                  multiple
                  icon="image"
                  onChange={(fileList) => setFiles(fileList)}
                  value={files}
                  label="Drop images here or click to browse"
                  hint="JPEG, PNG, WebP — max 10MB each"
                />

                <div className="space-y-1.5">
                  <Label htmlFor="alt" className="text-xs font-medium">Description *</Label>
                  <Input
                    id="alt"
                    placeholder="Describe the image(s) for accessibility"
                    value={altText}
                    onChange={(e) => setAltText(e.target.value)}
                    className="h-9"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="category" className="text-xs font-medium">Category</Label>
                    <select
                      id="category"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full h-9 rounded-lg border border-gray-200 dark:border-border px-3 text-sm bg-white dark:bg-muted focus:border-navy-900 focus:ring-1 focus:ring-navy-900 outline-none transition-colors"
                    >
                      {CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat.charAt(0).toUpperCase() + cat.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="event" className="text-xs font-medium">Event (optional)</Label>
                    <select
                      id="event"
                      value={eventId}
                      onChange={(e) => setEventId(e.target.value)}
                      className="w-full h-9 rounded-lg border border-gray-200 dark:border-border px-3 text-sm bg-white dark:bg-muted focus:border-navy-900 focus:ring-1 focus:ring-navy-900 outline-none transition-colors"
                    >
                      <option value="">No event</option>
                      {events.map((evt) => (
                        <option key={evt.id} value={evt.id}>
                          {evt.title} ({evt.event_date})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <Button
                  onClick={handleImageUpload}
                  disabled={uploading || !files || files.length === 0}
                  className="w-full bg-navy-900 hover:bg-navy-800 text-white h-11 rounded-xl font-medium"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Upload {files && files.length > 1 ? `${files.length} Images` : "Image"}
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Images Grid */}
          {imagesLoading ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-3">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div
                  key={i}
                  className="bg-white dark:bg-card rounded-lg overflow-hidden shadow-sm border border-gray-200 dark:border-border animate-pulse"
                >
                  <div className="aspect-square bg-gray-200 dark:bg-muted" />
                  <div className="p-2 space-y-1.5">
                    <div className="h-3 bg-gray-200 dark:bg-muted rounded w-3/4" />
                    <div className="h-2.5 bg-gray-200 dark:bg-muted rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : images.length === 0 ? (
            <div className="text-center py-20 text-gray-500 dark:text-gray-400">
              <p className="text-lg">No gallery images yet.</p>
              <p className="text-sm mt-1">Click &quot;Add Images&quot; to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-3">
              {images.map((image) => (
                <div
                  key={image.id}
                  className="relative group bg-white dark:bg-card rounded-lg overflow-hidden shadow-sm border border-gray-200 dark:border-border"
                >
                  <div className="aspect-square bg-navy-100 flex items-center justify-center">
                    {image.src ? (
                      <img
                        src={image.src}
                        alt={image.alt}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500 text-[10px]">{image.alt}</span>
                    )}
                  </div>
                  <div className="p-1.5">
                    <p className="text-[10px] font-medium truncate">{image.alt}</p>
                    <span className="text-[9px] bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 px-1 py-0.5 rounded-full">
                      {image.category}
                    </span>
                  </div>
                  <button
                    onClick={() => handleImageDelete(image)}
                    className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Events Tab ── */}
      {tab === "events" && (
        <>
          {/* Event Dialog */}
          <Dialog open={eventDialogOpen} onOpenChange={setEventDialogOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
                    <FolderOpen className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <DialogTitle>{editingId ? "Edit Gallery Event" : "Add Gallery Event"}</DialogTitle>
                    <p className="text-xs text-gray-500 mt-0.5">{editingId ? "Update event details" : "Create an event to organize photos"}</p>
                  </div>
                </div>
              </DialogHeader>
              <form onSubmit={handleEventSubmit} className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Title</Label>
                  <Input
                    placeholder="e.g. Annual Day 2025"
                    value={eventForm.title}
                    onChange={(e) =>
                      setEventForm({ ...eventForm, title: e.target.value })
                    }
                    required
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Description (optional)</Label>
                  <Input
                    placeholder="Brief description of the event"
                    value={eventForm.description}
                    onChange={(e) =>
                      setEventForm({ ...eventForm, description: e.target.value })
                    }
                    className="h-9"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Event Date</Label>
                    <Input
                      type="date"
                      value={eventForm.event_date}
                      onChange={(e) =>
                        setEventForm({ ...eventForm, event_date: e.target.value })
                      }
                      required
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Academic Year</Label>
                    <AcademicYearSelect
                      value={eventForm.academic_year}
                      onChange={(val) =>
                        setEventForm({ ...eventForm, academic_year: val })
                      }
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_public"
                    checked={eventForm.is_public}
                    onChange={(e) =>
                      setEventForm({ ...eventForm, is_public: e.target.checked })
                    }
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                  <Label htmlFor="is_public" className="mb-0 text-xs font-medium">
                    Visible on public gallery
                  </Label>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEventDialogOpen(false)}
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

          {/* Event Upload Dialog */}
          <Dialog open={eventUploadOpen} onOpenChange={setEventUploadOpen}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
                    <Upload className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <DialogTitle>Upload Photos to Event</DialogTitle>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Bulk upload images for{" "}
                      <span className="font-medium text-gray-700">
                        {events.find((e) => e.id === uploadEventId)?.title}
                      </span>
                    </p>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-5">
                <FileDropZone
                  accept="image/*"
                  multiple
                  icon="image"
                  onChange={(fileList) => setEventUploadFiles(fileList)}
                  value={eventUploadFiles}
                  label="Drop images here or click to browse"
                  hint="JPEG, PNG, WebP — max 10MB each"
                />

                <div className="space-y-1.5">
                  <Label htmlFor="event-upload-alt" className="text-xs font-medium">Description *</Label>
                  <Input
                    id="event-upload-alt"
                    placeholder="Describe the image(s) for accessibility"
                    value={eventUploadAlt}
                    onChange={(e) => setEventUploadAlt(e.target.value)}
                    className="h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="event-upload-category" className="text-xs font-medium">Category</Label>
                  <select
                    id="event-upload-category"
                    value={eventUploadCategory}
                    onChange={(e) => setEventUploadCategory(e.target.value)}
                    className="w-full h-9 rounded-lg border border-gray-200 dark:border-border px-3 text-sm bg-white dark:bg-muted focus:border-navy-900 focus:ring-1 focus:ring-navy-900 outline-none transition-colors"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                <Button
                  onClick={handleEventUpload}
                  disabled={eventUploading || !eventUploadFiles || eventUploadFiles.length === 0}
                  className="w-full bg-navy-900 hover:bg-navy-800 text-white h-11 rounded-xl font-medium"
                >
                  {eventUploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Upload {eventUploadFiles && eventUploadFiles.length > 1 ? `${eventUploadFiles.length} Images` : "Image"}
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Events Table */}
          {eventsLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-navy-900 dark:text-white" />
            </div>
          ) : (
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
                      <TableHead className="w-8" />
                      <TableHead>Title</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Year</TableHead>
                      <TableHead>Photos</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((evt) => {
                      const isExpanded = expandedEventId === evt.id;
                      const photos = eventImages[evt.id] ?? [];
                      const isLoadingPhotos = eventImagesLoading === evt.id;

                      return (
                        <React.Fragment key={evt.id}>
                          <TableRow
                            className={cn("cursor-pointer", isExpanded && "bg-gray-50/50 dark:bg-muted/30")}
                            onClick={() => toggleEventExpand(evt.id)}
                          >
                            <TableCell className="w-8 pr-0">
                              <ChevronRight
                                className={cn(
                                  "h-4 w-4 text-gray-400 transition-transform duration-200",
                                  isExpanded && "rotate-90"
                                )}
                              />
                            </TableCell>
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
                              <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => openEventUpload(evt.id)}
                                  className="text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                  title="Upload photos to this event"
                                >
                                  <Upload className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => openEditEvent(evt)}
                                  className="text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => handleEventDelete(evt.id)}
                                  className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>

                          {/* Expanded photo strip */}
                          {isExpanded && (
                            <tr>
                              <td colSpan={7} className="p-0">
                                <div className="bg-gray-50/80 dark:bg-muted/20 border-t border-b border-gray-100 dark:border-border px-6 py-4">
                                  {isLoadingPhotos ? (
                                    <div className="flex items-center gap-2 text-gray-400 dark:text-gray-500 text-sm py-2">
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                      Loading photos...
                                    </div>
                                  ) : photos.length === 0 ? (
                                    <div className="flex items-center gap-3 text-gray-400 dark:text-gray-500 text-sm py-2">
                                      <ImageIcon className="h-4 w-4" />
                                      No photos in this event yet.
                                      <button
                                        onClick={() => openEventUpload(evt.id)}
                                        className="text-emerald-600 hover:text-emerald-700 font-medium underline underline-offset-2"
                                      >
                                        Upload photos
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                                      {photos.map((img) => (
                                        <div
                                          key={img.id}
                                          className="relative group shrink-0 w-24 h-24 rounded-lg overflow-hidden border border-gray-200 dark:border-border bg-white dark:bg-card"
                                        >
                                          <img
                                            src={img.src}
                                            alt={img.alt}
                                            className="w-full h-full object-cover"
                                          />
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleEventImageDelete(img);
                                            }}
                                            className="absolute top-1 right-1 bg-red-500 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                                            title="Remove photo"
                                          >
                                            <X className="h-3 w-3" />
                                          </button>
                                          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/50 to-transparent px-1.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <p className="text-[9px] text-white truncate">{img.alt}</p>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
