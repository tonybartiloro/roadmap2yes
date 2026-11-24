"use client";

import { useState } from "react";
import { toast } from "sonner";
import { MoneyInput } from "@/components/MoneyInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Field } from "@/features/decisions/form-bits";
import { formatCents } from "@/lib/money";
import { addCategoryAction, updateCategoryAction } from "./actions";
import { CATEGORY_FIELD_LABELS, formatConflictValue } from "./field-labels";
import {
  CATEGORY_NAME_MAX,
  parseAssignedForm,
  parseCategoryNameForm,
  type FormErrors,
} from "./model";
import type { CategoryView, VersionedResult } from "./types";
import { useConflict } from "./use-conflict";

/**
 * Add or edit a category: name and Assegnato (a number, never a slider; empty = "non assegnato").
 * Editing uses optimistic concurrency: a newer version opens the conflict dialog (AC40).
 * Mount with `key` so the fields start from the right values.
 */
export function CategorySheet({
  open,
  onOpenChange,
  category,
  partnerName,
  onStale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` to add a new one. */
  category: CategoryView | null;
  partnerName: string;
  /** The other version must be reloaded (conflict cancelled). */
  onStale: () => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [assignedText, setAssignedText] = useState(
    category?.assignedCents != null ? formatCents(category.assignedCents) : "",
  );
  const [errors, setErrors] = useState<FormErrors<"name" | "assignedText">>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function finish(result: VersionedResult) {
    if (result.ok) {
      toast("Categoria salvata.");
      onOpenChange(false);
    } else {
      setFormError(result.message);
    }
  }

  const conflict = useConflict({
    labels: CATEGORY_FIELD_LABELS,
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
    const nameForm = parseCategoryNameForm(name);
    const assignedForm = parseAssignedForm(assignedText);
    if (!nameForm.ok || !assignedForm.ok) {
      setErrors({
        ...(nameForm.ok ? {} : nameForm.errors),
        ...(assignedForm.ok ? {} : assignedForm.errors),
      });
      return;
    }
    setErrors({});
    const { assignedCents } = assignedForm.input;

    if (!category) {
      setPending(true);
      const added = await addCategoryAction({ name: nameForm.input.name, assignedCents });
      setPending(false);
      if (!added.ok) {
        setFormError(added.message);
        return;
      }
      toast("Categoria aggiunta.");
      onOpenChange(false);
      return;
    }

    const patch = {
      ...(nameForm.input.name !== category.name ? { name: nameForm.input.name } : {}),
      ...(assignedCents !== category.assignedCents ? { assignedCents } : {}),
    };
    if (Object.keys(patch).length === 0) {
      onOpenChange(false);
      return;
    }
    const mine = { name: nameForm.input.name, assignedCents };
    const send = (version: number) =>
      updateCategoryAction({ categoryId: category.id, version, ...patch });
    setPending(true);
    const result = await send(category.version);
    setPending(false);
    if (conflict.handle(result, mine, send)) return;
    finish(result);
  }

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
        <SheetContent side="bottom" className="md:mx-auto md:max-w-lg">
          <SheetHeader>
            <SheetTitle>{category ? "Modifica la categoria" : "Aggiungi una categoria"}</SheetTitle>
            <SheetDescription>
              Assegnato è la parte del budget che vuoi dedicare a questa categoria. Se lo lasci
              vuoto resta «non assegnato».
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <Field label="Nome" error={errors.name}>
              {(control) => (
                <Input
                  {...control}
                  value={name}
                  maxLength={CATEGORY_NAME_MAX}
                  required
                  aria-required="true"
                  onChange={(event) => setName(event.target.value)}
                />
              )}
            </Field>
            <MoneyInput
              label="Assegnato (facoltativo)"
              value={assignedText}
              onValueChange={(text) => setAssignedText(text)}
              {...(errors.assignedText ? { error: errors.assignedText } : {})}
            />

            {formError ? (
              <p role="alert" className="text-destructive text-base">
                {formError}
              </p>
            ) : null}

            <SheetFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Un attimo…" : category ? "Salva" : "Aggiungi"}
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
