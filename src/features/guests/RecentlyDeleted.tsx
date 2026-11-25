"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { plural } from "@/components/format";
import { PanelContent } from "@/features/timeline/PanelContent";
import type { EmptyScope, EntityKind, GroupView, GuestView, TableView } from "./data";
import { fullName } from "./view";

export interface ConfirmRequest {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
}

/** Destructive confirmation: the focus starts on "Annulla" (Radix AlertDialog), never on the danger. */
export function ConfirmDialog({
  request,
  onClose,
}: {
  request: ConfirmRequest | null;
  onClose: () => void;
}) {
  return (
    <AlertDialog open={request !== null} onOpenChange={(next) => (next ? undefined : onClose())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{request?.title}</AlertDialogTitle>
          <AlertDialogDescription>{request?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annulla</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => request?.onConfirm()}
          >
            {request?.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface Item {
  kind: EntityKind;
  id: string;
  version: number;
  name: string;
  note: string | null;
  /** Live people pointing at it (a group or a table); 0 for a person. */
  members: number;
}

interface SectionDef {
  scope: Exclude<EmptyScope, "all">;
  title: string;
  items: Item[];
  after: string;
}

/** What happens to the members of ONE group or table that is deleted for good (a number, not a vague line). */
function purgeConsequence(section: SectionDef, item: Item): string {
  // People and groups keep the S1 wording (the e2e of S1 asserts it); tables say how many.
  if (item.kind !== "table") return section.after;
  if (item.members === 0) return "Nessuna persona ne fa parte.";
  return item.members === 1
    ? "La persona che ne fa parte resta, senza tavolo."
    : `Le ${item.members} persone che ne fanno parte restano, senza tavolo.`;
}

const NO_RETURN = "Non si può annullare.";

/**
 * "Eliminati di recente" (AC10, AC11): people, groups and tables, one section each (empty ones are
 * hidden). Ripristina, Elimina definitivamente (one) and Svuota (a section, or everything), each
 * deletion confirmed with the number and what happens to the members. No expiry: the text says so.
 */
export function RecentlyDeleted({
  open,
  onOpenChange,
  guests,
  groups,
  tables,
  busy,
  onRestore,
  onPurge,
  onEmpty,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guests: readonly GuestView[];
  groups: readonly GroupView[];
  tables: readonly TableView[];
  busy: boolean;
  onRestore: (item: { kind: EntityKind; id: string; version: number }) => void;
  onPurge: (item: { kind: EntityKind; id: string }) => void;
  onEmpty: (scope: EmptyScope) => void;
}) {
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const live = guests.filter((g) => !g.deletedAt);
  const members = (field: "groupId" | "tableId", id: string) =>
    live.filter((g) => g[field] === id).length;

  const all: SectionDef[] = [
    {
      scope: "guests",
      title: "Persone",
      after: "Spariscono anche dalle esportazioni.",
      items: guests
        .filter((g) => g.deletedAt)
        .map((g) => ({
          kind: "guest",
          id: g.id,
          version: g.version,
          name: fullName(g),
          note: null,
          members: 0,
        })),
    },
    {
      scope: "groups",
      title: "Gruppi",
      after: "Le persone del gruppo restano, senza gruppo.",
      items: groups
        .filter((g) => g.deletedAt)
        .map((g) => {
          const n = members("groupId", g.id);
          return {
            kind: "group",
            id: g.id,
            version: g.version,
            name: g.name,
            members: n,
            note:
              n > 0
                ? `${plural(n, "persona", "persone")}, ${n === 1 ? "rientra" : "rientrano"} se lo ripristini`
                : null,
          };
        }),
    },
    {
      scope: "tables",
      title: "Tavoli",
      after: "Le persone del tavolo restano, senza tavolo.",
      items: tables
        .filter((t) => t.deletedAt)
        .map((t) => {
          const n = members("tableId", t.id);
          return {
            kind: "table",
            id: t.id,
            version: t.version,
            name: t.name,
            members: n,
            note:
              n > 0
                ? `${plural(n, "persona", "persone")}, ${n === 1 ? "rientra" : "rientrano"} se lo ripristini`
                : null,
          };
        }),
    },
  ];
  // Empty sections are hidden. The lists are not paged: "Svuota" is the way out of a long one.
  const sections = all.filter((section) => section.items.length > 0);

  const total = sections.reduce((sum, s) => sum + s.items.length, 0);
  const noun = (scope: string, n: number) =>
    scope === "guests"
      ? plural(n, "persona", "persone")
      : scope === "groups"
        ? plural(n, "gruppo", "gruppi")
        : plural(n, "tavolo", "tavoli");

  function askPurge(section: SectionDef, item: Item) {
    setConfirm({
      title: `Elimini definitivamente «${item.name}»?`,
      description: `${NO_RETURN} ${purgeConsequence(section, item)}`,
      confirmLabel: "Elimina definitivamente",
      onConfirm: () => onPurge({ kind: item.kind, id: item.id }),
    });
  }

  function askEmpty(scope: EmptyScope) {
    const picked = scope === "all" ? sections : sections.filter((s) => s.scope === scope);
    const what = picked.map((s) => noun(s.scope, s.items.length));
    setConfirm({
      title: `Elimini definitivamente ${what.join(", ")}?`,
      description: `${NO_RETURN} ${picked.map((s) => s.after).join(" ")}`,
      confirmLabel: "Elimina definitivamente",
      onConfirm: () => onEmpty(scope),
    });
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <PanelContent className="max-h-[92dvh] overflow-y-auto" aria-describedby="deleted-hint">
          <SheetHeader>
            <SheetTitle>Eliminati di recente</SheetTitle>
            <SheetDescription id="deleted-hint">
              Restano qui finché non li elimini definitivamente.
            </SheetDescription>
          </SheetHeader>
          {total === 0 ? (
            <p className="text-muted-foreground">Niente di eliminato di recente.</p>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => askEmpty("all")}
              >
                Svuota tutto ({total})
              </Button>
              {sections.map((section) => (
                <section
                  key={section.scope}
                  aria-labelledby={`deleted-${section.scope}`}
                  className="flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 id={`deleted-${section.scope}`} className="text-lg font-semibold">
                      {section.title} ({section.items.length})
                    </h3>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      aria-label={`Svuota ${section.title.toLowerCase()}`}
                      onClick={() => askEmpty(section.scope)}
                    >
                      Svuota
                    </Button>
                  </div>
                  <ul className="flex flex-col gap-2">
                    {section.items.map((item) => (
                      <li
                        key={item.id}
                        className="border-border flex flex-col gap-2 rounded-lg border p-3"
                        data-testid="deleted-row"
                      >
                        <span className="break-words">
                          {item.name}
                          {item.note ? (
                            <span className="text-muted-foreground block text-sm">{item.note}</span>
                          ) : null}
                        </span>
                        <span className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={busy}
                            aria-label={`Ripristina ${item.name}`}
                            onClick={() =>
                              onRestore({ kind: item.kind, id: item.id, version: item.version })
                            }
                          >
                            Ripristina
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={busy}
                            className="text-destructive"
                            aria-label={`Elimina definitivamente ${item.name}`}
                            onClick={() => askPurge(section, item)}
                          >
                            Elimina definitivamente
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </>
          )}
        </PanelContent>
      </Sheet>
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
