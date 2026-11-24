"use client";

import { Plus, Trash2, TriangleAlert } from "lucide-react";
import { DateField } from "@/components/DateField";
import { MonthYearField } from "@/components/MonthYearField";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { isPlainDate, type PlainDate } from "@/lib/dates/plain-date";
import {
  DEFAULT_SCENARIO_DATE,
  MAX_SCENARIOS,
  SOFT_MIN_MESSAGE,
  monthYearOf,
  newScenarioId,
  periodBounds,
  periodYearRange,
  scenarioProblem,
  type ScenarioDraft,
} from "./model";
import { TextField } from "./PersonForm";

/**
 * One or more date scenarios, each a fixed date or a period (month/year to month/year) with an
 * optional label (design §3.2, step 4). A date before 3 Sep 2027 only gets a non-blocking notice.
 * A scenario can be linked to a location later (Scelte): at this point no location exists yet.
 */
export function ScenarioEditor({
  scenarios,
  onChange,
  today,
  showProblems,
}: {
  scenarios: readonly ScenarioDraft[];
  onChange: (next: ScenarioDraft[]) => void;
  today: PlainDate;
  /** Show the inline problems (after a failed "Continua"). */
  showProblems: boolean;
}) {
  const { minYear, maxYear } = periodYearRange(today);
  const update = (id: string, patch: Partial<ScenarioDraft>) =>
    onChange(scenarios.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  return (
    <div className="flex flex-col gap-4" data-testid="scenario-editor">
      {scenarios.length === 0 ? (
        <p className="text-muted-foreground" data-testid="scenario-empty">
          Nessuna data per ora: va benissimo, la sceglierete più avanti.
        </p>
      ) : null}
      <ul className="flex flex-col gap-4">
        {scenarios.map((scenario, index) => {
          const problem = showProblems ? scenarioProblem(scenario) : null;
          const kindId = `scenario-${scenario.id}-kind`;
          return (
            <li
              key={scenario.id}
              className="border-border bg-card flex flex-col gap-4 rounded-lg border p-4"
              data-testid="scenario-item"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">Scenario {index + 1}</h2>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onChange(scenarios.filter((item) => item.id !== scenario.id))}
                  data-testid="scenario-remove"
                >
                  <Trash2 aria-hidden className="size-4" />
                  Togli
                  <span className="sr-only"> lo scenario {index + 1}</span>
                </Button>
              </div>

              <RadioGroup
                value={scenario.kind}
                onValueChange={(kind) => {
                  if (kind === "fixed") {
                    update(scenario.id, { kind: "fixed", dateTo: null });
                  } else {
                    const from = monthYearOf(
                      isPlainDate(scenario.dateFrom) ? scenario.dateFrom : DEFAULT_SCENARIO_DATE,
                    );
                    const bounds = periodBounds(from, from);
                    update(scenario.id, {
                      kind: "period",
                      dateFrom: bounds.dateFrom,
                      dateTo: bounds.dateTo,
                    });
                  }
                }}
                aria-label={`Tipo di data dello scenario ${index + 1}`}
                className="grid-cols-2"
              >
                {(
                  [
                    ["fixed", "Data fissa"],
                    ["period", "Periodo"],
                  ] as const
                ).map(([value, text]) => (
                  <div key={value} className="flex min-h-11 items-center gap-2">
                    <RadioGroupItem
                      id={`${kindId}-${value}`}
                      value={value}
                      data-testid={`scenario-kind-${value}`}
                    />
                    <Label htmlFor={`${kindId}-${value}`} className="font-normal">
                      {text}
                    </Label>
                  </div>
                ))}
              </RadioGroup>

              {scenario.kind === "fixed" ? (
                <DateField
                  label="Data"
                  value={scenario.dateFrom}
                  onChange={(value) => update(scenario.id, { dateFrom: value })}
                  softMin={DEFAULT_SCENARIO_DATE}
                  softMinMessage={SOFT_MIN_MESSAGE}
                  error={problem ?? undefined}
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <MonthYearField
                    legend="Da"
                    value={monthYearOf(scenario.dateFrom)}
                    minYear={minYear}
                    maxYear={maxYear}
                    onChange={(from) => {
                      if (!from) return;
                      const to = monthYearOf(scenario.dateTo ?? scenario.dateFrom);
                      const bounds = periodBounds(from, to);
                      update(scenario.id, { dateFrom: bounds.dateFrom, dateTo: bounds.dateTo });
                    }}
                  />
                  <MonthYearField
                    legend="A"
                    value={monthYearOf(scenario.dateTo ?? scenario.dateFrom)}
                    minYear={minYear}
                    maxYear={maxYear}
                    onChange={(to) => {
                      if (!to) return;
                      const bounds = periodBounds(monthYearOf(scenario.dateFrom), to);
                      update(scenario.id, { dateFrom: bounds.dateFrom, dateTo: bounds.dateTo });
                    }}
                    error={problem ?? undefined}
                  />
                  {scenario.dateFrom < DEFAULT_SCENARIO_DATE ? (
                    <p
                      className="text-warning flex items-start gap-1.5 text-sm sm:col-span-2"
                      data-testid="scenario-soft-warning"
                    >
                      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                      <span>{SOFT_MIN_MESSAGE}</span>
                    </p>
                  ) : null}
                </div>
              )}

              <TextField
                id={`scenario-${scenario.id}-label`}
                label="Etichetta (facoltativa)"
                value={scenario.label ?? ""}
                onChange={(label) => update(scenario.id, { label: label === "" ? null : label })}
                hint="Ad esempio «Se la location è libera»."
              />
            </li>
          );
        })}
      </ul>
      {scenarios.length < MAX_SCENARIOS ? (
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              onChange([
                ...scenarios,
                {
                  id: newScenarioId(),
                  kind: "fixed",
                  dateFrom: DEFAULT_SCENARIO_DATE,
                  dateTo: null,
                  label: null,
                },
              ])
            }
            data-testid="scenario-add"
          >
            <Plus aria-hidden className="size-5" />
            Aggiungi un altro scenario
          </Button>
        </div>
      ) : null}
    </div>
  );
}
