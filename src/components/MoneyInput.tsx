"use client";

import { useId, useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Result of parsing an amount typed by a person. T5 (`lib/money.ts`) provides the real parser. */
export type MoneyParseResult = { ok: true; cents: number } | { ok: false };
export type MoneyParser = (text: string) => MoneyParseResult;

export interface MoneyInputProps extends Omit<
  ComponentProps<"input">,
  "value" | "onChange" | "type" | "inputMode" | "id"
> {
  label: string;
  /** Text as typed (the field is controlled so partial input like "1.5" is never rewritten). */
  value: string;
  onValueChange: (text: string, cents: number | null) => void;
  /** Turns the text into integer cents. Never `parseFloat * 100`. */
  parse: MoneyParser;
  /** Error from outside (server). The field shows its own invalid-format error after blur. */
  error?: string;
  hint?: string;
  id?: string;
  invalidMessage?: string;
}

export const MONEY_INVALID_MESSAGE = "Inserisci un importo in euro, ad esempio 1.500,00.";

/**
 * Euro amount field (it-IT): `inputmode="decimal"`, 16 px text, visible label, error tied with
 * `aria-describedby`. UI only: parsing rules and caps live in `lib/money.ts`.
 */
export function MoneyInput({
  label,
  value,
  onValueChange,
  parse,
  error,
  hint,
  id,
  invalidMessage = MONEY_INVALID_MESSAGE,
  className,
  onBlur,
  ...rest
}: MoneyInputProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const [touched, setTouched] = useState(false);
  const parsed = value.trim() === "" ? null : parse(value);
  const formatError = touched && parsed !== null && !parsed.ok ? invalidMessage : undefined;
  const message = error ?? formatError;
  const describedBy =
    [message ? `${inputId}-error` : null, hint ? `${inputId}-hint` : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={inputId}>{label}</Label>
      <div className="relative">
        <span
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute inset-y-0 left-3 flex items-center"
        >
          €
        </span>
        <Input
          {...rest}
          id={inputId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          className="pl-8 tabular-nums"
          value={value}
          aria-invalid={message ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => {
            const text = event.target.value;
            const result = text.trim() === "" ? null : parse(text);
            onValueChange(text, result && result.ok ? result.cents : null);
          }}
          onBlur={(event) => {
            setTouched(true);
            onBlur?.(event);
          }}
        />
      </div>
      {hint ? (
        <p id={`${inputId}-hint`} className="text-muted-foreground text-sm">
          {hint}
        </p>
      ) : null}
      {message ? (
        <p id={`${inputId}-error`} className="text-destructive text-sm">
          {message}
        </p>
      ) : null}
    </div>
  );
}
