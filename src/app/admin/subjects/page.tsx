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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Trash2, Loader2 } from "lucide-react";
import type { Subject } from "@/types";

export default function AdminSubjectsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  const supabase = createClient();

  const fetchSubjects = async () => {
    const { data, error } = await supabase
      .from("subjects")
      .select("*")
      .order("name");

    if (error) {
      toast.error("Failed to fetch subjects");
      return;
    }

    setSubjects((data as Subject[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchSubjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setName("");
    setCode("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Subject name is required");
      return;
    }
    setSubmitting(true);

    const { error } = await supabase.from("subjects").insert({
      name: name.trim(),
      code: code.trim() || null,
      is_active: true,
    });

    if (error) {
      toast.error(error.message || "Failed to create subject");
    } else {
      toast.success("Subject created successfully");
      setDialogOpen(false);
      resetForm();
      await fetchSubjects();
    }

    setSubmitting(false);
  };

  const toggleActive = async (subject: Subject) => {
    const { error } = await supabase
      .from("subjects")
      .update({ is_active: !subject.is_active })
      .eq("id", subject.id);

    if (error) {
      toast.error("Failed to update subject");
      return;
    }

    toast.success(
      subject.is_active ? "Subject deactivated" : "Subject activated"
    );
    await fetchSubjects();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this subject?")) return;

    const { error } = await supabase.from("subjects").delete().eq("id", id);

    if (error) {
      toast.error("Failed to delete subject");
      return;
    }

    toast.success("Subject deleted");
    await fetchSubjects();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl font-bold text-navy-900">
          Subjects
        </h1>
        <Button
          onClick={() => {
            resetForm();
            setDialogOpen(true);
          }}
          className="bg-navy-900 hover:bg-navy-800 text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Subject
        </Button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : subjects.length === 0 ? (
          <p className="text-center py-12 text-gray-500">
            No subjects found. Add one to get started.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subjects.map((subject) => (
                <TableRow key={subject.id}>
                  <TableCell className="font-medium">{subject.name}</TableCell>
                  <TableCell className="text-gray-600">
                    {subject.code || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={
                        subject.is_active
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }
                    >
                      {subject.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-gray-500">
                    {new Date(subject.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleActive(subject)}
                      >
                        {subject.is_active ? "Deactivate" : "Activate"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDelete(subject.id)}
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
      </div>

      {/* Add Subject Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Subject</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="subjectName">Subject Name</Label>
              <Input
                id="subjectName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Mathematics"
                required
              />
            </div>
            <div>
              <Label htmlFor="subjectCode">Code (optional)</Label>
              <Input
                id="subjectCode"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. MATH"
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
                Create Subject
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
