"use client";

import { useEffect, useState } from "react";
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
import { Plus, Trash2, Loader2 } from "lucide-react";
import { adminUpload, adminDelete } from "@/lib/admin-api";
import type { GalleryImage } from "@/types";

const CATEGORIES = ["academics", "sports", "cultural", "campus", "events"];

export default function AdminGalleryPage() {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [altText, setAltText] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
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

  useEffect(() => {
    fetchImages();
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
        <h1 className="font-heading text-2xl font-bold text-navy-900">
          Gallery Management
        </h1>

        <Button className="bg-navy-900 hover:bg-navy-800 text-white" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Images
        </Button>

      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Gallery Images</DialogTitle>
          </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="files">Images</Label>
                <Input
                  id="files"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => setFiles(e.target.files)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="alt">Alt Text</Label>
                <Input
                  id="alt"
                  placeholder="Describe the image(s)"
                  value={altText}
                  onChange={(e) => setAltText(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <select
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                onClick={handleUpload}
                disabled={uploading}
                className="w-full bg-navy-900 hover:bg-navy-800 text-white"
              >
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  "Upload"
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
              className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-200 animate-pulse"
            >
              <div className="aspect-[4/3] bg-gray-200" />
              <div className="p-4 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-3/4" />
                <div className="h-3 bg-gray-200 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : images.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <p className="text-lg">No gallery images yet.</p>
          <p className="text-sm mt-1">Click &quot;Add Images&quot; to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {images.map((image) => (
            <div
              key={image.id}
              className="relative group bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-200"
            >
              <div className="aspect-[4/3] bg-navy-100 flex items-center justify-center">
                {image.src ? (
                  <img
                    src={image.src}
                    alt={image.alt}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-gray-400">{image.alt}</span>
                )}
              </div>
              <div className="p-4">
                <p className="text-sm font-medium truncate">{image.alt}</p>
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
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
