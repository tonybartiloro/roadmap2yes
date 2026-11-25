"use client";

import { Plus, Table2 } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { normalizeText, type Occupancy } from "@/domain/guests";
import type { TableView } from "./data";
import { TableCard } from "./TableCard";

/**
 * The "Tavoli" tab (AC14, AC16). Always there: with no table it is a calm empty state with "Crea
 * tavolo"; with tables, a grid of cards (the list is by name) and the same button on top.
 */
export function TablesTab({
  tables,
  occupancies,
  onCreate,
  onOpen,
}: {
  tables: readonly TableView[];
  occupancies: ReadonlyMap<string, Occupancy>;
  onCreate: () => void;
  onOpen: (table: TableView) => void;
}) {
  const live = tables
    .filter((t) => !t.deletedAt)
    .toSorted((a, b) => (normalizeText(a.name) < normalizeText(b.name) ? -1 : 1));

  if (live.length === 0) {
    return (
      <EmptyState
        icon={<Table2 className="size-8" />}
        title="Ti servono i tavoli? Creali quando vuoi."
        description="Sono facoltativi: la lista funziona benissimo anche senza."
        action={
          <Button type="button" onClick={onCreate}>
            Crea tavolo
          </Button>
        }
      />
    );
  }
  return (
    <div className="flex flex-col gap-4" data-testid="tables-tab">
      <div>
        <Button type="button" variant="outline" onClick={onCreate}>
          <Plus aria-hidden />
          Crea tavolo
        </Button>
      </div>
      <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {live.map((table) => {
          const occupancy = occupancies.get(table.id);
          return (
            <li key={table.id}>
              {occupancy ? (
                <TableCard table={table} occupancy={occupancy} onOpen={() => onOpen(table)} />
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
