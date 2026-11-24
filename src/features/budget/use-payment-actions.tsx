"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { PlainDate } from "@/lib/dates/plain-date";
import { removePaymentAction, restorePaymentAction, updatePaymentAction } from "./actions";
import { formatConflictValue, PAYMENT_FIELD_LABELS } from "./field-labels";
import { UNDO_MS } from "./model";
import type { PaymentInput, PaymentView } from "./types";
import { useConflict } from "./use-conflict";

/**
 * Quick actions on a payment row ("Segna pagato", delete with Annulla), shared by the summary
 * and the category page. A stale version opens the same conflict dialog as the forms (AC40).
 */
export function usePaymentActions({
  partnerName,
  today,
}: {
  partnerName: string;
  today: PlainDate;
}): {
  markPaid: (payment: PaymentView) => Promise<void>;
  remove: (payment: PaymentView, what: string) => Promise<void>;
  dialog: ReactNode;
} {
  const router = useRouter();
  const conflict = useConflict({
    labels: PAYMENT_FIELD_LABELS,
    formatValue: formatConflictValue,
    partnerName,
    onResolved: (result) => {
      if (result.ok) toast("Pagamento segnato come pagato.");
      else toast.error(result.message);
    },
    onCancel: () => router.refresh(),
  });

  async function markPaid(payment: PaymentView) {
    const input: PaymentInput = {
      kind: payment.kind,
      amountCents: payment.amountCents,
      dueDate: payment.dueDate,
      paid: true,
      paidOn: today,
    };
    const send = (version: number) =>
      updatePaymentAction({ paymentId: payment.id, version, payment: input });
    const result = await send(payment.version);
    if (conflict.handle(result, { ...input }, send)) return;
    if (result.ok) toast("Pagamento segnato come pagato.");
    else toast.error(result.message);
  }

  async function remove(payment: PaymentView, what: string) {
    const result = await removePaymentAction({ paymentId: payment.id, version: payment.version });
    if (!result.ok) {
      toast.error(result.message);
      if (result.code === "conflict") router.refresh();
      return;
    }
    toast(`${what} è stato tolto.`, {
      duration: UNDO_MS,
      action: {
        label: "Annulla",
        onClick: async () => {
          const restored = await restorePaymentAction({
            paymentId: payment.id,
            version: result.data.version,
          });
          if (restored.ok) toast("Pagamento rimesso al suo posto.");
          else toast.error(restored.message);
        },
      },
    });
  }

  return { markPaid, remove, dialog: conflict.dialog };
}
