"use client";

import { useEffect, useState } from "react";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Search, Copy, UserPlus, ShieldCheck, Users } from "lucide-react";
import { adminFetch } from "@/lib/admin-api";
import type { Profile, UserRole } from "@/types";

const ROLES: UserRole[] = ["admin", "teacher", "student"];

const roleBadgeColors: Record<UserRole, string> = {
  admin: "bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400",
  teacher: "bg-blue-100 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400",
  student: "bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400",
};

export default function AdminUsersPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  // Form state
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<UserRole>("student");
  const [password, setPassword] = useState("");
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);

  const supabase = createClient();

  const fetchProfiles = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to fetch users");
      return;
    }

    setProfiles((data as Profile[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredProfiles = profiles.filter((p) => {
    const matchesTab =
      activeTab === "all" || p.role === activeTab;
    const matchesSearch =
      !search ||
      p.full_name.toLowerCase().includes(search.toLowerCase()) ||
      p.email.toLowerCase().includes(search.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const resetForm = () => {
    setFullName("");
    setEmail("");
    setPhone("");
    setRole("student");
    setPassword("");
    setGeneratedPassword(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const res = await fetch("/api/erp/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          email,
          phone: phone || undefined,
          role,
          password: password || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to create user");
        setSubmitting(false);
        return;
      }

      toast.success("User created successfully");
      setGeneratedPassword(data.generated_password);
      await fetchProfiles();
    } catch {
      toast.error("Failed to create user");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (profile: Profile) => {
    const newStatus = !profile.is_active;
    const { error } = await supabase
      .from("profiles")
      .update({ is_active: newStatus })
      .eq("id", profile.id);

    if (error) {
      toast.error("Failed to update user status");
      return;
    }

    toast.success(
      newStatus ? "User activated" : "User deactivated"
    );
    await fetchProfiles();
  };

  const handleDelete = async (profile: Profile) => {
    if (!confirm(`Delete ${profile.full_name}? This removes their login and all profile data. This cannot be undone.`)) return;

    try {
      const res = await adminFetch("/api/erp/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: profile.id }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to delete user");
        return;
      }

      toast.success("User deleted");
      await fetchProfiles();
    } catch {
      toast.error("Failed to delete user");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-navy-900 flex items-center justify-center">
            <Users className="h-4.5 w-4.5 text-gold-400" />
          </div>
          <div>
            <h1 className="erp-page-title">Users</h1>
            <p className="erp-page-subtitle">Manage admin, teacher, and student accounts</p>
          </div>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setDialogOpen(true);
          }}
          className="bg-navy-900 hover:bg-navy-800 text-white shadow-sm"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add User
        </Button>
      </div>

      <div className="erp-table-container p-6">
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-10 border-gray-200 dark:border-border focus:border-navy-900 focus:ring-navy-900/20"
            />
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList variant="line" className="mb-4">
            <TabsTrigger value="all">
              All ({profiles.length})
            </TabsTrigger>
            <TabsTrigger value="admin">
              Admins ({profiles.filter((p) => p.role === "admin").length})
            </TabsTrigger>
            <TabsTrigger value="teacher">
              Teachers ({profiles.filter((p) => p.role === "teacher").length})
            </TabsTrigger>
            <TabsTrigger value="student">
              Students ({profiles.filter((p) => p.role === "student").length})
            </TabsTrigger>
          </TabsList>

          {["all", "admin", "teacher", "student"].map((tab) => (
            <TabsContent key={tab} value={tab}>
              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400 dark:text-gray-500" />
                </div>
              ) : filteredProfiles.length === 0 ? (
                <p className="text-center py-12 text-gray-500 dark:text-gray-400">
                  No users found.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProfiles.map((profile) => (
                      <TableRow key={profile.id}>
                        <TableCell className="font-medium">
                          {profile.full_name}
                        </TableCell>
                        <TableCell className="text-gray-600 dark:text-gray-300">
                          {profile.email}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={roleBadgeColors[profile.role]}
                          >
                            {profile.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={
                              profile.is_active
                                ? "bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400"
                                : "bg-gray-100 dark:bg-muted text-gray-500 dark:text-gray-400"
                            }
                          >
                            {profile.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-gray-500 dark:text-gray-400">
                          {new Date(profile.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeactivate(profile)}
                            >
                              {profile.is_active ? "Deactivate" : "Activate"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handleDelete(profile)}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
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
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* Add User Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          {generatedPassword ? (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-green-100 dark:bg-green-950/30 flex items-center justify-center">
                    <ShieldCheck className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <DialogTitle>User Created Successfully</DialogTitle>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Save the temporary password below</p>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4">
                <div className="flex items-center gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 p-4">
                  <code className="flex-1 text-sm font-mono font-semibold text-navy-900 dark:text-white">
                    {generatedPassword}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => {
                      navigator.clipboard.writeText(generatedPassword);
                      toast.success("Password copied");
                    }}
                    className="text-amber-700 hover:bg-amber-100"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  The user will be asked to set their own password on first login.
                </p>
                <DialogFooter>
                  <Button
                    onClick={() => {
                      resetForm();
                      setDialogOpen(false);
                    }}
                    className="bg-navy-900 hover:bg-navy-800 text-white"
                  >
                    Done
                  </Button>
                </DialogFooter>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-navy-900 flex items-center justify-center">
                    <UserPlus className="h-5 w-5 text-gold-400" />
                  </div>
                  <div>
                    <DialogTitle>Add New User</DialogTitle>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Create a new account for the ERP portal</p>
                  </div>
                </div>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="erp-form-group">
                    <Label htmlFor="fullName">Full Name</Label>
                    <Input
                      id="fullName"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Enter full name"
                      required
                      className="h-10"
                    />
                  </div>
                  <div className="erp-form-group">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="user@example.com"
                      required
                      className="h-10"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="erp-form-group">
                    <Label htmlFor="phone">Phone (optional)</Label>
                    <Input
                      id="phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Phone number"
                      className="h-10"
                    />
                  </div>
                  <div className="erp-form-group">
                    <Label>Role</Label>
                    <Select value={role} onValueChange={(val) => val && setRole(val as UserRole)}>
                      <SelectTrigger className="w-full h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {r.charAt(0).toUpperCase() + r.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="erp-form-group">
                  <Label htmlFor="password">
                    Password (leave blank to auto-generate)
                  </Label>
                  <Input
                    id="password"
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Auto-generated if empty"
                    className="h-10"
                  />
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
                    Create User
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
