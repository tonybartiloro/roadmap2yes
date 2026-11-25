"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  CATEGORY_LABELS,
  GUEST_CATEGORIES,
  LIMITS,
  validateGuest,
  type GuestCategory,
  type GuestErrors,
  type GuestSide,
} from "@/domain/guests";
import { Field, NativeSelect } from "@/features/decisions/form-bits";
import { PanelContent } from "@/features/timeline/PanelContent";
import { createFamilyAction } from "./actions";
import { MAX_FAMILY, validateGroupName } from "./schemas";
import type { PartnerNames } from "./view";

interface Row {
  firstName: string;
  /** `null` = untouched: the surname proposed by the group name is shown. */
  lastName: string | null;
  category: GuestCategory;
}

const blank = (): Row => ({ firstName: "", lastName: null, category: "adult" });

/** "Famiglia Rossi" -> "Rossi"; any other name -> its last word is not guessed (empty). */
export function suggestedSurname(groupName: string): string {
  const match = /^\s*famiglia\s+(.+?)\s*$/i.exec(groupName);
  return match?.[1] ?? "";
}

/**
 * "Nuova famiglia" (AC5): the group name, one side for everyone and several people, saved in ONE
 * request. Rows left completely empty are ignored; errors show on the row that has them.
 */
export function FamilySheet({
  open,
  onOpenChange,
  partners,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partners: PartnerNames;
}) {
  const [name, setName] = useState("");
  const [side, setSide] = useState<GuestSide | "">("");
  const [rows, setRows] = useState<Row[]>([blank(), blank()]);
  const [nameError, setNameError] = useState<string | undefined>();
  const [rowErrors, setRowErrors] = useState<Record<number, GuestErrors>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const surname = suggestedSurname(name);
  const lastOf = (row: Row) => row.lastName ?? surname;
  const patch = (index: number, change: Partial<Row>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...change } : row)));
  const isBlank = (row: Row) => row.firstName.trim() === "" && (row.lastName ?? "").trim() === "";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    const filled = rows.map((row, index) => ({ row, index })).filter(({ row }) => !isBlank(row));
    const errors: Record<number, GuestErrors> = {};
    for (const { row, index } of filled) {
      const found = validateGuest({
        firstName: row.firstName,
        lastName: lastOf(row),
        category: row.category,
      });
      if (Object.keys(found).length > 0) errors[index] = found;
    }
    const groupError = validateGroupName(name);
    setNameError(groupError ?? undefined);
    setRowErrors(errors);
    if (filled.length === 0) return setFormError("Aggiungi almeno una persona.");
    if (groupError || Object.keys(errors).length > 0) {
      queueMicrotask(() =>
        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    setPending(true);
    const result = await createFamilyAction({
      name: name.trim(),
      side: side === "" ? null : side,
      guests: filled.map(({ row }) => ({
        firstName: row.firstName,
        lastName: lastOf(row),
        category: row.category,
      })),
    });
    setPending(false);
    if (!result.ok) return setFormError(result.message);
    toast(`Famiglia aggiunta: ${result.data.guestIds.length} persone.`);
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <PanelContent className="max-h-[92dvh] overflow-y-auto" aria-describedby="family-hint">
        <SheetHeader>
          <SheetTitle>Nuova famiglia</SheetTitle>
          <SheetDescription id="family-hint">
            Il gruppo e tutte le persone si salvano insieme.
          </SheetDescription>
        </SheetHeader>
        <form ref={formRef} noValidate onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Nome del gruppo" error={nameError}>
            {(control) => (
              <Input
                {...control}
                value={name}
                maxLength={LIMITS.name}
                placeholder="Famiglia Rossi"
                required
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </Field>
          <Field label="Lato di tutta la famiglia">
            {(control) => (
              <NativeSelect
                {...control}
                value={side}
                onChange={(event) => setSide(event.target.value as GuestSide | "")}
              >
                <option value="">Non indicato</option>
                <option value="A">{partners.a}</option>
                <option value="B">{partners.b}</option>
                <option value="both">Entrambi</option>
              </NativeSelect>
            )}
          </Field>

          <ul className="flex flex-col gap-4">
            {rows.map((row, index) => (
              <li key={index} className="border-border flex flex-col gap-3 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold">Persona {index + 1}</h3>
                  {rows.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Togli la persona ${index + 1}`}
                      onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                    >
                      <X aria-hidden />
                    </Button>
                  ) : null}
                </div>
                <Field label={`Nome (persona ${index + 1})`} error={rowErrors[index]?.firstName}>
                  {(control) => (
                    <Input
                      {...control}
                      value={row.firstName}
                      maxLength={LIMITS.name}
                      autoComplete="off"
                      onChange={(event) => patch(index, { firstName: event.target.value })}
                    />
                  )}
                </Field>
                <Field label={`Cognome (persona ${index + 1})`} error={rowErrors[index]?.lastName}>
                  {(control) => (
                    <Input
                      {...control}
                      value={lastOf(row)}
                      maxLength={LIMITS.name}
                      autoComplete="off"
                      onChange={(event) => patch(index, { lastName: event.target.value })}
                    />
                  )}
                </Field>
                <Field label={`Tipo (persona ${index + 1})`}>
                  {(control) => (
                    <NativeSelect
                      {...control}
                      value={row.category}
                      onChange={(event) =>
                        patch(index, { category: event.target.value as GuestCategory })
                      }
                    >
                      {GUEST_CATEGORIES.map((value) => (
                        <option key={value} value={value}>
                          {CATEGORY_LABELS[value]}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </Field>
              </li>
            ))}
          </ul>
          {rows.length < MAX_FAMILY ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setRows((current) => [...current, blank()])}
            >
              <Plus aria-hidden />
              Aggiungi un&apos;altra riga
            </Button>
          ) : null}

          {formError ? (
            <p role="alert" className="text-destructive text-base">
              {formError}
            </p>
          ) : null}
          <SheetFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Un attimo…" : "Salva la famiglia"}
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
  );
}
