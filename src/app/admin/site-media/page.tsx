"use client";

import { useEffect, useState, useRef } from "react";
import { Upload, RotateCcw, Loader2, Check, ChevronDown } from "lucide-react";
import { adminFetch, adminUpload, adminPatch } from "@/lib/admin-api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { SiteMedia } from "@/types";

const PAGE_LABELS: Record<string, string> = {
  home: "Home Page",
  about: "About Page",
  "student-life": "Student Life Page",
  global: "Global (Site-wide)",
};

const SECTION_LABELS: Record<string, string> = {
  hero_slider: "Hero Slider",
  facilities_preview: "Facilities Preview",
  stats_counter: "Stats Counter",
  latest_updates: "Latest Updates",
  activities: "Activities",
  leadership: "Leadership",
  founder_tribute: "Founder Tribute",
  hero: "Hero Section",
  branding: "Branding",
};

interface GroupedMedia {
  page: string;
  sections: {
    section: string;
    items: SiteMedia[];
  }[];
}

function groupMedia(items: SiteMedia[]): GroupedMedia[] {
  const pageOrder = ["home", "about", "student-life", "global"];
  const pageMap = new Map<string, Map<string, SiteMedia[]>>();

  for (const item of items) {
    if (!pageMap.has(item.page)) pageMap.set(item.page, new Map());
    const sectionMap = pageMap.get(item.page)!;
    if (!sectionMap.has(item.section)) sectionMap.set(item.section, []);
    sectionMap.get(item.section)!.push(item);
  }

  return pageOrder
    .filter((p) => pageMap.has(p))
    .map((page) => {
      const sectionMap = pageMap.get(page)!;
      return {
        page,
        sections: Array.from(sectionMap.entries()).map(([section, items]) => ({
          section,
          items,
        })),
      };
    });
}

function SlotCard({
  item,
  onUpdated,
}: {
  item: SiteMedia;
  onUpdated: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const isCustomized = item.current_url !== item.default_url;

  const handleReplace = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("slot", item.slot);

      const res = await adminUpload("/api/admin/site-media", formData);
      if (res.ok) {
        toast.success(`Updated: ${item.label}`);
        onUpdated();
      } else {
        const data = await res.json();
        toast.error(data.error || "Upload failed");
      }
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      const res = await adminPatch("/api/admin/site-media", {
        slot: item.slot,
        action: "reset",
      });
      if (res.ok) {
        toast.success(`Reset: ${item.label}`);
        onUpdated();
      } else {
        toast.error("Reset failed");
      }
    } catch {
      toast.error("Reset failed");
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-start gap-4 p-4">
        {/* Thumbnail */}
        <div className="w-32 h-24 rounded-lg overflow-hidden bg-gray-100 shrink-0 relative">
          <img
            src={item.current_url}
            alt={item.alt_text || item.label}
            className="w-full h-full object-cover"
          />
          {isCustomized && (
            <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-green-500 border border-white" title="Custom image" />
          )}
        </div>

        {/* Info + Actions */}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-navy-900 text-sm truncate">
            {item.label}
          </p>
          <p className="text-xs text-gray-400 mt-0.5 font-mono">{item.slot}</p>

          <div className="flex gap-2 mt-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleReplace(file);
                e.target.value = "";
              }}
            />
            <Button
              size="sm"
              variant="outline"
              className="text-xs"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5 mr-1.5" />
              )}
              Replace
            </Button>

            {isCustomized && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                disabled={resetting}
                onClick={handleReset}
              >
                {resetting ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                )}
                Reset Default
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminSiteMediaPage() {
  const [items, setItems] = useState<SiteMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPages, setExpandedPages] = useState<Set<string>>(
    new Set(["home"])
  );

  const fetchMedia = async () => {
    try {
      const res = await adminFetch("/api/admin/site-media");
      const data = await res.json();
      if (res.ok) {
        setItems(data.data ?? []);
      }
    } catch {
      toast.error("Failed to load site media");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMedia();
  }, []);

  const togglePage = (page: string) => {
    setExpandedPages((prev) => {
      const next = new Set(prev);
      if (next.has(page)) next.delete(page);
      else next.add(page);
      return next;
    });
  };

  const grouped = groupMedia(items);
  const customizedCount = items.filter(
    (i) => i.current_url !== i.default_url
  ).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-2xl font-bold text-navy-900">
            Site Media
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage images across all website pages.{" "}
            {customizedCount > 0 && (
              <span className="inline-flex items-center gap-1 text-green-600">
                <Check className="h-3.5 w-3.5" />
                {customizedCount} customized
              </span>
            )}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-gray-200 animate-pulse h-28"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <p className="text-lg">No site media slots found.</p>
          <p className="text-sm mt-1">
            Run the seed script to populate image slots.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ page, sections }) => {
            const isExpanded = expandedPages.has(page);
            const pageCustomized = sections
              .flatMap((s) => s.items)
              .filter((i) => i.current_url !== i.default_url).length;

            return (
              <div
                key={page}
                className="border border-gray-200 rounded-2xl overflow-hidden"
              >
                <button
                  onClick={() => togglePage(page)}
                  className="w-full flex items-center justify-between p-5 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <h2 className="font-heading text-lg font-semibold text-navy-900">
                      {PAGE_LABELS[page] || page}
                    </h2>
                    {pageCustomized > 0 && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                        {pageCustomized} customized
                      </span>
                    )}
                  </div>
                  <ChevronDown
                    className={cn(
                      "h-5 w-5 text-gray-400 transition-transform duration-200",
                      isExpanded && "rotate-180"
                    )}
                  />
                </button>

                {isExpanded && (
                  <div className="p-5 space-y-6">
                    {sections.map(({ section, items: sectionItems }) => (
                      <div key={section}>
                        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                          {SECTION_LABELS[section] || section}
                        </h3>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                          {sectionItems.map((item) => (
                            <SlotCard
                              key={item.id}
                              item={item}
                              onUpdated={fetchMedia}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
