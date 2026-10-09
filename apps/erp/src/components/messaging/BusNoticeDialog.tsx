"use client";

import { useEffect, useState } from "react";
import { Loader2, MessageSquare, Send } from "lucide-react";
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
  BUS_NOTICE_MAX_CHARS,
  renderWhatsAppTemplate,
  sanitizeTemplateParam,
  WHATSAPP_TEMPLATE_SPECS,
} from "@nkps/shared/lib/messaging/templates";
import { toast } from "sonner";
import { WhatsAppPreview, NotConfiguredNotice, formatSentAt } from "./shared";

export interface BusNoticeTarget {
  id: string;
  bus_number: string;
}

interface Preview {
  configured: boolean;
  year: { id: string; name: string } | null;
  riders: number;
  recipients: number;
  unreachable: { id: string; full_name: string }[];
  recent: {
    id: string;
    created_at: string;
    body_text: string | null;
    recipient_count: number;
    sent_count: number;
    failed_count: number;
    skipped_count: number;
    status: string;
    actor_name: string | null;
  }[];
  schoolName: string;
  officePhone: string;
}

/**
 * "Bus 9 is running late" to every family on bus 9.
 *
 * The dialog is handed a bus and asks the server what Send would do before
 * the office types a word: how many families, how many have a number, who
 * does not. The text goes out as a WhatsApp template parameter, so the
 * preview shows the flattened text inside the approved wording — what the
 * office reads here is what the parent receives.
 *
 * The form is keyed on the bus so switching buses remounts it clean.
 */
export function BusNoticeDialog({
  bus,
  onOpenChange,
}: {
  bus: BusNoticeTarget | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={Boolean(bus)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {bus && (
          <BusNoticeForm key={bus.id} bus={bus} onClose={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function BusNoticeForm({ bus, onClose }: { bus: BusNoticeTarget; onClose: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    adminFetch(`/api/messaging/whatsapp/bus-notice?busId=${encodeURIComponent(bus.id)}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) setLoadError(json.error || "Could not load this bus's families.");
        else setPreview(json as Preview);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Could not load this bus's families.");
      });
    return () => {
      cancelled = true;
    };
  }, [bus.id]);

  const flat = sanitizeTemplateParam(message, BUS_NOTICE_MAX_CHARS);
  const rendered = renderWhatsAppTemplate(WHATSAPP_TEMPLATE_SPECS.busNotice, [
    preview?.schoolName ?? "the school",
    bus.bus_number,
    flat || "{{3}}",
    preview?.officePhone ?? "the school office",
  ]);

  const canSend =
    Boolean(preview?.configured) && flat.length > 0 && (preview?.recipients ?? 0) > 0 && !sending;

  async function send() {
    if (!canSend || !preview) return;
    setSending(true);
    try {
      const res = await adminFetch("/api/messaging/whatsapp/bus-notice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ busId: bus.id, message: flat }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || "Could not send the notice.");
        return;
      }
      const sent = Number(json.sent ?? 0);
      const failed = Number(json.failed ?? 0);
      if (sent > 0 && failed === 0) {
        toast.success(`Notice sent to ${sent} ${sent === 1 ? "family" : "families"} on bus ${bus.bus_number}.`);
      } else if (sent > 0) {
        toast.warning(`Sent to ${sent}, failed for ${failed}. The failures are in the message log.`);
      } else {
        toast.error(
          json.firstError
            ? `Nothing was delivered: ${String(json.firstError).slice(0, 120)}`
            : "Nothing was delivered."
        );
      }
      if (sent > 0) onClose();
    } catch {
      toast.error("Could not send the notice.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 shrink-0 rounded-xl bg-blue-100 dark:bg-blue-950/30 flex items-center justify-center">
            <MessageSquare className="h-5 w-5 text-blue-700 dark:text-blue-400" />
          </div>
          <div>
            <DialogTitle>Message parents on bus {bus.bus_number}</DialogTitle>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              One WhatsApp message to every family with a child on this bus.
            </p>
          </div>
        </div>
      </DialogHeader>

      <div className="space-y-4 py-2">
        {loadError ? (
          <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
        ) : !preview ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Working out who is on this bus…
          </div>
        ) : (
          <>
            {!preview.configured && <NotConfiguredNotice />}

            <RecipientSummary preview={preview} />

            <div className="space-y-1">
              <Label className="text-xs font-medium" htmlFor="bus-notice-text">
                Your message *
              </Label>
              <Textarea
                id="bus-notice-text"
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="e.g. The bus is running about 20 minutes late this morning because of road work near the bypass."
                maxLength={BUS_NOTICE_MAX_CHARS}
                disabled={!preview.configured || sending}
              />
              <p className="text-[11px] text-gray-500 dark:text-gray-400 flex justify-between">
                <span>Line breaks are flattened — WhatsApp templates allow one paragraph here.</span>
                <span>
                  {flat.length}/{BUS_NOTICE_MAX_CHARS}
                </span>
              </p>
            </div>

            <WhatsAppPreview text={rendered} />

            {preview.recent.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  Recent notices for this bus
                </p>
                <ul className="space-y-1.5">
                  {preview.recent.map((r) => (
                    <li
                      key={r.id}
                      className="rounded-lg border border-gray-200 dark:border-gray-800 px-3 py-2 text-xs"
                    >
                      <div className="flex flex-wrap justify-between gap-x-3 text-gray-500 dark:text-gray-400">
                        <span>
                          {formatSentAt(r.created_at)}
                          {r.actor_name ? ` · ${r.actor_name}` : ""}
                        </span>
                        <span>
                          {r.sent_count}/{r.recipient_count} sent
                          {r.failed_count > 0 ? `, ${r.failed_count} failed` : ""}
                        </span>
                      </div>
                      {r.body_text && (
                        <p className="mt-1 text-gray-700 dark:text-gray-200 line-clamp-2">
                          {r.body_text}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
          {preview && preview.recipients > 0
            ? `Send to ${preview.recipients} ${preview.recipients === 1 ? "family" : "families"}`
            : "Send"}
        </Button>
      </DialogFooter>
    </>
  );
}

function RecipientSummary({ preview }: { preview: Preview }) {
  if (preview.riders === 0) {
    return (
      <p className="text-sm text-amber-700 dark:text-amber-400">
        No active students are assigned to this bus
        {preview.year ? ` for ${preview.year.name}` : ""}. Assign them under Transport →
        Student Assignments first.
      </p>
    );
  }
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-gray-900/40 px-3 py-2 text-sm space-y-1">
      <p className="text-gray-700 dark:text-gray-200">
        <span className="font-medium">{preview.riders}</span>{" "}
        {preview.riders === 1 ? "student rides" : "students ride"} this bus
        {preview.year ? ` (${preview.year.name})` : ""}.{" "}
        <span className="font-medium">{preview.recipients}</span>{" "}
        {preview.recipients === 1 ? "family will" : "families will"} be messaged
        {preview.recipients < preview.riders - preview.unreachable.length
          ? " — siblings share one message"
          : ""}
        .
      </p>
      {preview.unreachable.length > 0 && (
        <p className="text-amber-700 dark:text-amber-400">
          No mobile number on file for{" "}
          {preview.unreachable
            .slice(0, 5)
            .map((u) => u.full_name || "an unnamed student")
            .join(", ")}
          {preview.unreachable.length > 5 ? ` and ${preview.unreachable.length - 5} more` : ""}
          . Fix it under People → Students; they will not get this notice.
        </p>
      )}
    </div>
  );
}
