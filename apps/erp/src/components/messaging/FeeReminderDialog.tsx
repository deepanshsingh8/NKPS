"use client";

import { useEffect, useState } from "react";
import { IndianRupee, Loader2, Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@nkps/shared/components/ui/dialog";
import { Button } from "@nkps/shared/components/ui/button";
import { Label } from "@nkps/shared/components/ui/label";
import { Textarea } from "@nkps/shared/components/ui/textarea";
import { adminFetch } from "@nkps/shared/lib/admin-api";
import {
  FEE_REMINDER_DEFAULT_NOTE,
  FEE_REMINDER_NOTE_MAX_CHARS,
  formatRupeesForMessage,
  renderWhatsAppTemplate,
  sanitizeTemplateParam,
  WHATSAPP_TEMPLATE_SPECS,
} from "@nkps/shared/lib/messaging/templates";
import { toast } from "sonner";
import { WhatsAppPreview, NotConfiguredNotice, formatSentAt } from "./shared";

export interface FeeReminderTarget {
  id: string;
  full_name: string;
}

interface Preview {
  configured: boolean;
  student: {
    id: string;
    full_name: string | null;
    admission_no: string | null;
    class_label: string;
  };
  contact: { type: string; label: string; last4: string } | null;
  dues: { total: number; lateFee: number; billedToDate: number; paid: number } | null;
  session: string | null;
  lastReminderAt: string | null;
  schoolName: string;
  officePhone: string;
}

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

/**
 * One tap, one family, the amount they owe today.
 *
 * The amount is never typed and never sent from the browser: the server
 * prices the student the way the Dues register does and quotes that. The
 * dialog shows the figure, who will receive it (relation and last four
 * digits — never the number), and the exact text, and takes an optional note.
 */
export function FeeReminderDialog({
  student,
  onOpenChange,
  onSent,
}: {
  student: FeeReminderTarget | null;
  onOpenChange: (open: boolean) => void;
  /** Fired after a successful send, so a list can refresh its "last reminded" state. */
  onSent?: (studentId: string) => void;
}) {
  return (
    <Dialog open={Boolean(student)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {student && (
          <FeeReminderForm
            key={student.id}
            student={student}
            onClose={() => onOpenChange(false)}
            onSent={onSent}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function FeeReminderForm({
  student,
  onClose,
  onSent,
}: {
  student: FeeReminderTarget;
  onClose: () => void;
  onSent?: (studentId: string) => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    adminFetch(
      `/api/messaging/whatsapp/fee-reminder?studentId=${encodeURIComponent(student.id)}`
    )
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) setLoadError(json.error || "Could not load this student's dues.");
        else setPreview(json as Preview);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Could not load this student's dues.");
      });
    return () => {
      cancelled = true;
    };
  }, [student.id]);

  const flatNote = sanitizeTemplateParam(note, FEE_REMINDER_NOTE_MAX_CHARS);
  const amount = preview?.dues?.total ?? 0;
  const rendered = renderWhatsAppTemplate(WHATSAPP_TEMPLATE_SPECS.feeReminder, [
    preview?.schoolName ?? "the school",
    formatRupeesForMessage(amount),
    preview?.student.full_name || student.full_name,
    preview?.student.class_label || "class not recorded",
    preview?.session ?? "the current session",
    flatNote || FEE_REMINDER_DEFAULT_NOTE,
    preview?.officePhone ?? "the school office",
  ]);

  const alreadyToday = Boolean(preview?.lastReminderAt);
  const canSend =
    Boolean(preview?.configured) &&
    Boolean(preview?.contact) &&
    amount >= 1 &&
    !alreadyToday &&
    !sending;

  async function send() {
    if (!canSend) return;
    setSending(true);
    try {
      const res = await adminFetch("/api/messaging/whatsapp/fee-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: student.id, note: flatNote }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || "Could not send the reminder.");
        return;
      }
      if (json.ok) {
        toast.success(
          `Reminder for ${inr(Number(json.amount ?? amount))} sent to ${json.contact?.label ?? "the parent"} (…${json.contact?.last4 ?? ""}).`
        );
        onSent?.(student.id);
        onClose();
      } else {
        toast.error(
          json.firstError
            ? `Not delivered: ${String(json.firstError).slice(0, 120)}`
            : "Not delivered."
        );
      }
    } catch {
      toast.error("Could not send the reminder.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 shrink-0 rounded-xl bg-blue-100 dark:bg-blue-950/30 flex items-center justify-center">
            <IndianRupee className="h-5 w-5 text-blue-700 dark:text-blue-400" />
          </div>
          <div>
            <DialogTitle>Send fee reminder</DialogTitle>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {preview?.student.full_name || student.full_name}
              {preview?.student.admission_no ? ` · ${preview.student.admission_no}` : ""}
              {preview?.student.class_label ? ` · ${preview.student.class_label}` : ""}
            </p>
          </div>
        </div>
      </DialogHeader>

      <div className="space-y-4 py-2">
        {loadError ? (
          <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
        ) : !preview ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Working out what is owed…
          </div>
        ) : (
          <>
            {!preview.configured && <NotConfiguredNotice />}

            <div className="rounded-lg bg-gray-50 dark:bg-gray-900/40 px-3 py-2 text-sm space-y-1">
              {preview.dues && amount >= 1 ? (
                <p className="text-gray-700 dark:text-gray-200">
                  Pending today:{" "}
                  <span className="font-semibold text-red-600 dark:text-red-400">
                    {inr(amount)}
                  </span>
                  {preview.dues.lateFee > 0
                    ? ` (includes ${inr(preview.dues.lateFee)} late fee)`
                    : ""}
                  {preview.session ? ` · ${preview.session}` : ""}
                </p>
              ) : (
                <p className="text-green-700 dark:text-green-400">
                  Nothing is pending for this student today, so there is nothing to remind
                  about.
                </p>
              )}
              {preview.contact ? (
                <p className="text-gray-600 dark:text-gray-300">
                  Goes to the {preview.contact.label.toLowerCase()}&apos;s WhatsApp (number
                  ending {preview.contact.last4}).
                </p>
              ) : (
                <p className="text-amber-700 dark:text-amber-400">
                  No father, mother or guardian mobile is on file. Add one under People →
                  Students first.
                </p>
              )}
              {alreadyToday && preview.lastReminderAt && (
                <p className="text-amber-700 dark:text-amber-400">
                  A reminder already went to this family on{" "}
                  {formatSentAt(preview.lastReminderAt)}. One per day keeps it a reminder,
                  not a nag.
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium" htmlFor="fee-reminder-note">
                Note (optional)
              </Label>
              <Textarea
                id="fee-reminder-note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={FEE_REMINDER_DEFAULT_NOTE}
                maxLength={FEE_REMINDER_NOTE_MAX_CHARS}
                disabled={!preview.configured || sending}
              />
              <p className="text-[11px] text-gray-500 dark:text-gray-400 flex justify-between">
                <span>Replaces the standard closing line. Line breaks are flattened.</span>
                <span>
                  {flatNote.length}/{FEE_REMINDER_NOTE_MAX_CHARS}
                </span>
              </p>
            </div>

            <WhatsAppPreview text={rendered} />
          </>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={sending}>
          Cancel
        </Button>
        <Button onClick={send} disabled={!canSend}>
          {sending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Send className="h-4 w-4 mr-2" />
          )}
          Send reminder
        </Button>
      </DialogFooter>
    </>
  );
}
