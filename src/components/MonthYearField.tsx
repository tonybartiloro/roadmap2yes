"use client";

import { useId, useState } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { MONTHS_LONG } from "./format";

export interface MonthYear {
  year: number;
  /** 1-12. */
  month: number;
}

/** Month + year (periods such as "mag 2028"). Two selects inside a labelled group. */
export function MonthYearField({
  legend,
  value,
  onChange,
  minYear,
  maxYear,
  error,
  className,
}: {
  legend: string;
  value: MonthYear | null;
  onChange: (value: MonthYear | null) => void;
  minYear: number;
  maxYear: number;
  error?: string;
  className?: string;
}) {
  const id = useId();
  const years = Array.from({ length: Math.max(0, maxYear - minYear + 1) }, (_, i) => minYear + i);

  // A half-choice (only the month, say) lives here until both parts are known.
  const [partial, setPartial] = useState<Partial<MonthYear>>({});
  const month = value?.month ?? partial.month;
  const year = value?.year ?? partial.year;

  function update(patch: Partial<MonthYear>) {
    const nextMonth = patch.month ?? month;
    const nextYear = patch.year ?? year;
    setPartial({ month: nextMonth, year: nextYear });
    if (nextMonth !== undefined && nextYear !== undefined) {
      onChange({ month: nextMonth, year: nextYear });
    }
  }

  return (
    <fieldset
      className={cn("flex flex-col gap-1.5", className)}
      aria-describedby={error ? `${id}-error` : undefined}
    >
      <legend className="text-base leading-6 font-semibold">{legend}</legend>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-month`} className="text-muted-foreground text-sm font-normal">
            Mese
          </Label>
          <Select
            value={month === undefined ? undefined : String(month)}
            onValueChange={(month) => update({ month: Number(month) })}
          >
            <SelectTrigger id={`${id}-month`} aria-invalid={error ? true : undefined}>
              <SelectValue placeholder="Scegli" />
            </SelectTrigger>
            <SelectContent>
              {MONTHS_LONG.map((name, index) => (
                <SelectItem key={name} value={String(index + 1)} className="capitalize">
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-year`} className="text-muted-foreground text-sm font-normal">
            Anno
          </Label>
          <Select
            value={year === undefined ? undefined : String(year)}
            onValueChange={(year) => update({ year: Number(year) })}
          >
            <SelectTrigger id={`${id}-year`} aria-invalid={error ? true : undefined}>
              <SelectValue placeholder="Scegli" />
            </SelectTrigger>
            <SelectContent>
              {years.map((year) => (
                <SelectItem key={year} value={String(year)}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
