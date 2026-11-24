"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Field, NativeSelect } from "@/features/decisions/form-bits";
import { plural } from "@/components/format";
import type { ActionResult, CategoryView } from "./types";

/**
 * "Sposta in…" (AC34, D37, P5): a category with items cannot be deleted until they live somewhere
 * else. Confirming moves the items and deletes the category; its Assegnato goes back to "non
 * assegnato" (the database does it in the same call).
 */
export function MoveSheet({
  open,
  onOpenChange,
  category,
  itemCount,
  destinations,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: CategoryView;
  itemCount: number;
  /** Live categories other than the one being deleted. */
  destinations: readonly CategoryView[];
  onConfirm: (toId: string) => Promise<ActionResult<unknown>>;
}) {
  const [toId, setToId] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function confirm() {
    setFormError(null);
    if (toId === "") {
      setFieldError("Scegli dove spostare le voci.");
      return;
    }
    setFieldError(null);
    setPending(true);
    const result = await onConfirm(toId);
    setPending(false);
    if (result.ok) onOpenChange(false);
    else setFormError(result.message);
  }

  return (
    <Sheet open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <SheetContent side="bottom" className="md:mx-auto md:max-w-lg">
        <SheetHeader>
          <SheetTitle>Sposta le voci prima di eliminare</SheetTitle>
          <SheetDescription>
            «{category.name}» ha {plural(itemCount, "voce", "voci")}. Spostale in un&apos;altra
            categoria: poi «{category.name}» si elimina. L&apos;importo assegnato a «{category.name}
            » torna «non assegnato».
          </SheetDescription>
        </SheetHeader>

        {destinations.length === 0 ? (
          <p>Non c&apos;è un&apos;altra categoria: aggiungine una e poi riprova.</p>
        ) : (
          <Field label="Sposta in…" error={fieldError ?? undefined}>
            {(control) => (
              <NativeSelect
                {...control}
                value={toId}
                onChange={(event) => {
                  setToId(event.target.value);
                  setFieldError(null);
                }}
              >
                <option value="">Scegli una categoria</option>
                {destinations.map((destination) => (
                  <option key={destination.id} value={destination.id}>
                    {destination.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
        )}

        {formError ? (
          <p role="alert" className="text-destructive text-base">
            {formError}
          </p>
        ) : null}

        <SheetFooter>
          {destinations.length > 0 ? (
            <Button type="button" onClick={confirm} disabled={pending}>
              {pending ? "Un attimo…" : "Sposta ed elimina"}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Annulla
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
