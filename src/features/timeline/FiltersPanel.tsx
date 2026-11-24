"use client";

import { useId, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sheet, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { CATEGORY_LABELS, MILESTONE_CATEGORIES } from "@/content/milestones";
import type { MilestoneCategory } from "@/content/milestones/types";
import { cn } from "@/lib/utils";
import {
  DEFAULT_FILTERS,
  countActiveFilters,
  type AssigneeFilter,
  type DueFilter,
  type Filters,
  type StatusFilter,
} from "./filters";
import { ofPartner } from "./copy";
import { PanelContent } from "./PanelContent";

/** One-tap "Miei / di {partner} / Tutti" (AC30): the same field as the assignee filter. */
export function AssigneeShortcut({
  value,
  onChange,
  partnerName,
}: {
  value: AssigneeFilter;
  onChange: (value: AssigneeFilter) => void;
  partnerName: string;
}) {
  const options: { value: AssigneeFilter; label: string }[] = [
    { value: "mine", label: "Miei" },
    { value: "partner", label: ofPartner(partnerName) },
    { value: "all", label: "Tutti" },
  ];
  return (
    <div
      role="group"
      aria-label="Di chi sono i compiti"
      className="flex gap-1"
      data-testid="assignee-shortcut"
    >
      {options.map((option) => (
        <Button
          key={option.value}
          type="button"
          size="sm"
          variant={value === option.value ? "default" : "outline"}
          aria-pressed={value === option.value}
          data-testid={`assignee-shortcut-${option.value}`}
          onClick={() => onChange(option.value)}
          className="px-3"
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

function RadioRow<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
}) {
  const groupId = useId();
  return (
    <div className="flex flex-col gap-1">
      <p id={`${groupId}-label`} className="text-base font-semibold">
        {label}
      </p>
      <RadioGroup
        value={value}
        onValueChange={(next) => onChange(next as T)}
        aria-labelledby={`${groupId}-label`}
        className="gap-0"
      >
        {options.map((option) => (
          <div key={option.value} className="flex min-h-11 items-center gap-3">
            <RadioGroupItem id={`${groupId}-${option.value}`} value={option.value} />
            <Label
              htmlFor={`${groupId}-${option.value}`}
              className="flex-1 py-2 text-base font-normal"
            >
              {option.label}
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}

const STATUS_OPTIONS: readonly { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Tutti" },
  { value: "todo", label: "Da fare" },
  { value: "done", label: "Fatti" },
];

const DUE_OPTIONS: readonly { value: DueFilter; label: string }[] = [
  { value: "all", label: "Tutte" },
  { value: "overdue", label: "Da recuperare (già passate)" },
  { value: "next30", label: "Entro 30 giorni" },
  { value: "later", label: "Più avanti" },
  { value: "none", label: "Senza scadenza" },
];

/** "Filtri" button with counter plus the panel (status, category, assignee, due date; AC30). */
export function FiltersPanel({
  filters,
  onChange,
  partnerName,
  matchCount,
}: {
  filters: Filters;
  onChange: (filters: Filters) => void;
  partnerName: string;
  matchCount: number;
}) {
  const [open, setOpen] = useState(false);
  const categoryId = useId();
  const active = countActiveFilters(filters);
  const assigneeOptions: readonly { value: AssigneeFilter; label: string }[] = [
    { value: "all", label: "Tutti" },
    { value: "mine", label: "I miei e di Entrambi" },
    { value: "partner", label: `${ofPartner(partnerName)} e di Entrambi` },
  ];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" data-testid="filters-button">
          <SlidersHorizontal aria-hidden />
          Filtri
          {active > 0 ? (
            <span
              className="bg-primary text-primary-foreground inline-flex min-w-6 items-center justify-center rounded-full px-1.5 text-sm"
              data-testid="filters-count"
            >
              <span aria-hidden>{active}</span>
              <span className="sr-only"> filtri attivi</span>
            </span>
          ) : null}
        </Button>
      </SheetTrigger>
      <PanelContent data-testid="filters-panel" aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>Filtri</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-5">
          <RadioRow
            label="Stato"
            value={filters.status}
            onChange={(status) => onChange({ ...filters, status })}
            options={STATUS_OPTIONS}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={categoryId} className="text-base font-semibold">
              Categoria
            </Label>
            <select
              id={categoryId}
              value={filters.category}
              onChange={(event) => onChange({ ...filters, category: event.target.value })}
              className="border-input bg-background text-foreground focus-visible:ring-ring focus-visible:ring-offset-background h-11 w-full rounded-md border px-3 text-base focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <option value="all">Tutte</option>
              {MILESTONE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {CATEGORY_LABELS[category as MilestoneCategory]}
                </option>
              ))}
            </select>
          </div>
          <RadioRow
            label="Chi se ne occupa"
            value={filters.assignee}
            onChange={(assignee) => onChange({ ...filters, assignee })}
            options={assigneeOptions}
          />
          <RadioRow
            label="Scadenza"
            value={filters.due}
            onChange={(due) => onChange({ ...filters, due })}
            options={DUE_OPTIONS}
          />
        </div>
        <div className={cn("mt-2 flex flex-col gap-2 sm:flex-row-reverse")}>
          <Button type="button" onClick={() => setOpen(false)}>
            Mostra {matchCount} {matchCount === 1 ? "compito" : "compiti"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={active === 0}
            onClick={() => onChange(DEFAULT_FILTERS)}
            data-testid="filters-reset"
          >
            Azzera i filtri
          </Button>
        </div>
      </PanelContent>
    </Sheet>
  );
}
