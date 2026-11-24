"use client";

import { useId, useState } from "react";
import { Check, Copy, Dices, Eye, EyeOff, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

// No look-alike characters (0/O, 1/l/I) so a generated code can be read aloud or retyped.
const GENERATED_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Uniform integer in [0, max) from `crypto` (rejection sampling, no modulo bias). */
function randomInt(max: number): number {
  const limit = 2 ** 32 - (2 ** 32 % max);
  const buffer = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buffer);
    const value = buffer[0] ?? 0;
    if (value < limit) return value % max;
  }
}

/** 16 random characters with at least one letter and one digit, from `crypto`. */
export function generateAccessCode(length = 16): string {
  const letters = GENERATED_ALPHABET.replace(/[0-9]/g, "");
  const digits = GENERATED_ALPHABET.replace(/[^0-9]/g, "");
  const pick = (alphabet: string) => alphabet.charAt(randomInt(alphabet.length));
  const chars = [pick(letters), pick(digits)];
  while (chars.length < length) chars.push(pick(GENERATED_ALPHABET));
  // Fisher-Yates, so the guaranteed characters are not always first.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j] as string, chars[i] as string];
  }
  return chars.join("");
}

export interface AccessCodeFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** `new` = choosing a code (policy hints, "Genera"); `current` = typing the existing one. */
  mode?: "new" | "current";
  id?: string;
  name?: string;
  error?: string;
  /** Replaces the default policy hints (T5 `lib/access-code.ts`). */
  policyChecks?: readonly PolicyCheck[];
  /** Replaces the default random generator. */
  generate?: () => string;
  disabled?: boolean;
  className?: string;
}

/**
 * Access code input. Password-manager friendly (`type=password`, `autocomplete` new-password /
 * current-password, a real `name`); paste is allowed; show/hide toggle; hints tell, with icon AND
 * text, which rule is met. "Genera" fills a strong code, reveals it and offers "Copia" (the code is
 * never stored by this component, nor in form drafts).
 */
export function AccessCodeField({
  label,
  value,
  onChange,
  mode = "new",
  id,
  name = "accessCode",
  error,
  policyChecks = DEFAULT_POLICY_CHECKS,
  generate = generateAccessCode,
  disabled,
  className,
}: AccessCodeFieldProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const isNew = mode === "new";
  const describedBy =
    [error ? `${inputId}-error` : null, isNew ? `${inputId}-policy` : null]
      .filter(Boolean)
      .join(" ") || undefined;

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
            {policyChecks.map((check) => {
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
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => {
                onChange(generate());
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
      {error ? (
        <p id={`${inputId}-error`} className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
