"use client";

import { useId, useState } from "react";
import { Popover } from "radix-ui";
import { CalendarDays, TriangleAlert } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  formatPlainDate,
  isPlainDate,
  parsePlainDate,
  type PlainDate,
} from "@/lib/dates/plain-date";

function toLocalDate(value: PlainDate): Date {
  const { year, month, day } = parsePlainDate(value);
  return new Date(year, month - 1, day);
}

function fromLocalDate(date: Date): PlainDate {
  return formatPlainDate({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  });
}

export interface DateFieldProps {
  label: string;
  /** `YYYY-MM-DD` or "" when empty. */
  value: PlainDate | "";
  onChange: (value: PlainDate | "") => void;
  id?: string;
  name?: string;
  min?: PlainDate;
  max?: PlainDate;
  /** Non-blocking notice when the date is before this one (design §3.8). */
  softMin?: PlainDate;
  softMinMessage?: string;
  error?: string;
  hint?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Date as `YYYY-MM-DD`. The native `<input type="date">` is always there (best on phones, fully
 * accessible); from 768 px a calendar button opens a react-day-picker popover (Italian).
 */
export function DateField({
  label,
  value,
  onChange,
  id,
  name,
  min,
  max,
  softMin,
  softMinMessage,
  error,
  hint,
  disabled,
  className,
}: DateFieldProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const [open, setOpen] = useState(false);
  const warning =
    softMin && softMinMessage && value && isPlainDate(value) && value < softMin
      ? softMinMessage
      : undefined;
  const describedBy =
    [
      error ? `${inputId}-error` : null,
      warning ? `${inputId}-warning` : null,
      hint ? `${inputId}-hint` : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={inputId}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={inputId}
          name={name}
          type="date"
          value={value}
          min={min}
          max={max}
          disabled={disabled}
          // From md the popover button is the calendar: hide the browser's own indicator.
          className="md:[&::-webkit-calendar-picker-indicator]:hidden"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => {
            const next = event.target.value;
            onChange(next === "" ? "" : isPlainDate(next) ? next : "");
          }}
        />
        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label={`Apri il calendario: ${label}`}
              className="border-input bg-background hover:bg-muted focus-visible:ring-ring hidden size-11 shrink-0 items-center justify-center rounded-md border focus-visible:ring-2 md:inline-flex"
            >
              <CalendarDays aria-hidden className="size-5" />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              align="end"
              sideOffset={6}
              className="bg-card text-foreground border-border z-50 rounded-lg border shadow-lg"
            >
              <Calendar
                mode="single"
                required={false}
                selected={value && isPlainDate(value) ? toLocalDate(value) : undefined}
                defaultMonth={value && isPlainDate(value) ? toLocalDate(value) : undefined}
                disabled={[
                  ...(min ? [{ before: toLocalDate(min) }] : []),
                  ...(max ? [{ after: toLocalDate(max) }] : []),
                ]}
                onSelect={(date) => {
                  if (date) {
                    onChange(fromLocalDate(date));
                    setOpen(false);
                  }
                }}
              />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
      {hint ? (
        <p id={`${inputId}-hint`} className="text-muted-foreground text-sm">
          {hint}
        </p>
      ) : null}
      {warning ? (
        <p id={`${inputId}-warning`} className="text-warning flex items-start gap-1.5 text-sm">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {warning}
        </p>
      ) : null}
      {error ? (
        <p id={`${inputId}-error`} className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
