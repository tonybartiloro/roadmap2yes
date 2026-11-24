"use client";

import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { labelChoiceOf, labelFromChoice, type LabelChoice } from "./model";

/** A person card: label (sposo / sposa / free text / none), first name, last name, and the email. No date of birth (AC46). */
export interface PersonValue {
  firstName: string;
  lastName: string;
  labelChoice: LabelChoice;
  customLabel: string;
}

export function personValueOf(person: {
  firstName: string | null;
  lastName: string | null;
  label: string | null;
}): PersonValue {
  const choice = labelChoiceOf(person.label);
  return {
    firstName: person.firstName ?? "",
    lastName: person.lastName ?? "",
    labelChoice: choice,
    customLabel: choice === "custom" ? (person.label ?? "") : "",
  };
}

export function labelOf(value: PersonValue): string | null {
  return labelFromChoice(value.labelChoice, value.customLabel);
}

const LABEL_OPTIONS: ReadonlyArray<{ value: LabelChoice; text: string }> = [
  { value: "sposo", text: "Sposo" },
  { value: "sposa", text: "Sposa" },
  { value: "custom", text: "Altro: scrivi tu" },
  { value: "none", text: "Nessuna" },
];

export type EmailMode =
  | { kind: "readonly"; value: string; hint?: string }
  | {
      kind: "editable";
      value: string;
      onChange: (value: string) => void;
      error?: string | undefined;
      hint?: string;
    };

export function TextField({
  id,
  name,
  label,
  value,
  onChange,
  error,
  hint,
  type = "text",
  required,
  autoComplete = "off",
  readOnly,
  disabled,
}: {
  id: string;
  /** Form field name (defaults to the id). */
  name?: string;
  label: string;
  value: string;
  onChange?: (value: string) => void;
  error?: string | undefined;
  hint?: ReactNode;
  type?: "text" | "email";
  required?: boolean;
  autoComplete?: string;
  readOnly?: boolean;
  disabled?: boolean;
}) {
  const describedBy =
    [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") ||
    undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name ?? id}
        type={type}
        inputMode={type === "email" ? "email" : undefined}
        autoComplete={autoComplete}
        autoCapitalize={type === "email" ? "none" : undefined}
        autoCorrect="off"
        spellCheck={false}
        required={required}
        readOnly={readOnly}
        disabled={disabled}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event) => onChange?.(event.target.value)}
      />
      {hint ? (
        <p id={`${id}-hint`} className="text-muted-foreground text-sm">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Used by the onboarding (steps 1 and 2) and by Profili. The email is shown read-only when it is the
 * login of the person (or of a partner who has joined) and editable only where AC58 allows it.
 */
export function PersonForm({
  idPrefix,
  value,
  onChange,
  email,
  firstNameError,
  firstNameRequired = false,
  labelLegend = "Come vuoi essere chiamato?",
  disabled,
  className,
}: {
  idPrefix: string;
  value: PersonValue;
  onChange: (value: PersonValue) => void;
  email?: EmailMode;
  firstNameError?: string | undefined;
  firstNameRequired?: boolean;
  /** Question above the label choices ("Come lo chiami?" for the partner). */
  labelLegend?: string;
  disabled?: boolean;
  className?: string;
}) {
  const set = (patch: Partial<PersonValue>) => onChange({ ...value, ...patch });
  return (
    <div className={cn("flex flex-col gap-5", className)} data-testid={`${idPrefix}-person`}>
      {email ? (
        email.kind === "readonly" ? (
          <TextField
            id={`${idPrefix}-email`}
            label="Email"
            type="email"
            value={email.value}
            readOnly
            {...(email.hint ? { hint: email.hint } : {})}
          />
        ) : (
          <TextField
            id={`${idPrefix}-email`}
            label="Email"
            type="email"
            required
            autoComplete="off"
            value={email.value}
            onChange={email.onChange}
            error={email.error}
            disabled={disabled}
            {...(email.hint ? { hint: email.hint } : {})}
          />
        )
      ) : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          id={`${idPrefix}-first-name`}
          label="Nome"
          autoComplete="off"
          required={firstNameRequired}
          value={value.firstName}
          onChange={(firstName) => set({ firstName })}
          error={firstNameError}
          disabled={disabled}
        />
        <TextField
          id={`${idPrefix}-last-name`}
          label="Cognome"
          autoComplete="off"
          value={value.lastName}
          onChange={(lastName) => set({ lastName })}
          disabled={disabled}
        />
      </div>
      <fieldset className="flex flex-col gap-2" disabled={disabled}>
        <legend className="text-base leading-6 font-semibold">{labelLegend}</legend>
        <RadioGroup
          value={value.labelChoice}
          onValueChange={(choice) => set({ labelChoice: choice as LabelChoice })}
          aria-label={labelLegend}
        >
          {LABEL_OPTIONS.map((option) => (
            <div key={option.value} className="flex min-h-11 items-center gap-3">
              <RadioGroupItem
                id={`${idPrefix}-label-${option.value}`}
                value={option.value}
                data-testid={`${idPrefix}-label-${option.value}`}
              />
              <Label htmlFor={`${idPrefix}-label-${option.value}`} className="font-normal">
                {option.text}
              </Label>
            </div>
          ))}
        </RadioGroup>
        {value.labelChoice === "custom" ? (
          <TextField
            id={`${idPrefix}-label-custom`}
            label="Scrivi come ti chiami tu (ad esempio «sposina»)"
            value={value.customLabel}
            onChange={(customLabel) => set({ customLabel })}
          />
        ) : null}
        <p className="text-muted-foreground text-sm">
          Nell&apos;app useremo il nome; l&apos;etichetta serve dove il nome manca.
        </p>
      </fieldset>
    </div>
  );
}
