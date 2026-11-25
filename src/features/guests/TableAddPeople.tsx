"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { plural } from "@/components/format";
import { liveTableOf, matchesQuery, planGroupSeating, type GuestTable } from "@/domain/guests";
import { Field, NativeSelect } from "@/features/decisions/form-bits";
import { PanelContent } from "@/features/timeline/PanelContent";
import type { GroupView, GuestView } from "./data";
import { ShowMore } from "./ShowMore";
import type { useGuestActions } from "./use-guest-actions";
import { compareNames, fullName, PAGE_SIZE } from "./view";

type Actions = ReturnType<typeof useGuestActions>;

/** "già al tavolo Rossi" / "già ai tavoli Rossi, Bianchi". */
function elsewhereText(tables: readonly GuestTable[]): string {
  const names = [...new Set(tables.map((t) => t.name))];
  return names.length === 1 ? `già al tavolo ${names[0]}` : `già ai tavoli ${names.join(", ")}`;
}

/**
 * "Aggiungi persone" (checkbox list with search, people without a table first) or "Aggiungi un
 * gruppo intero" (AC15). Seating goes through `guests_bulk` with the Annulla toast; if part of a
 * group already sits at another table the screen asks first: "Sposta" or "Lascia dove sono".
 * Going over the capacity is allowed (the table says so in text).
 */
export function TableAddPeople({
  mode,
  table,
  tables,
  guests,
  groups,
  actions,
  onClose,
}: {
  mode: "people" | "group";
  table: GuestTable;
  tables: readonly GuestTable[];
  /** Live guests. */
  guests: readonly GuestView[];
  groups: readonly GroupView[];
  actions: Actions;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [onlyFree, setOnlyFree] = useState(true);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [groupId, setGroupId] = useState("");
  const [shown, setShown] = useState(PAGE_SIZE);
  const [busy, setBusy] = useState(false);
  const [emptyGroup, setEmptyGroup] = useState(false);
  const [ask, setAsk] = useState<ReturnType<typeof planGroupSeating> | null>(null);

  const candidates = guests
    .filter((g) => liveTableOf(g, tables)?.id !== table.id)
    .filter((g) => !onlyFree || !liveTableOf(g, tables))
    .filter((g) => matchesQuery(g, query))
    .toSorted(compareNames);
  const liveGroups = groups
    .filter((g) => !g.deletedAt)
    .toSorted((a, b) => a.name.localeCompare(b.name, "it"));

  async function seat(ids: readonly string[]) {
    if (ids.length === 0) {
      // Nobody to seat (all already at a table): say so and close, never a silent no-op.
      toast("Nessuno da aggiungere: sono già tutti seduti.");
      onClose();
      return;
    }
    setBusy(true);
    const ok = await actions.bulk(
      "assign_table",
      ids,
      (n) => `${plural(n, "persona", "persone")} al tavolo «${table.name}».`,
      table.id,
    );
    setBusy(false);
    if (ok) onClose();
  }

  function addGroup() {
    const members = guests.filter((g) => g.groupId === groupId);
    if (members.length === 0) {
      setEmptyGroup(true);
      return;
    }
    setEmptyGroup(false);
    const plan = planGroupSeating(members, tables, table.id);
    if (plan.alreadyElsewhere.length > 0) setAsk(plan);
    else void seat(plan.toSeat.map((g) => g.id));
  }

  return (
    <>
      <Sheet open onOpenChange={(next) => (next || busy ? undefined : onClose())}>
        <PanelContent className="max-h-[92dvh] overflow-y-auto" aria-describedby="seat-hint">
          <SheetHeader>
            <SheetTitle>
              {mode === "people" ? "Aggiungi persone" : "Aggiungi un gruppo intero"}
            </SheetTitle>
            <SheetDescription id="seat-hint">
              Al tavolo «{table.name}». Se è pieno puoi aggiungere lo stesso: lo vedrai scritto.
            </SheetDescription>
          </SheetHeader>

          {mode === "people" ? (
            <>
              <div role="search" className="flex flex-col gap-1.5">
                <Label htmlFor="seat-search">Cerca per nome</Label>
                <Input
                  id="seat-search"
                  type="search"
                  autoComplete="off"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setShown(PAGE_SIZE);
                  }}
                />
              </div>
              <label className="flex min-h-11 items-center gap-3">
                <Checkbox
                  checked={onlyFree}
                  onCheckedChange={(next) => setOnlyFree(next === true)}
                />
                Solo senza tavolo
              </label>
              {candidates.length === 0 ? (
                <p className="text-muted-foreground">Nessuno da aggiungere con questi criteri.</p>
              ) : (
                <ul className="flex flex-col">
                  {candidates.slice(0, shown).map((g) => {
                    const at = liveTableOf(g, tables);
                    return (
                      <li key={g.id} className="border-border border-b last:border-b-0">
                        <label className="flex min-h-11 cursor-pointer items-center gap-3 py-2">
                          <Checkbox
                            checked={picked.has(g.id)}
                            aria-label={`Aggiungi ${fullName(g)}`}
                            onCheckedChange={(on) =>
                              setPicked((current) => {
                                const next = new Set(current);
                                if (on === true) next.add(g.id);
                                else next.delete(g.id);
                                return next;
                              })
                            }
                          />
                          <span className="min-w-0 flex-1 break-words">{fullName(g)}</span>
                          {at ? (
                            <span className="text-muted-foreground text-sm">
                              Al tavolo {at.name}
                            </span>
                          ) : null}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
              <ShowMore
                remaining={candidates.length - shown}
                onClick={() => setShown((n) => n + PAGE_SIZE)}
              />
              <SheetFooter>
                <Button
                  type="button"
                  disabled={busy || picked.size === 0}
                  onClick={() => void seat([...picked])}
                >
                  {busy ? "Un attimo…" : `Aggiungi ${plural(picked.size, "persona", "persone")}`}
                </Button>
                <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
                  Annulla
                </Button>
              </SheetFooter>
            </>
          ) : (
            <>
              <Field label="Gruppo">
                {(control) => (
                  <NativeSelect
                    {...control}
                    value={groupId}
                    onChange={(event) => {
                      setGroupId(event.target.value);
                      setEmptyGroup(false);
                    }}
                  >
                    <option value="">Scegli un gruppo</option>
                    {liveGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
              {emptyGroup ? (
                <p role="status" className="text-muted-foreground">
                  Questo gruppo non ha ancora persone: aggiungine prima dal gruppo.
                </p>
              ) : null}
              <SheetFooter>
                <Button type="button" disabled={busy || groupId === ""} onClick={addGroup}>
                  {busy ? "Un attimo…" : "Aggiungi il gruppo"}
                </Button>
                <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
                  Annulla
                </Button>
              </SheetFooter>
            </>
          )}
        </PanelContent>
      </Sheet>

      <AlertDialog open={ask !== null} onOpenChange={(next) => (next ? undefined : setAsk(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alcuni sono già seduti</AlertDialogTitle>
            <AlertDialogDescription>
              {ask
                ? `${ask.alreadyElsewhere.length} di loro sono ${elsewhereText(ask.alreadyElsewhere.map((x) => x.table))}: li sposto qui?`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const plan = ask;
                setAsk(null);
                if (plan) void seat(plan.toSeat.map((g) => g.id));
              }}
            >
              Lascia dove sono
            </Button>
            <Button
              type="button"
              onClick={() => {
                const plan = ask;
                setAsk(null);
                if (plan)
                  void seat(
                    [...plan.toSeat, ...plan.alreadyElsewhere.map((x) => x.guest)].map((g) => g.id),
                  );
              }}
            >
              Sposta
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
