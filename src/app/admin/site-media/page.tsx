"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Image from "next/image";
import {
  Upload,
  RotateCcw,
  Loader2,
  Check,
  ChevronDown,
  Plus,
  Trash2,
  Pencil,
  ImageIcon,
} from "lucide-react";
import { adminFetch, adminUpload, adminDelete, adminPatch } from "@/lib/admin-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { FileDropZone } from "@/components/shared/FileDropZone";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { SiteMedia, SectionCard, SectionCardType } from "@/types";

/* ─── Image Slots Tab (existing) ─── */

const PAGE_LABELS: Record<string, string> = {
  home: "Home Page",
  about: "About Page",
  facilities: "Facilities Page",
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
  campus_facilities: "Campus Facilities",
  testimonials: "Testimonials",
};

interface GroupedMedia {
  page: string;
  sections: {
    section: string;
    items: SiteMedia[];
  }[];
}

function groupMedia(items: SiteMedia[]): GroupedMedia[] {
  const pageOrder = ["home", "about", "facilities", "student-life", "global"];
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
    <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-border shadow-sm overflow-hidden">
      <div className="flex items-start gap-4 p-4">
        <div className="w-32 h-24 rounded-lg overflow-hidden bg-gray-100 dark:bg-muted shrink-0 relative">
          <Image
            src={item.current_url}
            alt={item.alt_text || item.label}
            fill
            className="object-cover"
            sizes="128px"
          />
          {isCustomized && (
            <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-green-500 border border-white" title="Custom image" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-medium text-navy-900 dark:text-white text-sm truncate">
            {item.label}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 font-mono">{item.slot}</p>

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

/* ─── Section Cards Tab ─── */

const CARD_SECTIONS: { value: SectionCardType; label: string }[] = [
  { value: "hero_slider", label: "Hero Slider" },
  { value: "testimonials", label: "Testimonials" },
  { value: "latest_updates", label: "Latest Updates" },
  { value: "facilities_preview", label: "Facilities Preview" },
];

const SECTION_FIELD_MAP: Record<SectionCardType, { required: string[]; optional: string[] }> = {
  hero_slider: {
    required: ["title", "subtitle"],
    optional: ["cta_text", "cta_link"],
  },
  testimonials: {
    required: ["quote", "name", "role"],
    optional: [],
  },
  latest_updates: {
    required: ["title", "description", "date"],
    optional: ["link"],
  },
  facilities_preview: {
    required: ["title", "description"],
    optional: ["icon"],
  },
};

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  subtitle: "Subtitle",
  description: "Description",
  quote: "Quote",
  name: "Name",
  role: "Role",
  date: "Date",
  cta_text: "CTA Text",
  cta_link: "CTA Link",
  icon: "Icon",
  link: "Link",
};

const FIELD_PLACEHOLDERS: Record<string, string> = {
  title: "Card title",
  subtitle: "Card subtitle",
  description: "Brief description",
  quote: "Testimonial quote text",
  name: "Person's name",
  role: "e.g., Parent of Class VIII student",
  date: "e.g., March 2026",
  cta_text: "e.g., Learn More",
  cta_link: "e.g., /admissions",
  icon: "e.g., Monitor, FlaskConical, Laptop, BookOpen",
  link: "e.g., /news/article-slug",
};

interface CardForm {
  title: string;
  subtitle: string;
  description: string;
  quote: string;
  name: string;
  role: string;
  date: string;
  cta_text: string;
  cta_link: string;
  icon: string;
  link: string;
  sort_order: string;
}

const emptyForm: CardForm = {
  title: "",
  subtitle: "",
  description: "",
  quote: "",
  name: "",
  role: "",
  date: "",
  cta_text: "",
  cta_link: "",
  icon: "",
  link: "",
  sort_order: "0",
};

function getCardPrimaryText(card: SectionCard): string {
  switch (card.section) {
    case "testimonials":
      return card.quote ? `"${card.quote.slice(0, 60)}${card.quote.length > 60 ? "..." : ""}"` : "—";
    default:
      return card.title || "—";
  }
}

function getCardSecondaryText(card: SectionCard): string {
  switch (card.section) {
    case "hero_slider":
      return card.subtitle || "";
    case "testimonials":
      return card.name ? `— ${card.name}${card.role ? `, ${card.role}` : ""}` : "";
    case "latest_updates":
      return card.date || "";
    case "facilities_preview":
      return card.description?.slice(0, 60) || "";
    default:
      return "";
  }
}

function SectionCardsManager() {
  const [cards, setCards] = useState<SectionCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState<SectionCard | null>(null);
  const [selectedSection, setSelectedSection] = useState<SectionCardType>("hero_slider");
  const [filterSection, setFilterSection] = useState<string>("all");
  const [file, setFile] = useState<FileList | null>(null);
  const [form, setForm] = useState<CardForm>(emptyForm);

  const fetchCards = useCallback(async () => {
    try {
      const res = await adminFetch("/api/admin/section-cards");
      const data = await res.json();
      if (res.ok) {
        setCards(data.data ?? []);
      }
    } catch {
      toast.error("Failed to load section cards");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  const resetForm = () => {
    setForm(emptyForm);
    setFile(null);
    setEditing(null);
    setSelectedSection("hero_slider");
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (card: SectionCard) => {
    setEditing(card);
    setSelectedSection(card.section);
    setForm({
      title: card.title || "",
      subtitle: card.subtitle || "",
      description: card.description || "",
      quote: card.quote || "",
      name: card.name || "",
      role: card.role || "",
      date: card.date || "",
      cta_text: card.cta_text || "",
      cta_link: card.cta_link || "",
      icon: card.icon || "",
      link: card.link || "",
      sort_order: String(card.sort_order),
    });
    setFile(null);
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    const fieldMap = SECTION_FIELD_MAP[selectedSection];
    for (const field of fieldMap.required) {
      if (!form[field as keyof CardForm]?.trim()) {
        toast.error(`${FIELD_LABELS[field]} is required`);
        return;
      }
    }

    // Require image for non-testimonials when creating
    if (!editing && selectedSection !== "testimonials" && (!file || file.length === 0)) {
      toast.error("Image is required");
      return;
    }

    setSubmitting(true);

    try {
      const formData = new FormData();
      if (file && file.length > 0) {
        formData.append("file", file[0]);
      }
      formData.append("section", selectedSection);

      // Append all text fields
      const allFields = [...fieldMap.required, ...fieldMap.optional, "sort_order"];
      for (const field of allFields) {
        formData.append(field, form[field as keyof CardForm] || "");
      }

      if (editing) {
        formData.append("id", editing.id);
        const res = await adminUpload("/api/admin/section-cards?method=PATCH", formData, "PATCH");
        if (!res.ok) {
          const data = await res.json();
          toast.error(data.error || "Update failed");
          return;
        }
        toast.success("Card updated");
      } else {
        const res = await adminUpload("/api/admin/section-cards", formData);
        if (!res.ok) {
          const data = await res.json();
          toast.error(data.error || "Create failed");
          return;
        }
        toast.success("Card created");
      }

      setDialogOpen(false);
      resetForm();
      await fetchCards();
    } catch {
      toast.error("An error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (card: SectionCard) => {
    if (!confirm(`Delete this ${SECTION_LABELS[card.section] || card.section} card? This cannot be undone.`)) return;

    try {
      const res = await adminDelete("/api/admin/section-cards", { id: card.id });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Delete failed");
        return;
      }
      toast.success("Card deleted");
      await fetchCards();
    } catch {
      toast.error("An unexpected error occurred");
    }
  };

  const handleToggleActive = async (card: SectionCard) => {
    try {
      const res = await adminPatch("/api/admin/section-cards", {
        id: card.id,
        data: { is_active: !card.is_active },
      });
      if (res.ok) {
        toast.success(card.is_active ? "Card deactivated" : "Card activated");
        await fetchCards();
      } else {
        toast.error("Failed to update");
      }
    } catch {
      toast.error("An error occurred");
    }
  };

  const filteredCards = filterSection === "all"
    ? cards
    : cards.filter((c) => c.section === filterSection);

  // Group by section
  const groupedCards = CARD_SECTIONS.reduce<{ section: SectionCardType; label: string; items: SectionCard[] }[]>(
    (acc, sec) => {
      const sectionCards = filteredCards.filter((c) => c.section === sec.value);
      if (sectionCards.length > 0) {
        acc.push({ section: sec.value, label: sec.label, items: sectionCards });
      }
      return acc;
    },
    []
  );

  const visibleFields = [...SECTION_FIELD_MAP[selectedSection].required, ...SECTION_FIELD_MAP[selectedSection].optional];
  const isImageRequired = !editing && selectedSection !== "testimonials";

  return (
    <div className="mt-6">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <Select value={filterSection} onValueChange={(val) => val && setFilterSection(val)}>
            <SelectTrigger className="w-48 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sections</SelectItem>
              {CARD_SECTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-gray-500">{filteredCards.length} card{filteredCards.length !== 1 ? "s" : ""}</span>
        </div>

        <Button
          className="bg-navy-900 hover:bg-navy-800 text-white"
          onClick={openCreate}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Card
        </Button>
      </div>

      {/* Card list */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-border animate-pulse h-24" />
          ))}
        </div>
      ) : filteredCards.length === 0 ? (
        <div className="text-center py-16 text-gray-500 dark:text-gray-400">
          <ImageIcon className="h-10 w-10 mx-auto mb-3 text-gray-300" />
          <p className="text-lg">No section cards yet</p>
          <p className="text-sm mt-1">Click &ldquo;Add Card&rdquo; to create content for your website sections.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedCards.map(({ section, label, items }) => (
            <div key={section}>
              <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                {label}
                <span className="ml-2 text-xs font-normal normal-case text-gray-400">({items.length})</span>
              </h3>
              <div className="space-y-2">
                {items.map((card) => (
                  <div
                    key={card.id}
                    className={cn(
                      "bg-white dark:bg-card rounded-xl border shadow-sm overflow-hidden transition-all",
                      card.is_active
                        ? "border-gray-200 dark:border-border"
                        : "border-gray-200 dark:border-border opacity-60"
                    )}
                  >
                    <div className="flex items-center gap-4 p-4">
                      {/* Thumbnail */}
                      {card.image_url ? (
                        <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 dark:bg-muted shrink-0 relative">
                          <Image
                            src={card.image_url}
                            alt={card.title || "Card image"}
                            fill
                            className="object-cover"
                            sizes="64px"
                          />
                        </div>
                      ) : (
                        <div className="w-16 h-16 rounded-lg bg-gray-100 dark:bg-muted shrink-0 flex items-center justify-center">
                          {card.section === "testimonials" && card.initials ? (
                            <span className="text-lg font-semibold text-navy-900 dark:text-white">{card.initials}</span>
                          ) : (
                            <ImageIcon className="h-5 w-5 text-gray-300" />
                          )}
                        </div>
                      )}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-navy-900 dark:text-white text-sm truncate">
                            {getCardPrimaryText(card)}
                          </p>
                          {!card.is_active && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-gray-400 border-gray-300">
                              Inactive
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                          {getCardSecondaryText(card)}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-1 font-mono">
                          Order: {card.sort_order}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-gray-400 hover:text-navy-900"
                          onClick={() => handleToggleActive(card)}
                          title={card.is_active ? "Deactivate" : "Activate"}
                        >
                          <Check className={cn("h-4 w-4", card.is_active ? "text-green-500" : "text-gray-300")} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-gray-400 hover:text-blue-600"
                          onClick={() => openEdit(card)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-gray-400 hover:text-red-600"
                          onClick={() => handleDelete(card)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); resetForm(); } else { setDialogOpen(true); } }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Card" : "Add Card"}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Section selector */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Section</Label>
              {editing ? (
                <div className="h-9 flex items-center px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-600">
                  {CARD_SECTIONS.find((s) => s.value === selectedSection)?.label}
                </div>
              ) : (
                <Select value={selectedSection} onValueChange={(val) => val && setSelectedSection(val as SectionCardType)}>
                  <SelectTrigger className="w-full h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CARD_SECTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Image upload */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                {selectedSection === "testimonials" ? "Profile Photo (optional)" : "Image"}{" "}
                {isImageRequired && <span className="text-red-500">*</span>}
              </Label>
              {editing?.image_url && !file && (
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 relative">
                    <Image src={editing.image_url} alt="Current" fill className="object-cover" sizes="64px" />
                  </div>
                  <span className="text-xs text-gray-500">Current image (upload new to replace)</span>
                </div>
              )}
              <FileDropZone
                accept="image/*"
                onChange={(fileList) => setFile(fileList)}
                value={file}
                label={selectedSection === "testimonials" ? "Drop profile photo or click to browse" : "Drop image here or click to browse"}
                icon="image"
              />
            </div>

            {/* Dynamic fields */}
            {visibleFields.map((field) => {
              const isRequired = SECTION_FIELD_MAP[selectedSection].required.includes(field);
              const isLongText = field === "quote" || field === "description";
              return (
                <div key={field} className="space-y-1.5">
                  <Label className="text-xs font-medium">
                    {FIELD_LABELS[field]} {isRequired && <span className="text-red-500">*</span>}
                  </Label>
                  {isLongText ? (
                    <textarea
                      className="flex min-h-[80px] w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder={FIELD_PLACEHOLDERS[field]}
                      value={form[field as keyof CardForm]}
                      onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                    />
                  ) : (
                    <Input
                      className="h-9"
                      placeholder={FIELD_PLACEHOLDERS[field]}
                      value={form[field as keyof CardForm]}
                      onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                    />
                  )}
                </div>
              );
            })}

            {/* Sort order */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Sort Order</Label>
              <Input
                type="number"
                className="h-9 w-24"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-navy-900 hover:bg-navy-800 text-white"
              >
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editing ? "Save Changes" : "Add Card"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── Main Page ─── */

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
          <h1 className="font-heading text-2xl font-bold text-navy-900 dark:text-white">
            Site Media
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Manage images and section content across the website.
          </p>
        </div>
      </div>

      <Tabs defaultValue="image-slots">
        <TabsList>
          <TabsTrigger value="image-slots">
            Image Slots
            {customizedCount > 0 && (
              <span className="ml-1.5 inline-flex items-center gap-1 text-green-600 text-[10px]">
                <Check className="h-3 w-3" />
                {customizedCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="section-cards">Section Cards</TabsTrigger>
        </TabsList>

        <TabsContent value="image-slots">
          <div className="mt-6">
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-border animate-pulse h-28"
                  />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-20 text-gray-500 dark:text-gray-400">
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
                      className="border border-gray-200 dark:border-border rounded-2xl overflow-hidden"
                    >
                      <button
                        onClick={() => togglePage(page)}
                        className="w-full flex items-center justify-between p-5 bg-gray-50 dark:bg-muted hover:bg-gray-100 dark:hover:bg-muted transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <h2 className="font-heading text-lg font-semibold text-navy-900 dark:text-white">
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
                            "h-5 w-5 text-gray-400 dark:text-gray-500 transition-transform duration-200",
                            isExpanded && "rotate-180"
                          )}
                        />
                      </button>

                      {isExpanded && (
                        <div className="p-5 space-y-6">
                          {sections.map(({ section, items: sectionItems }) => (
                            <div key={section}>
                              <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
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
        </TabsContent>

        <TabsContent value="section-cards">
          <SectionCardsManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
