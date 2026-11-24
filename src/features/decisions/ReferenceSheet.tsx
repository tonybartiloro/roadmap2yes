"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatLongDate, plural } from "@/components/format";
import type { ActionResult, OptionView } from "./types";

/** "{N} scadenze cambiano" / "Nessuna scadenza cambia" (design §3.8). */
export function changedText(count: number): string {
  if (count === 0) return "Nessuna scadenza cambia.";
  return count === 1 ? "1 scadenza cambia." : `${plural(count, "scadenza", "scadenze")} cambiano.`;
}

/**
 * Confirmation of "Imposta come riferimento" with its consequence (design §3.8, AC24, AC28). The
 * "Annulla" toast that follows lives in the caller, which knows the previous reference.
 */
export function ReferenceSheet({
  open,
  onOpenChange,
  option,
  changedCount,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  option: OptionView;
  changedCount: number;
  onConfirm: () => Promise<ActionResult<unknown>>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scenario = option.scenario;

  async function confirm() {
    setPending(true);
    setError(null);
    const result = await onConfirm();
    setPending(false);
    if (result.ok) onOpenChange(false);
    else setError(result.message);
  }

  const when = scenario
    ? scenario.kind === "period"
      ? `dal ${formatLongDate(scenario.dateFrom)} (primo giorno del periodo)`
      : `sul ${formatLongDate(scenario.dateFrom)}`
    : "su questa data";

  return (
    <Sheet open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <SheetContent side="bottom" className="md:mx-auto md:max-w-lg">
        <SheetHeader>
          <SheetTitle>Imposta come riferimento</SheetTitle>
          <SheetDescription>
            Le scadenze dei compiti si ricalcolano {when}. I compiti già completati o con scadenza
            modificata da te restano come sono. {changedText(changedCount)}
          </SheetDescription>
        </SheetHeader>
        {error ? (
          <p role="alert" className="text-destructive text-base">
            {error}
          </p>
        ) : null}
        <SheetFooter>
          <Button type="button" onClick={confirm} disabled={pending}>
            {pending ? "Un attimo…" : "Imposta come riferimento"}
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
