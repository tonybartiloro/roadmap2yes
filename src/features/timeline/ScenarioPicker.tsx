"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Popover } from "radix-ui";
import { CalendarDays, ChevronDown, MapPin } from "lucide-react";
import { scenarioTitle } from "@/components/DateScenarioList";
import { ReferenceBadge } from "@/components/ReferenceBadge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sheet, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PERCORSO_HREF, previewHref } from "./links";
import { PanelContent } from "./PanelContent";
import { useMediaQuery } from "./use-media-query";
import type { ReferenceView, ScenarioDisplay } from "./view";

const CURRENT = "current";

function PickerList({
  scenarios,
  reference,
  selected,
  onPick,
}: {
  scenarios: readonly ScenarioDisplay[];
  reference: ReferenceView | null;
  selected: string;
  onPick: (value: string) => void;
}) {
  const groupId = useId();
  return (
    <RadioGroup
      value={selected}
      onValueChange={onPick}
      aria-label="Scenario di data"
      className="gap-1"
      data-testid="scenario-picker"
    >
      <div className="flex min-h-11 items-start gap-3 py-1">
        <RadioGroupItem
          id={`${groupId}-current`}
          value={CURRENT}
          data-testid="scenario-option-current"
          className="mt-2"
        />
        <Label
          htmlFor={`${groupId}-current`}
          className="flex flex-1 flex-col gap-1 py-1 text-base font-normal"
        >
          <span className="font-semibold">Riferimento attuale</span>
          <span className="text-muted-foreground text-sm">
            Torna alla vista normale, senza anteprima.
          </span>
        </Label>
      </div>
      {scenarios.map((scenario) => (
        <div key={scenario.optionId} className="flex min-h-11 items-start gap-3 py-1">
          <RadioGroupItem
            id={`${groupId}-${scenario.optionId}`}
            value={scenario.optionId}
            data-testid={`scenario-option-${scenario.optionId}`}
            className="mt-2"
          />
          <Label
            htmlFor={`${groupId}-${scenario.optionId}`}
            className="flex flex-1 flex-col gap-1 py-1 text-base font-normal"
          >
            <span className="font-semibold">
              {scenarioTitle({
                id: scenario.optionId,
                label: scenario.label,
                kind: scenario.kind,
                dateFrom: scenario.dateFrom,
              })}
            </span>
            <span className="tabular-nums">{scenario.dateText}</span>
            {scenario.locationText ? (
              <span className="text-muted-foreground inline-flex items-center gap-1 text-sm">
                <MapPin aria-hidden className="size-4" />
                <span>
                  <span className="sr-only">Location collegata: </span>
                  {scenario.locationText}
                </span>
              </span>
            ) : null}
            {scenario.isReference && reference ? (
              <ReferenceBadge status={reference.status} setBy={reference.setByName} />
            ) : null}
          </Label>
        </div>
      ))}
    </RadioGroup>
  );
}

/**
 * Scenario selector of the Percorso (design §3.8): "Scenario: 3 set 2027 · provvisorio". Choosing
 * another scenario enters the preview through the URL (`?anteprima=<id>`), without writing
 * anything; "Riferimento attuale" goes back to the normal view. Bottom sheet on phones, popover
 * from 768 px. The caller shows it only with the decision open and at least two scenarios.
 */
export function ScenarioPicker({
  scenarios,
  reference,
  previewId,
}: {
  scenarios: readonly ScenarioDisplay[];
  reference: ReferenceView | null;
  previewId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const desktop = useMediaQuery("(min-width: 768px)");
  const shown = previewId ? scenarios.find((s) => s.optionId === previewId) : undefined;
  const current = shown ?? scenarios.find((s) => s.isReference);
  const stateText = shown
    ? "anteprima"
    : reference?.status === "definitive"
      ? "definitivo"
      : "provvisorio";

  function pick(value: string) {
    setOpen(false);
    if (value === CURRENT || scenarios.find((s) => s.optionId === value)?.isReference) {
      router.push(PERCORSO_HREF);
    } else {
      router.push(previewHref(value));
    }
  }

  const list = (
    <PickerList
      scenarios={scenarios}
      reference={reference}
      selected={shown ? shown.optionId : CURRENT}
      onPick={pick}
    />
  );

  const label = `Scenario: ${current ? current.dateText : "scegli"} · ${stateText}`;
  const trigger = (
    <Button
      type="button"
      variant="outline"
      data-testid="scenario-picker-trigger"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={desktop ? undefined : () => setOpen(true)}
      className="h-auto min-h-11 max-w-full justify-between py-2 text-left whitespace-normal"
    >
      <CalendarDays aria-hidden />
      <span className="flex-1">{label}</span>
      <ChevronDown aria-hidden />
    </Button>
  );

  if (desktop) {
    return (
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>{trigger}</Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={6}
            className="bg-card text-foreground border-border z-50 w-96 max-w-[90vw] rounded-lg border p-4 shadow-lg"
          >
            {list}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  }

  return (
    <>
      {trigger}
      <Sheet open={open} onOpenChange={setOpen}>
        <PanelContent>
          <SheetHeader>
            <SheetTitle>Scenario di data</SheetTitle>
            <SheetDescription>
              Scegline uno per vedere come cambierebbero le scadenze. Nulla viene salvato.
            </SheetDescription>
          </SheetHeader>
          {list}
        </PanelContent>
      </Sheet>
    </>
  );
}
