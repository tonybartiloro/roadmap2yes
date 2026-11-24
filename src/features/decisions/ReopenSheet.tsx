"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "./form-bits";
import { mapDbError, REASON_MAX } from "./model";
import type { ActionResult } from "./types";

/**
 * Reopening a taken decision with a mandatory reason (AC19): counter, inline error tied to the
 * field. The reason ends up in the history with author and date.
 */
export function ReopenSheet({
  open,
  onOpenChange,
  onConfirm,
  type,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => Promise<ActionResult>;
  type: string;
}) {
  const [reason, setReason] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  const counterId = `${fieldId}-counter`;

  async function confirm() {
    setFormError(null);
    if (reason.trim() === "") {
      setFieldError(mapDbError({ message: "reason_required" }).message);
      return;
    }
    setFieldError(null);
    setPending(true);
    const result = await onConfirm(reason.trim());
    setPending(false);
    if (result.ok) {
      setReason("");
      onOpenChange(false);
    } else if (result.code === "reason_required" || result.code === "reason_too_long") {
      setFieldError(result.message);
    } else {
      setFormError(result.message);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <SheetContent side="bottom" className="md:mx-auto md:max-w-lg">
        <SheetHeader>
          <SheetTitle>Riapri la scelta</SheetTitle>
          <SheetDescription>
            {type === "date"
              ? "Le opzioni tornano in gioco. Lo stesso scenario resta il riferimento, ma provvisorio, finché non scegliete di nuovo."
              : "Le opzioni tornano in gioco. La scelta di prima resta nello storico, con il tuo motivo."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={fieldId} className="text-base leading-6 font-semibold">
            Perché vuoi riaprire questa scelta?
          </label>
          <Textarea
            id={fieldId}
            value={reason}
            maxLength={REASON_MAX}
            required
            aria-required="true"
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={`${counterId}${fieldError ? ` ${errorId}` : ""}`}
            onChange={(event) => {
              setReason(event.target.value);
              if (fieldError) setFieldError(null);
            }}
          />
          <p id={counterId} className="text-muted-foreground text-sm">
            {reason.length}/{REASON_MAX}
          </p>
          {fieldError ? (
            <p id={errorId} className="text-destructive text-sm">
              {fieldError}
            </p>
          ) : null}
        </div>

        {formError ? (
          <p role="alert" className="text-destructive text-base">
            {formError}
          </p>
        ) : null}

        <SheetFooter>
          <Button type="button" onClick={confirm} disabled={pending}>
            {pending ? "Un attimo…" : "Riapri la scelta"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Annulla
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
