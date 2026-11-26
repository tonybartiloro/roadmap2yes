"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
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
  infantsText,
  overText,
  parseCapacity,
  seatsText,
  TABLE_NAME_MAX,
  validateTableName,
  type GuestTable,
  type Occupancy,
} from "@/domain/guests";
import { Field } from "@/features/decisions/form-bits";
import { useConflict } from "@/features/budget/use-conflict";
import { PanelContent } from "@/features/timeline/PanelContent";
import { assignGuestAction } from "./actions";
import type { GroupView, GuestView, TableView } from "./data";
import { formatConflictValue, TABLE_FIELD_LABELS } from "./field-labels";
import { TableAddPeople } from "./TableAddPeople";
import { addTableAction, updateTableAction } from "./tables-actions";
import type { useGuestActions } from "./use-guest-actions";
import { compareNames, fullName } from "./view";

/**
 * Create a table, or open one: name and capacity (1-50, optional) with the versioned edit and the
 * conflict dialog (AC6); who sits there with "Rimuovi dal tavolo"; "Aggiungi persone" and
 * "Aggiungi un gruppo intero"; "Elimina il tavolo". Mount with `key`. Shape and position are in
 * the database and not shown (BR10).
 */
export function TableSheet({
  table,
  occupancy,
  tables,
  members,
  guests,
  groups,
  actions,
  onClose,
  onDelete,
  onStale,
}: {
  /** `null` to create. */
  table: TableView | null;
  occupancy: Occupancy | null;
  tables: readonly GuestTable[];
  /** Live people at this table. */
  members: readonly GuestView[];
  /** All live people (for "Aggiungi persone"). */
  guests: readonly GuestView[];
  groups: readonly GroupView[];
  actions: ReturnType<typeof useGuestActions>;
  onClose: () => void;
  onDelete: (table: TableView) => void;
  onStale: () => void;
}) {
  const [name, setName] = useState(table?.name ?? "");
  const [capacity, setCapacity] = useState(
    table?.capacity === null || !table ? "" : String(table.capacity),
  );
  const [errors, setErrors] = useState<{ name?: string; capacity?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [adding, setAdding] = useState<"people" | "group" | null>(null);

  const conflict = useConflict({
    labels: TABLE_FIELD_LABELS,
    formatValue: (field, value) => formatConflictValue(field, value),
    partnerName: "Il tuo partner",
    onResolved: (result) => {
      if (result.ok) {
        toast("Tavolo salvato.");
        onClose();
      } else setFormError(result.message);
    },
    onCancel: () => {
      onClose();
      onStale();
    },
  });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    const cap = parseCapacity(capacity);
    const found = {
      ...(validateTableName(name) ? { name: validateTableName(name)! } : {}),
      ...(!cap.ok ? { capacity: cap.message } : {}),
    };
    setErrors(found);
    if (Object.keys(found).length > 0 || !cap.ok) return;
    const values = { name: name.trim(), capacity: cap.capacity };

    setPending(true);
    if (!table) {
      const added = await addTableAction(values);
      setPending(false);
      if (!added.ok) return setFormError(added.message);
      toast("Tavolo creato.");
      onClose();
      return;
    }
    if (values.name === table.name && values.capacity === table.capacity) {
      setPending(false);
      return onClose();
    }
    const send = (version: number) =>
      updateTableAction({ tableId: table.id, version, table: values });
    const result = await send(table.version);
    setPending(false);
    if (conflict.handle(result, values, send)) return;
    if (result.ok) {
      toast("Tavolo salvato.");
      onClose();
    } else setFormError(result.message);
  }

  async function remove(guest: GuestView) {
    const result = await assignGuestAction({ guestId: guest.id, tableId: null });
    if (!result.ok) toast.error(result.message);
    else toast(`${fullName(guest)} non è più al tavolo.`);
  }

  const over = occupancy ? overText(occupancy) : null;
  const infants = occupancy ? infantsText(occupancy) : null;

  return (
    <>
      <Sheet open onOpenChange={(next) => (next || pending ? undefined : onClose())}>
        <PanelContent className="max-h-[92dvh] overflow-y-auto" aria-describedby="table-hint">
          <SheetHeader>
            <SheetTitle>{table ? table.name : "Crea tavolo"}</SheetTitle>
            <SheetDescription id="table-hint">
              {table && occupancy
                ? `${seatsText(occupancy)}. I neonati non occupano posto.`
                : "Nome e capienza (facoltativa, da 1 a 50)."}
            </SheetDescription>
          </SheetHeader>

          {table ? (
            <section aria-labelledby="table-members" className="flex flex-col gap-2">
              <h3 id="table-members" className="text-lg font-semibold">
                Al tavolo ({members.length})
              </h3>
              {over ? <p className="text-destructive text-base font-semibold">{over}</p> : null}
              {infants ? <p className="text-muted-foreground text-sm">{infants}</p> : null}
              {members.length === 0 ? (
                <p className="text-muted-foreground">Nessuno qui: aggiungi persone.</p>
              ) : (
                <ul className="flex flex-col">
                  {members.toSorted(compareNames).map((g) => (
                    <li
                      key={g.id}
                      className="border-border flex items-center justify-between gap-2 border-b py-1 last:border-b-0"
                    >
                      <span className="min-w-0 break-words">{fullName(g)}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        aria-label={`Rimuovi dal tavolo ${fullName(g)}`}
                        onClick={() => void remove(g)}
                      >
                        Rimuovi dal tavolo
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => setAdding("people")}>
                  Aggiungi persone
                </Button>
                <Button type="button" variant="outline" onClick={() => setAdding("group")}>
                  Aggiungi un gruppo intero
                </Button>
              </div>
              <Button
                type="button"
                variant="outline"
                className="text-destructive justify-start"
                onClick={() => onDelete(table)}
              >
                <Trash2 aria-hidden />
                Elimina il tavolo
              </Button>
            </section>
          ) : null}
          <form noValidate onSubmit={submit} className="flex flex-col gap-4">
            <Field label="Nome del tavolo" error={errors.name}>
              {(control) => (
                <Input
                  {...control}
                  value={name}
                  maxLength={TABLE_NAME_MAX}
                  required
                  autoComplete="off"
                  onChange={(event) => setName(event.target.value)}
                />
              )}
            </Field>
            <Field label="Capienza" error={errors.capacity} hint="Facoltativa: da 1 a 50 posti.">
              {(control) => (
                <Input
                  {...control}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={capacity}
                  onChange={(event) => setCapacity(event.target.value)}
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
                {pending ? "Un attimo…" : table ? "Salva" : "Crea tavolo"}
              </Button>
              <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
                Annulla
              </Button>
            </SheetFooter>
          </form>
        </PanelContent>
      </Sheet>
      {table && adding ? (
        <TableAddPeople
          mode={adding}
          table={table}
          tables={tables}
          guests={guests}
          groups={groups}
          actions={actions}
          onClose={() => setAdding(null)}
          onDone={onClose}
        />
      ) : null}
      {conflict.dialog}
    </>
  );
}
