"use client";

import { useId, type ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useFormDraft } from "@/lib/hooks/use-form-draft";
import { cn } from "@/lib/utils";

/**
 * Local draft of a step (AC39: a failed or offline save keeps what the person typed). The draft is
 * read once the browser storage is available; the form below only mounts then, so it starts from the
 * draft (when there is one) and never flashes the saved values first. Codes are never part of a draft.
 */
export function Drafted<T extends object>({
  draftKey,
  scope,
  saved,
  sanitize,
  children,
}: {
  draftKey: string;
  scope: string;
  saved: T;
  /** Repairs or rejects a stored draft (return `null` to discard it). */
  sanitize?: (draft: T) => T | null;
  children: (api: { initial: T; save: (value: T) => void; clear: () => void }) => ReactNode;
}) {
  const { draft, ready, save, clear } = useFormDraft<T>(draftKey, {
    scope,
    parse: (raw) => {
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
      const merged = { ...saved, ...(raw as Partial<T>) };
      return sanitize ? sanitize(merged) : merged;
    },
  });
  if (!ready) return <div aria-hidden className="h-40" />;
  return <>{children({ initial: draft ?? saved, save, clear })}</>;
}

/** Single choice shown as touch-friendly cards (rite, guests, style). */
export function ChoiceCards<V extends string>({
  legend,
  value,
  onChange,
  options,
  error,
  columns = 1,
  testId,
}: {
  legend: string;
  value: V | null;
  onChange: (value: V) => void;
  options: ReadonlyArray<{ value: V; label: string; hint?: string }>;
  error?: string | undefined;
  columns?: 1 | 2;
  testId?: string;
}) {
  const id = useId();
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={error ? `${id}-error` : undefined}>
      <legend className="sr-only">{legend}</legend>
      <RadioGroup
        value={value ?? ""}
        onValueChange={(next) => onChange(next as V)}
        aria-label={legend}
        className={cn("gap-3", columns === 2 && "sm:grid-cols-2")}
        {...(testId ? { "data-testid": testId } : {})}
      >
        {options.map((option) => {
          const itemId = `${id}-${option.value}`;
          return (
            <Label
              key={option.value}
              htmlFor={itemId}
              className={cn(
                "border-border bg-card hover:bg-muted flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border p-4 font-normal",
                value === option.value && "border-primary border-2",
              )}
            >
              <RadioGroupItem
                id={itemId}
                value={option.value}
                data-testid={`choice-${option.value}`}
              />
              <span className="flex flex-col">
                <span className="font-semibold">{option.label}</span>
                {option.hint ? (
                  <span className="text-muted-foreground text-sm">{option.hint}</span>
                ) : null}
              </span>
            </Label>
          );
        })}
      </RadioGroup>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/** Multi-line text with a visible label and a character counter (style note). */
export function TextArea({
  id,
  label,
  value,
  onChange,
  maxLength,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        name={id}
        rows={3}
        maxLength={maxLength}
        value={value}
        aria-describedby={`${id}-hint`}
        onChange={(event) => onChange(event.target.value)}
        className="border-input bg-background text-foreground focus-visible:ring-ring focus-visible:ring-offset-background flex w-full min-w-0 rounded-md border px-3 py-2 text-base focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      />
      <p id={`${id}-hint`} className="text-muted-foreground text-sm">
        {hint ? `${hint} ` : ""}
        {value.length}/{maxLength}
      </p>
    </div>
  );
}
