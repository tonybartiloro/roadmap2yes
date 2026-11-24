"use client";

import { useState } from "react";
import { toast } from "sonner";
import { TriangleAlert } from "lucide-react";
import { MoneyInput } from "@/components/MoneyInput";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { totalReducedWarning } from "@/domain/budget";
import { Field, Textarea } from "@/features/decisions/form-bits";
import { formatCents, type Cents } from "@/lib/money";
import { setTotalAction } from "./actions";
import { parseTotalForm, REASON_MAX, type FormErrors } from "./model";

/**
 * Sets or changes the budget total (AC33): every save adds a version (amount, author, date,
 * optional reason), nothing is overwritten. Lowering the total below the Concordato is allowed: a
 * warm, non-blocking notice appears as soon as the amount says so.
 */
export function TotalSheet({
  open,
  onOpenChange,
  currentTotal,
  agreed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTotal: Cents | null;
  /** Concordato of the whole budget, for the "below Concordato" notice. */
  agreed: Cents;
}) {
  const [totalText, setTotalText] = useState(
    currentTotal === null ? "" : formatCents(currentTotal),
  );
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<FormErrors<"totalText" | "reason">>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const preview = parseTotalForm({ totalText, reason: "" });
  const reduced = preview.ok ? totalReducedWarning(preview.input.totalCents, agreed) : null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    const parsed = parseTotalForm({ totalText, reason });
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    if (parsed.input.totalCents === currentTotal) {
      onOpenChange(false);
      return;
    }
    setPending(true);
    const result = await setTotalAction(parsed.input);
    setPending(false);
    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    toast("Budget aggiornato. La versione precedente resta nello storico.");
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <SheetContent side="bottom" className="md:mx-auto md:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            {currentTotal === null ? "Imposta il budget" : "Modifica il budget"}
          </SheetTitle>
          <SheetDescription>
            Una cifra indicativa va bene: potrai cambiarla. Ogni modifica resta nello storico.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <MoneyInput
            label="Budget totale"
            value={totalText}
            onValueChange={(text) => setTotalText(text)}
            {...(errors.totalText ? { error: errors.totalText } : {})}
          />

          {reduced ? (
            <p
              role="status"
              data-testid="total-reduced-warning"
              className="border-border bg-card border-l-warning flex items-start gap-3 rounded-md border border-l-4 p-3"
            >
              <TriangleAlert aria-hidden className="text-warning mt-0.5 size-5 shrink-0" />
              <span>{reduced.message} Puoi salvare lo stesso: è solo un promemoria.</span>
            </p>
          ) : null}

          <Field
            label="Motivo (facoltativo)"
            hint="Ti aiuta a ricordare perché l'avete cambiato."
            error={errors.reason}
          >
            {(control) => (
              <Textarea
                {...control}
                value={reason}
                maxLength={REASON_MAX}
                className="min-h-20"
                onChange={(event) => setReason(event.target.value)}
              />
            )}
          </Field>

          {formError ? (
            <p role="alert" className="text-destructive text-base">
              {formError}
            </p>
          ) : null}

          <SheetFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Un attimo…" : "Salva"}
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
  );
}
