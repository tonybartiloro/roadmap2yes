"use client";

import Link from "next/link";
import { Popover } from "radix-ui";
import { CircleHelp } from "lucide-react";
import { formatShortDate } from "@/components/format";
import { ReferenceBadge } from "@/components/ReferenceBadge";
import { Button } from "@/components/ui/button";
import { COPY } from "./copy";
import type { Filters, AssigneeFilter } from "./filters";
import { AssigneeShortcut, FiltersPanel } from "./FiltersPanel";
import { DATE_DECISION_HREF } from "./links";
import { ScenarioPicker } from "./ScenarioPicker";
import type { PercorsoView } from "./view";

/** The "Cos'è?" help next to the badge (design §3.8): four concepts in plain words. */
function ReferenceHelp({ nearest }: { nearest: boolean }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button type="button" variant="ghost" size="sm" data-testid="reference-help">
          <CircleHelp aria-hidden />
          Cos&apos;è?
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="bg-card text-foreground border-border z-50 w-80 max-w-[90vw] rounded-lg border p-4 text-base shadow-lg"
        >
          <dl className="flex flex-col gap-2">
            <div>
              <dt className="font-semibold">Riferimento</dt>
              <dd>La data su cui il Percorso calcola le scadenze.</dd>
            </div>
            <div>
              <dt className="font-semibold">Provvisorio</dt>
              <dd>Finché la data non è scelta.</dd>
            </div>
            <div>
              <dt className="font-semibold">Definitivo</dt>
              <dd>Dopo che la coppia ha scelto la data.</dd>
            </div>
            <div>
              <dt className="font-semibold">Anteprima</dt>
              <dd>
                Guardare come cambierebbero le scadenze con un altro scenario, senza salvare nulla.
              </dd>
            </div>
          </dl>
          {nearest ? (
            <p className="text-muted-foreground mt-2 text-sm">{COPY.nearestExplanation}</p>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Status line of the reference: "Scadenze calcolate sul 3 set 2027" (a period: "dal 1 mag 2028"). */
export function referenceLine(view: PercorsoView): string | null {
  const reference = view.reference;
  if (!reference) return null;
  const { scenario } = reference;
  return scenario.kind === "period"
    ? `Scadenze calcolate dal ${formatShortDate(scenario.dateFrom)} (primo giorno del periodo)`
    : `Scadenze calcolate sul ${scenario.dateText}`;
}

/**
 * Header of the Percorso (design §3.4): title, reference status with badge and linked location,
 * scenario selector (only with the decision open and ≥ 2 scenarios), filters with counter and
 * the "Miei / di {partner} / Tutti" shortcut.
 */
export function PercorsoHeader({
  view,
  filters,
  onFiltersChange,
  partnerName,
  previewId,
  matchCount,
}: {
  view: PercorsoView;
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  partnerName: string;
  previewId: string | null;
  matchCount: number;
}) {
  const { reference } = view;
  const line = referenceLine(view);
  return (
    <header className="flex flex-col gap-3" data-testid="percorso-header">
      <h1 id="percorso-title" tabIndex={-1} className="text-[28px] leading-[34px]">
        Percorso
      </h1>

      {reference ? (
        <div className="flex flex-col gap-2" data-testid="reference-status">
          <p className="text-base">{line}</p>
          <div className="flex flex-wrap items-center gap-1">
            <ReferenceBadge
              status={reference.status}
              setBy={reference.source === "manual" ? reference.setByName : null}
              locationName={reference.scenario.locationText}
            />
            <ReferenceHelp nearest={reference.source === "automatic" && view.pickerAvailable} />
          </div>
          {view.decisionTaken ? (
            <p className="text-muted-foreground text-sm">{COPY.decisionTakenExplanation}</p>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2" data-testid="reference-status">
          <p className="text-muted-foreground text-base">{COPY.noScenario}</p>
          <Button asChild variant="outline">
            <Link href={DATE_DECISION_HREF}>{COPY.addFirstScenario}</Link>
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {view.pickerAvailable ? (
          <ScenarioPicker
            scenarios={view.pickerScenarios}
            reference={reference}
            previewId={view.preview ? previewId : null}
          />
        ) : null}
        <FiltersPanel
          filters={filters}
          onChange={onFiltersChange}
          partnerName={partnerName}
          matchCount={matchCount}
        />
        <AssigneeShortcut
          value={filters.assignee}
          onChange={(assignee: AssigneeFilter) => onFiltersChange({ ...filters, assignee })}
          partnerName={partnerName}
        />
      </div>
    </header>
  );
}
