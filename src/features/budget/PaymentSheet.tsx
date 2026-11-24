"use client";

import { useState } from "react";
import { toast } from "sonner";
import { TriangleAlert } from "lucide-react";
import { DateField } from "@/components/DateField";
import { MoneyInput } from "@/components/MoneyInput";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { itemOverpaidMessage } from "@/domain/budget";
import type { PlainDate } from "@/lib/dates/plain-date";
import { addPaymentAction, updatePaymentAction } from "./actions";
import { formatConflictValue, PAYMENT_FIELD_LABELS } from "./field-labels";
import {
  KIND_LABELS,
  parsePaymentForm,
  paymentToFormValues,
  PAYMENT_KINDS,
  type FormErrors,
  type PaymentFormField,
  type PaymentFormValues,
} from "./model";
import type { ItemView, PaymentInput, PaymentView, VersionedResult } from "./types";
import { useConflict } from "./use-conflict";

function samePayment(payment: PaymentView, input: PaymentInput): boolean {
  return (
    payment.kind === input.kind &&
    payment.amountCents === input.amountCents &&
    payment.dueDate === input.dueDate &&
    payment.paid === input.paid &&
    (payment.paidOn ?? null) === input.paidOn
  );
}

/**
 * Register or edit a payment of an agreed item (AC36): acconto / saldo / altro, amount, due date,
 * paid or still to pay, payment date. Paying more than the Concordato asks for a confirmation
 * (plan §6), it never blocks. Editing uses optimistic concurrency (AC40).
 */
export function PaymentSheet({
  open,
  onOpenChange,
  item,
  payment,
  siblings,
  today,
  partnerName,
  onStale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ItemView;
  /** `null` to register a new one. */
  payment: PaymentView | null;
  /** All the live payments of this item (the edited one included). */
  siblings: readonly PaymentView[];
  today: PlainDate;
  partnerName: string;
  onStale: () => void;
}) {
  const [values, setValues] = useState<PaymentFormValues>(paymentToFormValues(payment, today));
  const [errors, setErrors] = useState<FormErrors<PaymentFormField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const setField = <K extends PaymentFormField>(field: K, value: PaymentFormValues[K]) =>
    setValues((current) => ({ ...current, [field]: value }));

  const preview = parsePaymentForm(values);
  const paidOthers = siblings
    .filter((p) => p.paid && p.id !== payment?.id)
    .reduce((sum, p) => sum + p.amountCents, 0);
  const paidAfter = paidOthers + (preview.ok && preview.input.paid ? preview.input.amountCents : 0);
  const overCents = Math.max(0, paidAfter - (item.agreedCents ?? 0));

  function finish(result: VersionedResult) {
    if (result.ok) {
      toast("Pagamento salvato.");
      onOpenChange(false);
    } else {
      setFormError(result.message);
    }
  }

  const conflict = useConflict({
    labels: PAYMENT_FIELD_LABELS,
    formatValue: formatConflictValue,
    partnerName,
    onResolved: finish,
    onCancel: () => {
      onOpenChange(false);
      onStale();
    },
  });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    const parsed = parsePaymentForm(values);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});

    if (!payment) {
      setPending(true);
      const added = await addPaymentAction({ itemId: item.id, payment: parsed.input });
      setPending(false);
      if (!added.ok) {
        setFormError(added.message);
        return;
      }
      toast("Pagamento registrato.");
      onOpenChange(false);
      return;
    }

    if (samePayment(payment, parsed.input)) {
      onOpenChange(false);
      return;
    }
    const send = (version: number) =>
      updatePaymentAction({ paymentId: payment.id, version, payment: parsed.input });
    setPending(true);
    const result = await send(payment.version);
    setPending(false);
    if (conflict.handle(result, { ...parsed.input }, send)) return;
    finish(result);
  }

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto md:mx-auto md:max-w-lg">
          <SheetHeader>
            <SheetTitle>{payment ? "Modifica il pagamento" : "Registra un pagamento"}</SheetTitle>
            <SheetDescription>«{item.description}»</SheetDescription>
          </SheetHeader>

          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            {Object.keys(errors).length > 0 ? (
              <p role="alert" className="text-destructive text-base">
                Controlla i campi segnati: ce n&apos;è almeno uno da sistemare.
              </p>
            ) : null}

            <fieldset className="flex flex-col gap-2">
              <legend className="text-base leading-6 font-semibold">Che pagamento è?</legend>
              <RadioGroup
                value={values.kind}
                onValueChange={(kind) => setField("kind", kind as PaymentFormValues["kind"])}
                className="grid-cols-3"
              >
                {PAYMENT_KINDS.map((kind) => (
                  <div key={kind} className="flex min-h-11 items-center gap-2">
                    <RadioGroupItem value={kind} id={`kind-${kind}`} />
                    <Label htmlFor={`kind-${kind}`}>{KIND_LABELS[kind]}</Label>
                  </div>
                ))}
              </RadioGroup>
            </fieldset>

            <MoneyInput
              label="Importo"
              value={values.amountText}
              onValueChange={(text) => setField("amountText", text)}
              {...(errors.amountText ? { error: errors.amountText } : {})}
            />

            <DateField
              label="Scadenza (facoltativa)"
              value={values.dueDate}
              onChange={(dueDate) => setField("dueDate", dueDate)}
              {...(errors.dueDate ? { error: errors.dueDate } : {})}
            />

            <label className="flex min-h-11 items-center gap-3">
              <Checkbox
                checked={values.paid}
                onCheckedChange={(checked) => setField("paid", checked === true)}
              />
              <span>Già pagato</span>
            </label>

            {values.paid ? (
              <DateField
                label="Data del pagamento"
                value={values.paidOn}
                onChange={(paidOn) => setField("paidOn", paidOn)}
                {...(errors.paidOn ? { error: errors.paidOn } : {})}
              />
            ) : null}

            {overCents > 0 ? (
              <p
                role="status"
                data-testid="overpaid-warning"
                className="border-border bg-card border-l-warning flex items-start gap-3 rounded-md border border-l-4 p-3"
              >
                <TriangleAlert aria-hidden className="text-warning mt-0.5 size-5 shrink-0" />
                <span>
                  {itemOverpaidMessage(item.description, overCents)} Se è giusto, conferma.
                </span>
              </p>
            ) : null}

            {formError ? (
              <p role="alert" className="text-destructive text-base">
                {formError}
              </p>
            ) : null}

            <SheetFooter>
              <Button type="submit" disabled={pending}>
                {pending
                  ? "Un attimo…"
                  : overCents > 0
                    ? "Registra comunque"
                    : payment
                      ? "Salva"
                      : "Registra"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => onOpenChange(false)}
              >
                Annulla
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
      {conflict.dialog}
    </>
  );
}
