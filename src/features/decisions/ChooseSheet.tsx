"use client";

import { useState } from "react";
import { DateField } from "@/components/DateField";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { scenarioDateText } from "@/components/DateScenarioList";
import type { PlainDate } from "@/lib/dates/plain-date";
import type { ActionResult, OptionView } from "./types";

const EXACT_DATE_FIELD_CODES = new Set(["exact_date_required", "exact_date_out_of_period"]);

/**
 * Confirmation of a choice with its consequence (AC18, design §3.5). For a period the day is asked
 * here (AC64, D33): the scenario becomes a fixed date and the history keeps the period.
 * Mount with `key={option.id}` so the form starts clean for each option.
 */
export function ChooseSheet({
  open,
  onOpenChange,
  option,
  type,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  option: OptionView;
  type: string;
  onConfirm: (exactDate: PlainDate | null) => Promise<ActionResult<unknown>>;
}) {
  const period = option.scenario?.kind === "period" ? option.scenario : null;
  const [date, setDate] = useState<PlainDate | "">("");
  const [dateError, setDateError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function confirm() {
    setFormError(null);
    setDateError(undefined);
    if (period) {
      if (date === "") {
        setDateError("Indica il giorno esatto dentro il periodo.");
        return;
      }
      if (date < period.dateFrom || (period.dateTo && date > period.dateTo)) {
        setDateError("Il giorno deve cadere dentro il periodo.");
        return;
      }
    }
    setPending(true);
    const result = await onConfirm(period ? (date as PlainDate) : null);
    setPending(false);
    if (result.ok) {
      onOpenChange(false);
    } else if (EXACT_DATE_FIELD_CODES.has(result.code)) {
      setDateError(result.message);
    } else {
      setFormError(result.message);
    }
  }

  const isDate = type === "date";
  return (
    <Sheet open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <SheetContent side="bottom" className="md:mx-auto md:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isDate ? "Scegli questa data" : `Scegli «${option.title}»`}</SheetTitle>
          <SheetDescription>
            {isDate
              ? "Le scadenze del Percorso si calcoleranno su questa data."
              : "Le altre opzioni restano visibili tra le scartate. Potrai riaprire la scelta quando vuoi."}
          </SheetDescription>
        </SheetHeader>

        <p className="font-semibold break-words">
          {option.title}
          {option.scenario ? (
            <span className="text-muted-foreground block font-normal tabular-nums">
              {scenarioDateText({
                id: option.id,
                label: option.title,
                kind: option.scenario.kind,
                dateFrom: option.scenario.dateFrom,
                ...(option.scenario.dateTo ? { dateTo: option.scenario.dateTo } : {}),
              })}
            </span>
          ) : null}
        </p>

        {period ? (
          <DateField
            label="Giorno esatto"
            value={date}
            onChange={(next) => {
              setDate(next);
              setDateError(undefined);
            }}
            min={period.dateFrom}
            {...(period.dateTo ? { max: period.dateTo } : {})}
            {...(dateError ? { error: dateError } : {})}
            hint="Scegli il giorno dentro il periodo: la data diventa fissa e il periodo resta nello storico."
          />
        ) : null}

        {formError ? (
          <p role="alert" className="text-destructive text-base">
            {formError}
          </p>
        ) : null}

        <SheetFooter>
          <Button type="button" onClick={confirm} disabled={pending}>
            {pending ? "Un attimo…" : "Conferma la scelta"}
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
