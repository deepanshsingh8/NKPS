"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@nkps/shared/components/ui/button";
import { saveResponse } from "@nkps/shared/lib/table-export";

/**
 * The fee receipt button on the student and parent portals.
 *
 * It used to `window.open` the API URL. That showed a raw `{"error":…}` tab on
 * any failure, and inside an installed iOS app a `_blank` window leaves the
 * app's cookie jar, so the route saw no session and refused every time. A
 * same-origin fetch carries the cookie from where the user actually is.
 */
export function ReceiptDownloadButton({
  paymentId,
  receiptNumber,
}: {
  paymentId: string;
  receiptNumber: string | null;
}) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const res = await fetch(`/api/fees/receipt?payment_id=${paymentId}`, {
        credentials: "same-origin",
      });
      const failure = await saveResponse(
        res,
        `fee-receipt_${receiptNumber ?? paymentId}.pdf`,
        "Couldn't generate the receipt"
      );
      if (failure) toast.error(failure);
    } catch {
      toast.error("Couldn't download the receipt. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={download}
      disabled={busy}
      title="Download fee receipt"
      aria-label="Download fee receipt"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
    </Button>
  );
}
