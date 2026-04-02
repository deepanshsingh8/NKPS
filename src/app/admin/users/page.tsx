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
import { Plus, Trash2, Loader2, Search, Copy } from "lucide-react";
import type { Profile, UserRole } from "@/types";

const ROLES: UserRole[] = ["admin", "teacher", "student"];

const roleBadgeColors: Record<UserRole, string> = {
  admin: "bg-red-100 text-red-700",
  teacher: "bg-blue-100 text-blue-700",
  student: "bg-green-100 text-green-700",
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

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this user? This cannot be undone.")) return;

    const { error } = await supabase
      .from("profiles")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Failed to delete user");
      return;
    }

    toast.success("User deleted");
    await fetchProfiles();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl font-bold text-navy-900">
          Users
        </h1>
        <Button
          onClick={() => {
            resetForm();
            setDialogOpen(true);
          }}
          className="bg-navy-900 hover:bg-navy-800 text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add User
        </Button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
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
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : filteredProfiles.length === 0 ? (
                <p className="text-center py-12 text-gray-500">
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
                        <TableCell className="text-gray-600">
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
                                ? "bg-green-100 text-green-700"
                                : "bg-gray-100 text-gray-500"
                            }
                          >
                            {profile.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-gray-500">
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
                              onClick={() => handleDelete(profile.id)}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
          </DialogHeader>

          {generatedPassword ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                User created successfully. Save the password below — it will not be shown again.
              </p>
              <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-3 border border-gray-200">
                <code className="flex-1 text-sm font-mono">
                  {generatedPassword}
                </code>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    navigator.clipboard.writeText(generatedPassword);
                    toast.success("Password copied");
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => {
                    resetForm();
                    setDialogOpen(false);
                  }}
                >
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter full name"
                  required
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                  required
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone (optional)</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Phone number"
                />
              </div>
              <div>
                <Label htmlFor="password">
                  Password (leave blank to auto-generate)
                </Label>
                <Input
                  id="password"
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Auto-generated if empty"
                />
              </div>
              <div>
                <Label>Role</Label>
                <Select value={role} onValueChange={(val) => val && setRole(val as UserRole)}>
                  <SelectTrigger className="w-full">
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
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
