"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Copy, Dices, Eye, EyeOff, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generateAccessCode, validateAccessCode, type AccessCodeSubject } from "@/lib/access-code";
import { cn } from "@/lib/utils";

export interface PolicyCheck {
  id: string;
  label: string;
  test: (value: string) => boolean;
}

/** Policy hints enforced by Supabase Auth (min 10, letters + digits). T5 may pass its own checks. */
export const DEFAULT_POLICY_CHECKS: readonly PolicyCheck[] = [
  { id: "length", label: "Almeno 10 caratteri", test: (value) => value.length >= 10 },
  {
    id: "letters-digits",
    label: "Lettere e cifre",
    test: (value) => /\p{L}/u.test(value) && /\d/.test(value),
  },
];

export interface AccessCodeFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** `new` = choosing a code (policy hints, "Genera"); `current` = typing the existing one. */
  mode?: "new" | "current";
  id?: string;
  name?: string;
  error?: string;
  /** Whom the code is for: codes containing their name or email are refused (`lib/access-code.ts`). */
  subject?: AccessCodeSubject;
  disabled?: boolean;
  className?: string;
}

/**
 * Access code input. Password-manager friendly (`type=password`, `autocomplete` new-password /
 * current-password, a real `name`); paste is allowed; show/hide toggle; hints tell, with icon AND
 * text, which rule is met. "Genera" fills a strong code, reveals it and offers "Copia" (the code is
 * shown once and never stored by this component, nor in form drafts).
 */
export function AccessCodeField({
  label,
  value,
  onChange,
  mode = "new",
  id,
  name = "accessCode",
  error,
  subject,
  disabled,
  className,
}: AccessCodeFieldProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const isNew = mode === "new";
  // Length and letters+digits are shown as ticks; the weak-list / personal-data rules only speak
  // once the basic ones hold, with the message of `lib/access-code.ts`.
  const verdict = isNew && value ? validateAccessCode(value, subject) : null;
  const extraHint =
    verdict && !verdict.ok && (verdict.code === "weak" || verdict.code === "personal")
      ? verdict.message
      : null;
  const describedBy =
    [error ? `${inputId}-error` : null, isNew ? `${inputId}-policy` : null]
      .filter(Boolean)
      .join(" ") || undefined;

  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable: the code is visible and selectable
    }
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={inputId}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={inputId}
          name={name}
          type={visible ? "text" : "password"}
          value={value}
          disabled={disabled}
          autoComplete={isNew ? "new-password" : "current-password"}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={disabled}
          aria-pressed={visible}
          aria-label={visible ? "Nascondi il codice" : "Mostra il codice"}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? (
            <EyeOff aria-hidden className="size-5" />
          ) : (
            <Eye aria-hidden className="size-5" />
          )}
        </Button>
      </div>
      {isNew ? (
        <>
          <ul
            id={`${inputId}-policy`}
            className="text-muted-foreground flex flex-col gap-1 text-sm"
          >
            {DEFAULT_POLICY_CHECKS.map((check) => {
              const met = check.test(value);
              return (
                <li
                  key={check.id}
                  className={cn("flex items-center gap-1.5", met && "text-foreground")}
                >
                  {met ? (
                    <Check aria-hidden className="text-success size-4" />
                  ) : (
                    <Circle aria-hidden className="size-4" />
                  )}
                  <span>
                    {check.label}
                    <span className="sr-only">{met ? ": ok" : ": non ancora"}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          {extraHint ? (
            <p role="status" className="text-warning text-sm">
              {extraHint}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => {
                onChange(generateAccessCode());
                setVisible(true);
                setCopied(false);
              }}
            >
              <Dices aria-hidden className="size-5" />
              Genera
            </Button>
            {value ? (
              <Button type="button" variant="outline" disabled={disabled} onClick={copy}>
                <Copy aria-hidden className="size-5" />
                {copied ? "Copiato" : "Copia"}
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {copied ? "Codice copiato" : ""}
      </p>
      {error ? (
        <p id={`${inputId}-error`} className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
