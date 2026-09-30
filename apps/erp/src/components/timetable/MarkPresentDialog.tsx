"use client";

import { useState } from "react";
import { adminDelete } from "@nkps/shared/lib/admin-api";
import { Button } from "@nkps/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@nkps/shared/components/ui/dialog";
import { Loader2, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { formatLongDate, halfDayLabel, type HalfDay } from "@/lib/timetable-week";

export interface AbsenceToClear {
  id: string;
  teacherName: string;
  date: string;
  halfDay: HalfDay;
  /** Substitutes already assigned against it — they go with it. */
  coverCount: number;
}

interface Props {
  absence: AbsenceToClear | null;
  onOpenChange: (open: boolean) => void;
  onCleared: (absenceId: string) => void;
}

// Undoing an absence. An absence marked by mistake used to be permanent unless
// the teacher happened to have no periods that day — the only place a remove
// button appeared. It deletes the row; substitutions cascade with it (FK ON
// DELETE CASCADE), which is why the count is spelled out before confirming.
export function MarkPresentDialog({ absence, onOpenChange, onCleared }: Props) {
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!absence) return;
    setSubmitting(true);
    const res = await adminDelete(`/api/teacher-absences/${absence.id}`, {});
    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "Failed to remove the absence");
      return;
    }
    toast.success(`${absence.teacherName} marked present`);
    onCleared(absence.id);
  };

  return (
    <Dialog open={absence !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark {absence?.teacherName} present?</DialogTitle>
          <DialogDescription>
            {absence && (
              <>
                Removes the absence on {formatLongDate(absence.date)} (
                {halfDayLabel(absence.halfDay).toLowerCase()}).
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        {absence && absence.coverCount > 0 && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
            {absence.coverCount === 1
              ? "1 substitute assignment"
              : `${absence.coverCount} substitute assignments`}{" "}
            for that day will be removed too. Let the covering teachers know.
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={submitting}>
            {submitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <UserCheck className="h-4 w-4 mr-2" />
            )}
            Mark present
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
