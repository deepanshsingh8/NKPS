"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
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
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Pencil,
  Loader2,
  Search,
  UserCog,
  Users,
  Upload,
} from "lucide-react";
import { adminFetch, adminPatch, adminDelete } from "@/lib/admin-api";
import { uploadToStorage } from "@/lib/supabase/upload";
import { FileDropZone } from "@/components/shared/FileDropZone";
import { ImageCropper } from "@/components/shared/ImageCropper";
import { StaffBulkUpload } from "@/components/admin/StaffBulkUpload";
import type { StaffMember, StaffCategory } from "@/types";

const CATEGORIES: { value: StaffCategory | "all"; label: string }[] = [
  { value: "all", label: "All Categories" },
  { value: "management", label: "Management" },
  { value: "admin", label: "Administration" },
  { value: "pgt", label: "PGT" },
  { value: "tgt", label: "TGT" },
  { value: "prt", label: "PRT" },
  { value: "motherTeachers", label: "Mother Teachers" },
  { value: "prePrimaryCoordinator", label: "Pre-primary Coordinator" },
  { value: "primaryCoordinator", label: "Primary Coordinator" },
  { value: "middleCoordinator", label: "Middle Coordinator" },
  { value: "seniorCoordinator", label: "Senior Coordinator" },
  { value: "additionalStaff", label: "Additional Staff" },
  { value: "busDriver", label: "Bus Drivers" },
  { value: "peon", label: "Peons" },
];

const CATEGORY_OPTIONS: { value: StaffCategory; label: string }[] = [
  { value: "management", label: "Management" },
  { value: "admin", label: "Administration" },
  { value: "pgt", label: "PGT" },
  { value: "tgt", label: "TGT" },
  { value: "prt", label: "PRT" },
  { value: "motherTeachers", label: "Mother Teachers" },
  { value: "prePrimaryCoordinator", label: "Pre-primary Coordinator" },
  { value: "primaryCoordinator", label: "Primary Coordinator" },
  { value: "middleCoordinator", label: "Middle Coordinator" },
  { value: "seniorCoordinator", label: "Senior Coordinator" },
  { value: "additionalStaff", label: "Additional Staff" },
  { value: "busDriver", label: "Bus Drivers" },
  { value: "peon", label: "Peons" },
];

const categoryBadgeColors: Record<StaffCategory, string> = {
  management: "bg-purple-100 text-purple-700",
  admin: "bg-red-100 text-red-700",
  pgt: "bg-blue-100 text-blue-700",
  tgt: "bg-emerald-100 text-emerald-700",
  prt: "bg-amber-100 text-amber-700",
  motherTeachers: "bg-violet-100 text-violet-700",
  prePrimaryCoordinator: "bg-pink-100 text-pink-700",
  primaryCoordinator: "bg-sky-100 text-sky-700",
  middleCoordinator: "bg-lime-100 text-lime-700",
  seniorCoordinator: "bg-indigo-100 text-indigo-700",
  additionalStaff: "bg-teal-100 text-teal-700",
  busDriver: "bg-orange-100 text-orange-700",
  peon: "bg-gray-100 text-gray-700",
};

const AVATAR_COLORS = [
  "from-navy-800 to-navy-900",
  "from-blue-500 to-blue-700",
  "from-gold-500 to-gold-600",
  "from-emerald-500 to-emerald-700",
  "from-violet-500 to-violet-700",
  "from-rose-500 to-rose-700",
  "from-cyan-500 to-cyan-700",
  "from-amber-500 to-amber-700",
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function AdminStaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<StaffCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<StaffCategory>("pgt");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [address, setAddress] = useState("");
  const [qualifications, setQualifications] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(null);
  const [croppedPreviewUrl, setCroppedPreviewUrl] = useState<string | null>(null);

  // Crop state
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [showCropper, setShowCropper] = useState(false);

  const supabase = createClient();

  const fetchStaff = useCallback(async () => {
    const { data, error } = await supabase
      .from("staff_members")
      .select("*")
      .eq("is_active", true)
      .order("category")
      .order("sort_order")
      .order("name");

    if (error) {
      console.error("Failed to fetch staff:", error);
      toast.error("Failed to load staff members");
    } else {
      setStaff((data as StaffMember[]) || []);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setName("");
    setSubject("");
    setCategory("pgt");
    setEmail("");
    setPhone("");
    setDateOfBirth("");
    setAddress("");
    setQualifications("");
    setPhotoFile(null);
    setExistingPhotoUrl(null);
    if (croppedPreviewUrl) URL.revokeObjectURL(croppedPreviewUrl);
    setCroppedPreviewUrl(null);
    setEditingId(null);
    setRawImageSrc(null);
    setShowCropper(false);
  };

  const handleFileSelected = (files: FileList | File | null) => {
    const file = files instanceof FileList ? files[0] : files;
    if (!file) {
      setPhotoFile(null);
      setRawImageSrc(null);
      setShowCropper(false);
      return;
    }
    // Create object URL and show cropper
    const url = URL.createObjectURL(file);
    setRawImageSrc(url);
    setShowCropper(true);
  };

  const handleCropComplete = (croppedFile: File) => {
    setPhotoFile(croppedFile);
    // Create a stable preview URL for the cropped image
    if (croppedPreviewUrl) URL.revokeObjectURL(croppedPreviewUrl);
    setCroppedPreviewUrl(URL.createObjectURL(croppedFile));
    setShowCropper(false);
    // Clean up the raw image object URL
    if (rawImageSrc) URL.revokeObjectURL(rawImageSrc);
    setRawImageSrc(null);
  };

  const handleCropCancel = () => {
    setShowCropper(false);
    if (rawImageSrc) URL.revokeObjectURL(rawImageSrc);
    setRawImageSrc(null);
  };

  const openAddDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (member: StaffMember) => {
    setEditingId(member.id);
    setName(member.name);
    setSubject(member.subject);
    setCategory(member.category);
    setEmail(member.email || "");
    setPhone(member.phone || "");
    setDateOfBirth(member.date_of_birth || "");
    setAddress(member.address || "");
    setQualifications(member.qualifications || "");
    setPhotoFile(null);
    setExistingPhotoUrl(member.photo_url);
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!name.trim() || !subject.trim()) {
      toast.error("Name and subject/designation are required");
      return;
    }

    setSubmitting(true);
    try {
      let photoUrl = existingPhotoUrl;

      // Upload new photo if selected
      if (photoFile) {
        const ext = photoFile.name.split(".").pop() || "jpg";
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        photoUrl = await uploadToStorage("staff-photos", fileName, photoFile);
      }

      const extraFields = {
        email: email.trim() || null,
        phone: phone.trim() || null,
        date_of_birth: dateOfBirth || null,
        address: address.trim() || null,
        qualifications: qualifications.trim() || null,
      };

      if (editingId) {
        // Update existing
        const res = await adminPatch("/api/staff", {
          id: editingId,
          name: name.trim(),
          subject: subject.trim(),
          category,
          photo_url: photoUrl,
          old_photo_url: photoFile && existingPhotoUrl ? existingPhotoUrl : undefined,
          ...extraFields,
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to update staff member");
        }
        toast.success("Staff member updated");
      } else {
        // Create new
        const currentCount = staff.filter((s) => s.category === category).length;
        const res = await adminFetch("/api/staff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            subject: subject.trim(),
            category,
            photo_url: photoUrl,
            sort_order: currentCount,
            ...extraFields,
          }),
        });

        const resData = await res.json();
        if (!res.ok) {
          throw new Error(resData.error || "Failed to add staff member");
        }
        if (resData.userCreated) {
          toast.success("Staff member added — portal account created & login email sent");
        } else {
          toast.success("Staff member added");
        }
      }

      setDialogOpen(false);
      resetForm();
      fetchStaff();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (member: StaffMember) => {
    if (!confirm(`Remove "${member.name}" from staff? This cannot be undone.`)) {
      return;
    }

    try {
      const res = await adminDelete("/api/staff", {
        id: member.id,
        photo_url: member.photo_url,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete");
      }

      toast.success("Staff member removed");
      fetchStaff();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  // Filter and search
  const filtered = staff.filter((member) => {
    const matchesCategory = filterCategory === "all" || member.category === filterCategory;
    const matchesSearch = member.name.toLowerCase().includes(search.toLowerCase()) ||
      member.subject.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const getCategoryLabel = (cat: StaffCategory) =>
    CATEGORY_OPTIONS.find((c) => c.value === cat)?.label || cat;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <UserCog className="h-6 w-6" />
            Staff Management
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Add, edit, and manage school staff members and their profile photos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setBulkUploadOpen(true)} className="gap-2">
            <Upload className="h-4 w-4" />
            Upload Excel
          </Button>
          <Button onClick={openAddDialog} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Staff
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by name or subject..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={filterCategory}
          onValueChange={(val) => val && setFilterCategory(val as StaffCategory | "all")}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <div className="flex gap-4 text-sm text-gray-500">
        <span>{filtered.length} of {staff.length} staff members</span>
        {filterCategory !== "all" && (
          <button
            onClick={() => setFilterCategory("all")}
            className="text-blue-600 hover:underline"
          >
            Clear filter
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Users className="h-10 w-10 mb-3" />
          <p className="text-sm font-medium">
            {staff.length === 0 ? "No staff members yet" : "No results found"}
          </p>
          <p className="text-xs mt-1">
            {staff.length === 0
              ? "Click 'Add Staff' to get started"
              : "Try adjusting your search or filter"}
          </p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Photo</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Subject / Designation</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    {member.photo_url ? (
                      <div className="w-10 h-10 rounded-full overflow-hidden relative">
                        <Image
                          src={member.photo_url}
                          alt={member.name}
                          fill
                          className="object-cover"
                          sizes="40px"
                        />
                      </div>
                    ) : (
                      <div
                        className={`w-10 h-10 rounded-full bg-gradient-to-br flex items-center justify-center ${getAvatarColor(member.name)}`}
                      >
                        <span className="text-xs font-bold text-white">
                          {getInitials(member.name)}
                        </span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{member.name}</TableCell>
                  <TableCell className="text-gray-500">{member.subject}</TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={categoryBadgeColors[member.category]}
                    >
                      {getCategoryLabel(member.category)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(member)}
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(member)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Staff Member" : "Add Staff Member"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <Input
                placeholder="e.g. Jasvindar Singh Bhatiya"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Subject / Designation *</Label>
              <Input
                placeholder="e.g. Biology, Principal, Mother Teacher"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Category *</Label>
              <Select
                value={category}
                onValueChange={(val) => val && setCategory(val as StaffCategory)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  placeholder="e.g. john@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  placeholder="e.g. +91-9876543210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Date of Birth</Label>
                <Input
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Qualifications</Label>
                <Input
                  placeholder="e.g. M.Sc., B.Ed."
                  value={qualifications}
                  onChange={(e) => setQualifications(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Address</Label>
              <Input
                placeholder="Home address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Profile Photo</Label>

              {/* Show cropper when a raw image is selected */}
              {showCropper && rawImageSrc ? (
                <ImageCropper
                  imageSrc={rawImageSrc}
                  onCropComplete={handleCropComplete}
                  onCancel={handleCropCancel}
                  fileName={`staff-${Date.now()}.jpg`}
                  cropShape="round"
                  aspect={1}
                />
              ) : (
                <>
                  {/* Show cropped preview or existing photo */}
                  {photoFile && croppedPreviewUrl ? (
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-14 h-14 rounded-full overflow-hidden relative border-2 border-green-400">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={croppedPreviewUrl}
                          alt="Cropped preview"
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      </div>
                      <div>
                        <p className="text-xs text-green-600 font-medium">Photo cropped & ready</p>
                        <button
                          type="button"
                          onClick={() => {
                            setPhotoFile(null);
                            if (croppedPreviewUrl) URL.revokeObjectURL(croppedPreviewUrl);
                            setCroppedPreviewUrl(null);
                            setRawImageSrc(null);
                          }}
                          className="text-xs text-gray-500 hover:text-red-500 mt-0.5"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : editingId && existingPhotoUrl ? (
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-12 h-12 rounded-full overflow-hidden relative">
                        <Image
                          src={existingPhotoUrl}
                          alt="Current photo"
                          fill
                          className="object-cover"
                          sizes="48px"
                        />
                      </div>
                      <span className="text-xs text-gray-500">Current photo. Upload a new one to replace.</span>
                    </div>
                  ) : null}

                  <FileDropZone
                    accept="image/*"
                    maxSizeMB={5}
                    onChange={handleFileSelected}
                    value={null}
                    label="Drop photo here or click to browse"
                    hint="JPG, PNG up to 5MB"
                    icon="image"
                  />
                </>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingId ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Upload Dialog */}
      <StaffBulkUpload
        open={bulkUploadOpen}
        onOpenChange={setBulkUploadOpen}
        onSuccess={fetchStaff}
      />
    </div>
  );
}
