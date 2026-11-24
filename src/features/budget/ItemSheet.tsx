"use client";

import { useState } from "react";
import { toast } from "sonner";
import { MoneyInput } from "@/components/MoneyInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Field } from "@/features/decisions/form-bits";
import { addItemAction, updateItemAction } from "./actions";
import { formatConflictValue, ITEM_FIELD_LABELS } from "./field-labels";
import {
  DESCRIPTION_MAX,
  ITEM_STATUSES,
  itemToFormValues,
  parseItemForm,
  STATUS_LABELS,
  type FormErrors,
  type ItemFormField,
  type ItemFormValues,
} from "./model";
import type { ItemInput, ItemView, VersionedResult } from "./types";
import { useConflict } from "./use-conflict";

function sameItem(item: ItemView, input: ItemInput): boolean {
  return (
    item.description === input.description &&
    item.status === input.status &&
    item.plannedCents === input.plannedCents &&
    item.agreedCents === input.agreedCents
  );
}

/**
 * Add or edit an item of a category (AC35): description, status (Previsto / Concordato /
 * Annullata), planned amount and, once the price is fixed, the agreed amount. Editing uses
 * optimistic concurrency (AC40). Mount with `key` so the fields start from the right values.
 */
export function ItemSheet({
  open,
  onOpenChange,
  categoryId,
  item,
  partnerName,
  onStale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  /** `null` to add a new one. */
  item: ItemView | null;
  partnerName: string;
  onStale: () => void;
}) {
  const [values, setValues] = useState<ItemFormValues>(itemToFormValues(item));
  const [errors, setErrors] = useState<FormErrors<ItemFormField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const setField = <K extends ItemFormField>(field: K, value: ItemFormValues[K]) =>
    setValues((current) => ({ ...current, [field]: value }));

  function finish(result: VersionedResult) {
    if (result.ok) {
      toast("Voce salvata.");
      onOpenChange(false);
    } else {
      setFormError(result.message);
    }
  }

  const conflict = useConflict({
    labels: ITEM_FIELD_LABELS,
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
    const parsed = parseItemForm(values);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});

    if (!item) {
      setPending(true);
      const added = await addItemAction({ categoryId, item: parsed.input });
      setPending(false);
      if (!added.ok) {
        setFormError(added.message);
        return;
      }
      toast("Voce aggiunta.");
      onOpenChange(false);
      return;
    }

    if (sameItem(item, parsed.input)) {
      onOpenChange(false);
      return;
    }
    const send = (version: number) =>
      updateItemAction({ itemId: item.id, version, item: parsed.input });
    setPending(true);
    const result = await send(item.version);
    setPending(false);
    if (conflict.handle(result, { ...parsed.input }, send)) return;
    finish(result);
  }

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto md:mx-auto md:max-w-lg">
          <SheetHeader>
            <SheetTitle>{item ? "Modifica la voce" : "Aggiungi una voce"}</SheetTitle>
            <SheetDescription>
              Parti dal previsto: quando fissate il prezzo, passa a Concordato e scrivi
              l&apos;importo.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            {Object.keys(errors).length > 0 ? (
              <p role="alert" className="text-destructive text-base">
                Controlla i campi segnati: ce n&apos;è almeno uno da sistemare.
              </p>
            ) : null}

            <Field label="Descrizione" error={errors.description}>
              {(control) => (
                <Input
                  {...control}
                  value={values.description}
                  maxLength={DESCRIPTION_MAX}
                  required
                  aria-required="true"
                  onChange={(event) => setField("description", event.target.value)}
                />
              )}
            </Field>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-base leading-6 font-semibold">Stato</legend>
              <RadioGroup
                value={values.status}
                onValueChange={(status) => setField("status", status as ItemFormValues["status"])}
              >
                {ITEM_STATUSES.map((status) => (
                  <div key={status} className="flex min-h-11 items-center gap-2">
                    <RadioGroupItem value={status} id={`status-${status}`} />
                    <Label htmlFor={`status-${status}`}>{STATUS_LABELS[status]}</Label>
                  </div>
                ))}
              </RadioGroup>
            </fieldset>

            <MoneyInput
              label="Importo previsto"
              value={values.plannedText}
              onValueChange={(text) => setField("plannedText", text)}
              hint="Se non lo sai ancora, lascia vuoto."
              {...(errors.plannedText ? { error: errors.plannedText } : {})}
            />
            {values.status === "agreed" ? (
              <MoneyInput
                label="Importo concordato"
                value={values.agreedText}
                onValueChange={(text) => setField("agreedText", text)}
                hint="Il prezzo fissato. Finché è vuoto conta € 0."
                {...(errors.agreedText ? { error: errors.agreedText } : {})}
              />
            ) : null}

            {formError ? (
              <p role="alert" className="text-destructive text-base">
                {formError}
              </p>
            ) : null}

            <SheetFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Un attimo…" : item ? "Salva" : "Aggiungi"}
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
