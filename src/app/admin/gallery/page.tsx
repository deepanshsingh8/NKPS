"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, FolderOpen, Image as LucideImage, Upload } from "lucide-react";
import { adminUpload, adminDelete } from "@/lib/admin-api";
import { FileDropZone } from "@/components/shared/FileDropZone";
import type { GalleryImage, GalleryEvent } from "@/types";

const CATEGORIES = ["academics", "sports", "cultural", "campus", "events"];

export default function AdminGalleryPage() {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [altText, setAltText] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [eventId, setEventId] = useState("");
  const [galleryEvents, setGalleryEvents] = useState<GalleryEvent[]>([]);
  const [files, setFiles] = useState<FileList | null>(null);

  const supabase = createClient();

  const fetchImages = async () => {
    const { data, error } = await supabase
      .from("gallery_images")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) {
      toast.error("Failed to fetch images");
      return;
    }

    setImages((data as GalleryImage[]) ?? []);
    setLoading(false);
  };

  const fetchGalleryEvents = async () => {
    const { data } = await supabase
      .from("gallery_events")
      .select("*")
      .order("event_date", { ascending: false });
    setGalleryEvents((data as GalleryEvent[]) ?? []);
  };

  useEffect(() => {
    fetchImages();
    fetchGalleryEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUpload = async () => {
    if (!files || files.length === 0) {
      toast.error("Please select at least one image");
      return;
    }
    if (!altText.trim()) {
      toast.error("Please enter alt text");
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append("files", files[i]);
      }
      formData.append("alt", altText.trim());
      formData.append("category", category);
      formData.append("currentCount", String(images.length));
      if (eventId) {
        formData.append("gallery_event_id", eventId);
      }

      const res = await adminUpload("/api/gallery", formData);

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Upload failed");
      } else if (data.results) {
        const failed = data.results.filter((r: { success: boolean }) => !r.success);
        if (failed.length > 0) {
          failed.forEach((r: { name: string; error: string }) =>
            toast.error(`Failed: ${r.name} — ${r.error}`)
          );
        }
        const succeeded = data.results.filter((r: { success: boolean }) => r.success);
        if (succeeded.length > 0) {
          toast.success(`${succeeded.length} image(s) uploaded successfully`);
        }
      }

      setDialogOpen(false);
      setAltText("");
      setCategory(CATEGORIES[0]);
      setEventId("");
      setFiles(null);
      fetchImages();
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (image: GalleryImage) => {
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl font-bold text-navy-900 dark:text-white">
          Gallery Management
        </h1>

        <div className="flex items-center gap-2">
          <Link href="/admin/gallery/events">
            <Button variant="outline" className="gap-2">
              <FolderOpen className="h-4 w-4" />
              Manage Events
            </Button>
          </Link>
          <Button className="bg-navy-900 hover:bg-navy-800 text-white" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Images
          </Button>
        </div>

      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
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
            {/* Image Upload Zone */}
            <FileDropZone
              accept="image/*"
              multiple
              icon="image"
              onChange={(fileList) => setFiles(fileList)}
              value={files}
              label="Drop images here or click to browse"
              hint="JPEG, PNG, WebP — max 10MB each"
            />

            {/* Alt Text */}
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

            {/* Category & Event in a row */}
            <div className="grid grid-cols-2 gap-4">
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
                  {galleryEvents.map((evt) => (
                    <option key={evt.id} value={evt.id}>
                      {evt.title} ({evt.event_date})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <Button
              onClick={handleUpload}
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

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-white dark:bg-card rounded-2xl overflow-hidden shadow-sm border border-gray-200 dark:border-border animate-pulse"
            >
              <div className="aspect-[4/3] bg-gray-200 dark:bg-muted" />
              <div className="p-4 space-y-2">
                <div className="h-4 bg-gray-200 dark:bg-muted rounded w-3/4" />
                <div className="h-3 bg-gray-200 dark:bg-muted rounded w-1/2" />
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {images.map((image) => (
            <div
              key={image.id}
              className="relative group bg-white dark:bg-card rounded-2xl overflow-hidden shadow-sm border border-gray-200 dark:border-border"
            >
              <div className="aspect-[4/3] bg-navy-100 flex items-center justify-center">
                {image.src ? (
                  <img
                    src={image.src}
                    alt={image.alt}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-gray-400 dark:text-gray-500">{image.alt}</span>
                )}
              </div>
              <div className="p-4">
                <p className="text-sm font-medium truncate">{image.alt}</p>
                <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 px-2 py-0.5 rounded-full">
                  {image.category}
                </span>
              </div>
              <button
                onClick={() => handleDelete(image)}
                className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
