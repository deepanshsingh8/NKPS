"use client";

import { AlertTriangle } from "lucide-react";

/**
 * Bits both WhatsApp dialogs share.
 */

/** The message as the parent will see it: fixed wording and the office's text. */
export function WhatsAppPreview({ text }: { text: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
        What the parent receives
      </p>
      <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-cream-50 dark:bg-gray-900/40 px-3 py-2 text-sm whitespace-pre-wrap text-gray-800 dark:text-gray-100">
        {text}
      </div>
      <p className="text-[11px] text-gray-500 dark:text-gray-400">
        The surrounding wording is fixed — WhatsApp approves it in advance. Only
        your text changes.
      </p>
    </div>
  );
}

/** Same degradation as click-to-call: the control stays, and says why it is off. */
export function NotConfiguredNotice() {
  return (
    <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
      <p>
        WhatsApp messaging isn&apos;t set up yet. An admin needs to add the
        school&apos;s WhatsApp Business keys to the ERP and get the message
        templates approved by Meta. Until then nothing can be sent from here.
      </p>
    </div>
  );
}

export function formatSentAt(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}
