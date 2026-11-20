"use client";

import { Input } from "@nkps/shared/components/ui/input";
import { Label } from "@nkps/shared/components/ui/label";

/** The reconciliation details a non-cash payment carries. */
export interface PaymentMethodDetails {
  cheque_number: string;
  cheque_date: string;
  bank_name: string;
  payer_name: string;
  transaction_ref: string;
  payment_provider: string;
}

export const EMPTY_PAYMENT_DETAILS: PaymentMethodDetails = {
  cheque_number: "",
  cheque_date: "",
  bank_name: "",
  payer_name: "",
  transaction_ref: "",
  payment_provider: "",
};

/**
 * The fields a payment method needs — cheque number and bank, a transfer's
 * UTR, an online payment's provider and reference. Shared by Record Payment
 * and Correct Payment so both ask for the same details in the same words;
 * the server checks them with paymentMethodDetailIssues().
 *
 * `idPrefix` keeps the providers <datalist> id unique when both dialogs are
 * mounted on one page.
 */
export function PaymentMethodFields({
  method,
  value,
  onChange,
  idPrefix,
}: {
  method: string;
  value: PaymentMethodDetails;
  onChange: (patch: Partial<PaymentMethodDetails>) => void;
  idPrefix: string;
}) {
  if (method === "cheque") {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-border p-3 space-y-3">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          Cheque details
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Cheque No.</Label>
            <Input
              className="h-9"
              placeholder="e.g. 412309"
              value={value.cheque_number}
              onChange={(e) => onChange({ cheque_number: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Cheque Date</Label>
            <Input
              className="h-9"
              type="date"
              value={value.cheque_date}
              onChange={(e) => onChange({ cheque_date: e.target.value })}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Drawee Bank</Label>
            <Input
              className="h-9"
              placeholder="e.g. SBI"
              value={value.bank_name}
              onChange={(e) => onChange({ bank_name: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Payee Name (optional)</Label>
            <Input
              className="h-9"
              placeholder="As on cheque"
              value={value.payer_name}
              onChange={(e) => onChange({ payer_name: e.target.value })}
            />
          </div>
        </div>
      </div>
    );
  }

  if (method === "bank_transfer") {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-border p-3 space-y-3">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          Bank transfer details
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Originating Bank</Label>
            <Input
              className="h-9"
              placeholder="e.g. HDFC"
              value={value.bank_name}
              onChange={(e) => onChange({ bank_name: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Payer Name (optional)</Label>
            <Input
              className="h-9"
              placeholder="As on transfer"
              value={value.payer_name}
              onChange={(e) => onChange({ payer_name: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Transaction Reference (UTR / NEFT)</Label>
          <Input
            className="h-9"
            placeholder="e.g. SBIN0123456789"
            value={value.transaction_ref}
            onChange={(e) => onChange({ transaction_ref: e.target.value })}
          />
        </div>
      </div>
    );
  }

  if (method === "online" || method === "upi") {
    const listId = `${idPrefix}-payment-providers`;
    return (
      <div className="rounded-xl border border-gray-200 dark:border-border p-3 space-y-3">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          Online payment details
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Provider</Label>
            <Input
              className="h-9"
              placeholder="PhonePe / GPay / Paytm / Razorpay"
              list={listId}
              value={value.payment_provider}
              onChange={(e) => onChange({ payment_provider: e.target.value })}
            />
            <datalist id={listId}>
              <option value="PhonePe" />
              <option value="Google Pay" />
              <option value="Paytm" />
              <option value="BHIM" />
              <option value="Razorpay" />
              <option value="Other" />
            </datalist>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Transaction ID</Label>
            <Input
              className="h-9"
              placeholder="UPI / order id"
              value={value.transaction_ref}
              onChange={(e) => onChange({ transaction_ref: e.target.value })}
            />
          </div>
        </div>
      </div>
    );
  }

  return null;
}
