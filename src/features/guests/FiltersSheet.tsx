"use client";

import { useId, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sheet, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NativeSelect } from "@/features/decisions/form-bits";
import { PanelContent } from "@/features/timeline/PanelContent";
import {
  activeFilterCount,
  CATEGORY_LABELS,
  GUEST_CATEGORIES,
  NO_FILTERS,
  type GuestCategory,
  type GuestFilters,
  type SideKey,
} from "@/domain/guests";
import type { GroupView, TableView } from "./data";
import { sideText, type PartnerNames } from "./view";

const ALL = "all";

function RadioRow<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T | typeof ALL;
  onChange: (value: T | null) => void;
  options: readonly { value: T; label: string }[];
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <p id={`${id}-label`} className="text-base font-semibold">
        {label}
      </p>
      <RadioGroup
        value={value}
        onValueChange={(next) => onChange(next === ALL ? null : (next as T))}
        aria-labelledby={`${id}-label`}
        className="gap-0"
      >
        {[{ value: ALL, label: "Tutti" }, ...options].map((option) => (
          <div key={option.value} className="flex min-h-11 items-center gap-3">
            <RadioGroupItem id={`${id}-${option.value}`} value={option.value} />
            <Label htmlFor={`${id}-${option.value}`} className="flex-1 py-2 text-base font-normal">
              {option.label}
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}

/** Chips of the active filters, each removable by keyboard ("Rimuovi filtro ..."). */
export function FilterChips({
  filters,
  groups,
  tables = [],
  partners,
  onChange,
}: {
  filters: GuestFilters;
  groups: readonly GroupView[];
  tables?: readonly TableView[];
  partners: PartnerNames;
  onChange: (filters: GuestFilters) => void;
}) {
  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (filters.side !== null) {
    const label = filters.side === "none" ? "Non indicato" : sideText(filters.side, partners);
    chips.push({
      key: "side",
      label: `Lato: ${label}`,
      clear: () => onChange({ ...filters, side: null }),
    });
  }
  if (filters.category !== null) {
    chips.push({
      key: "category",
      label: `Tipo: ${CATEGORY_LABELS[filters.category]}`,
      clear: () => onChange({ ...filters, category: null }),
    });
  }
  if (filters.groupId !== null) {
    const name =
      filters.groupId === "none"
        ? "Senza gruppo"
        : (groups.find((g) => g.id === filters.groupId)?.name ?? "Gruppo");
    chips.push({
      key: "group",
      label: `Gruppo: ${name}`,
      clear: () => onChange({ ...filters, groupId: null }),
    });
  }
  if (filters.tableId !== null) {
    const name =
      filters.tableId === "none"
        ? "Senza tavolo"
        : (tables.find((t) => t.id === filters.tableId)?.name ?? "Tavolo");
    chips.push({
      key: "table",
      label: `Tavolo: ${name}`,
      clear: () => onChange({ ...filters, tableId: null }),
    });
  }
  if (chips.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Filtri attivi" data-testid="filter-chips">
      {chips.map((chip) => (
        <li key={chip.key}>
          <button
            type="button"
            aria-label={`Rimuovi filtro ${chip.label}`}
            onClick={chip.clear}
            className="border-border bg-muted focus-visible:ring-ring inline-flex min-h-11 items-center gap-1 rounded-full border px-3 text-base focus-visible:ring-2 focus-visible:outline-none"
          >
            {chip.label}
            <X aria-hidden className="size-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * "Filtri (n)" button and its sheet: side, type and group (AC9). The count in the button of the
 * sheet is announced (`aria-live`). The table filter appears only with at least one live table.
 */
export function FiltersSheet({
  filters,
  onChange,
  groups,
  tables = [],
  partners,
  matchCount,
}: {
  filters: GuestFilters;
  onChange: (filters: GuestFilters) => void;
  groups: readonly GroupView[];
  /** LIVE tables: the table filter exists only when there is at least one (AC16). */
  tables?: readonly TableView[];
  partners: PartnerNames;
  matchCount: number;
}) {
  const [open, setOpen] = useState(false);
  const groupId = useId();
  const tableId = useId();
  const active = activeFilterCount(filters);
  const sides: { value: SideKey; label: string }[] = [
    { value: "A", label: partners.a },
    { value: "B", label: partners.b },
    { value: "both", label: "Entrambi" },
    { value: "none", label: "Non indicato" },
  ];
  const categories = GUEST_CATEGORIES.map((value: GuestCategory) => ({
    value,
    label: CATEGORY_LABELS[value],
  }));
  const liveGroups = groups
    .filter((g) => !g.deletedAt)
    .toSorted((a, b) => a.name.localeCompare(b.name, "it"));

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" data-testid="filters-button">
          <SlidersHorizontal aria-hidden />
          Filtri
          {active > 0 ? (
            <span className="bg-primary text-primary-foreground inline-flex min-w-6 items-center justify-center rounded-full px-1.5 text-sm">
              <span aria-hidden>({active})</span>
              <span className="sr-only"> filtri attivi</span>
            </span>
          ) : null}
        </Button>
      </SheetTrigger>
      <PanelContent aria-describedby={undefined} className="max-h-[90dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Filtri</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-5">
          <RadioRow
            label="Lato"
            value={filters.side ?? ALL}
            onChange={(side) => onChange({ ...filters, side })}
            options={sides}
          />
          <RadioRow
            label="Tipo"
            value={filters.category ?? ALL}
            onChange={(category) => onChange({ ...filters, category })}
            options={categories}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={groupId} className="text-base font-semibold">
              Gruppo
            </Label>
            <NativeSelect
              id={groupId}
              value={filters.groupId ?? ALL}
              onChange={(event) =>
                onChange({
                  ...filters,
                  groupId: event.target.value === ALL ? null : event.target.value,
                })
              }
            >
              <option value={ALL}>Tutti</option>
              <option value="none">Senza gruppo</option>
              {liveGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          {tables.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={tableId} className="text-base font-semibold">
                Tavolo
              </Label>
              <NativeSelect
                id={tableId}
                value={filters.tableId ?? ALL}
                onChange={(event) =>
                  onChange({
                    ...filters,
                    tableId: event.target.value === ALL ? null : event.target.value,
                  })
                }
              >
                <option value={ALL}>Tutti</option>
                <option value="none">Senza tavolo</option>
                {tables.map((table) => (
                  <option key={table.id} value={table.id}>
                    {table.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ) : null}
        </div>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row-reverse">
          <Button type="button" onClick={() => setOpen(false)} aria-live="polite">
            Mostra {matchCount} {matchCount === 1 ? "persona" : "persone"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={active === 0}
            onClick={() => onChange({ ...NO_FILTERS, query: filters.query })}
          >
            Azzera filtri
          </Button>
        </div>
      </PanelContent>
    </Sheet>
  );
}
