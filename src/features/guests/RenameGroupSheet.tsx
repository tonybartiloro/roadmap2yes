"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Field } from "@/features/decisions/form-bits";
import { useConflict } from "@/features/budget/use-conflict";
import { PanelContent } from "@/features/timeline/PanelContent";
import { updateGroupAction } from "./actions";
import type { GroupView } from "./data";
import { GROUP_FIELD_LABELS } from "./field-labels";
import { validateGroupName } from "./schemas";

/** Rename a group (BR2): versioned update with the conflict dialog (AC6). Mount with `key`. */
export function RenameGroupSheet({
  group,
  onOpenChange,
  onStale,
}: {
  group: GroupView;
  onOpenChange: (open: boolean) => void;
  onStale: () => void;
}) {
  const [name, setName] = useState(group.name);
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const conflict = useConflict({
    labels: GROUP_FIELD_LABELS,
    formatValue: (_field, value) => String(value ?? "—"),
    partnerName: "Il tuo partner",
    onResolved: (result) => {
      if (result.ok) {
        toast("Gruppo rinominato.");
        onOpenChange(false);
      } else setFormError(result.message);
    },
    onCancel: () => {
      onOpenChange(false);
      onStale();
    },
  });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    const message = validateGroupName(name);
    setError(message ?? undefined);
    if (message) return;
    if (name.trim() === group.name) return onOpenChange(false);
    const send = (version: number) => updateGroupAction({ groupId: group.id, version, name });
    setPending(true);
    const result = await send(group.version);
    setPending(false);
    if (conflict.handle(result, { name: name.trim() }, send)) return;
    if (result.ok) {
      toast("Gruppo rinominato.");
      onOpenChange(false);
    } else setFormError(result.message);
  }

  return (
    <>
      <Sheet open onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
        <PanelContent aria-describedby="rename-hint">
          <SheetHeader>
            <SheetTitle>Rinomina il gruppo</SheetTitle>
            <SheetDescription id="rename-hint">
              Le persone del gruppo restano dove sono.
            </SheetDescription>
          </SheetHeader>
          <form noValidate onSubmit={submit} className="flex flex-col gap-4">
            <Field label="Nome del gruppo" error={error}>
              {(control) => (
                <Input
                  {...control}
                  value={name}
                  maxLength={80}
                  required
                  onChange={(event) => setName(event.target.value)}
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
        </PanelContent>
      </Sheet>
      {conflict.dialog}
    </>
  );
}
