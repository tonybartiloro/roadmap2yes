"use client";

import { useState } from "react";
import { ConflictDialog, type FieldLabels } from "@/components/ConflictDialog";
import { scenarioDateText } from "@/components/DateScenarioList";
import { DateField } from "@/components/DateField";
import { MoneyInput } from "@/components/MoneyInput";
import { MonthYearField } from "@/components/MonthYearField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { PlainDate } from "@/lib/dates/plain-date";
import {
  DATE_OPTION_FIELD_LABELS,
  formatConflictValue,
  OPTION_FIELD_LABELS,
  SCENARIO_FIELD_LABELS,
} from "./field-labels";
import { Field, NativeSelect, Textarea } from "./form-bits";
import {
  defaultScenarioTitle,
  DESIRED_DATE,
  earlierThanDesired,
  EARLIER_THAN_DESIRED,
  EMPTY_OPTION_FORM,
  optionToFormValues,
  parseOptionForm,
  parseScenarioForm,
  scenarioToFormValues,
  type FormErrors,
  type OptionFormField,
  type OptionFormValues,
  type ScenarioFormValues,
} from "./model";
import type {
  ActionResult,
  ConflictInfo,
  LocationChoice,
  OptionInput,
  OptionView,
  ScenarioInput,
  VersionedResult,
} from "./types";

export interface OptionFormApi {
  addOption(input: {
    decisionId: string;
    option: OptionInput;
    scenario: ScenarioInput | null;
  }): Promise<ActionResult<{ optionId: string }>>;
  updateOption(input: {
    optionId: string;
    version: number;
    option: OptionInput;
  }): Promise<VersionedResult>;
  updateScenario(input: {
    scenarioId: string;
    version: number;
    scenario: ScenarioInput;
    locationOnly?: boolean;
  }): Promise<VersionedResult>;
}

type Step =
  | { entity: "option"; optionId: string; version: number; option: OptionInput }
  | {
      entity: "scenario";
      scenarioId: string;
      version: number;
      scenario: ScenarioInput;
      locationOnly: boolean;
    };

interface PendingConflict {
  steps: Step[];
  info: ConflictInfo;
}

const EMPTY_SCENARIO: ScenarioFormValues = {
  kind: "fixed",
  date: "",
  from: null,
  to: null,
  locationId: "",
};

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sameOption(option: OptionView, input: OptionInput): boolean {
  return (
    option.title === input.title &&
    option.comune === input.comune &&
    option.link === input.link &&
    option.notes === input.notes &&
    option.costCents === input.costCents &&
    sameList(option.pros, input.pros) &&
    sameList(option.cons, input.cons)
  );
}

function sameScenario(option: OptionView, input: ScenarioInput): boolean {
  const s = option.scenario;
  return (
    !!s &&
    s.kind === input.kind &&
    s.dateFrom === input.dateFrom &&
    s.dateTo === input.dateTo &&
    s.locationOptionId === input.locationOptionId
  );
}

/**
 * Add or edit an option (AC17, AC60): a location with name, comune, link, notes, pros/cons and an
 * optional indicative cost, or a date (fixed or period) optionally linked to a candidate location.
 * Editing uses optimistic concurrency: a newer version opens the conflict dialog (AC40) and
 * nothing is overwritten silently. Mount with `key` so the fields start from the right values.
 */
export function OptionFormSheet({
  open,
  onOpenChange,
  decision,
  option,
  locationChoices,
  partnerName,
  api,
  onSaved,
  onStale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  decision: { id: string; type: string; status: "open" | "taken" };
  /** `null` to add a new one. */
  option: OptionView | null;
  locationChoices: readonly LocationChoice[];
  partnerName: string;
  api: OptionFormApi;
  onSaved: (message: string) => void;
  /** The other version must be reloaded (conflict cancelled). */
  onStale: () => void;
}) {
  const isDate = decision.type === "date";
  const editing = option !== null;
  const dateLocked = editing && isDate && decision.status === "taken";

  const [values, setValues] = useState<OptionFormValues>(
    option ? optionToFormValues(option) : EMPTY_OPTION_FORM,
  );
  const [scenario, setScenario] = useState<ScenarioFormValues>(
    option?.scenario ? scenarioToFormValues(option.scenario) : EMPTY_SCENARIO,
  );
  const [errors, setErrors] = useState<FormErrors<OptionFormField | "date" | "period">>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState<PendingConflict | null>(null);

  const setField = (field: OptionFormField, value: string) =>
    setValues((current) => ({ ...current, [field]: value }));

  async function exec(step: Step): Promise<VersionedResult> {
    return step.entity === "option"
      ? api.updateOption({ optionId: step.optionId, version: step.version, option: step.option })
      : api.updateScenario({
          scenarioId: step.scenarioId,
          version: step.version,
          scenario: step.scenario,
          locationOnly: step.locationOnly,
        });
  }

  async function run(steps: Step[]) {
    setPending(true);
    setFormError(null);
    for (const [index, step] of steps.entries()) {
      const result = await exec(step);
      if (result.ok) continue;
      setPending(false);
      if (result.code === "conflict" && "conflict" in result) {
        setConflict({ steps: steps.slice(index), info: result.conflict });
      } else {
        setFormError(result.message);
      }
      return;
    }
    setPending(false);
    onSaved("Modifiche salvate.");
    onOpenChange(false);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const optionForm = parseOptionForm(
      isDate ? { ...EMPTY_OPTION_FORM, title: values.title, notes: values.notes } : values,
      !isDate,
    );
    const scenarioForm = isDate && !dateLocked ? parseScenarioForm(scenario) : null;
    const nextErrors: FormErrors<OptionFormField | "date" | "period"> = {
      ...(optionForm.ok ? {} : optionForm.errors),
      ...(scenarioForm && !scenarioForm.ok ? scenarioForm.errors : {}),
    };
    if (Object.keys(nextErrors).length > 0 || !optionForm.ok) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});

    const locationOptionId = scenario.locationId === "" ? null : scenario.locationId;
    let scenarioInput: ScenarioInput | null = null;
    if (isDate) {
      if (scenarioForm && scenarioForm.ok) scenarioInput = scenarioForm.input;
      else if (option?.scenario) {
        scenarioInput = {
          kind: option.scenario.kind,
          dateFrom: option.scenario.dateFrom,
          dateTo: option.scenario.dateTo,
          locationOptionId,
        };
      }
    }

    if (!editing) {
      setPending(true);
      const title =
        optionForm.input.title === "" && scenarioInput
          ? defaultScenarioTitle(scenarioInput)
          : optionForm.input.title;
      const result = await api.addOption({
        decisionId: decision.id,
        option: { ...optionForm.input, title },
        scenario: scenarioInput,
      });
      setPending(false);
      if (result.ok) {
        onSaved(isDate ? "Data aggiunta." : "Opzione aggiunta.");
        onOpenChange(false);
      } else {
        setFormError(result.message);
      }
      return;
    }

    // Editing: one step per changed row, never a write for an untouched one.
    const steps: Step[] = [];
    const nextOption: OptionInput = isDate
      ? {
          title:
            optionForm.input.title === "" && scenarioInput
              ? defaultScenarioTitle(scenarioInput)
              : optionForm.input.title,
          comune: option.comune,
          link: option.link,
          notes: optionForm.input.notes,
          pros: option.pros,
          cons: option.cons,
          costCents: option.costCents,
        }
      : optionForm.input;
    if (!sameOption(option, nextOption)) {
      steps.push({
        entity: "option",
        optionId: option.id,
        version: option.version,
        option: nextOption,
      });
    }
    if (isDate && option.scenario && scenarioInput && !sameScenario(option, scenarioInput)) {
      steps.push({
        entity: "scenario",
        scenarioId: option.scenario.id,
        version: option.scenario.version,
        scenario: scenarioInput,
        locationOnly: dateLocked,
      });
    }
    if (steps.length === 0) {
      onOpenChange(false);
      return;
    }
    await run(steps);
  }

  const conflictFirst = conflict?.steps[0];
  const conflictLabels: FieldLabels =
    conflictFirst?.entity === "scenario"
      ? SCENARIO_FIELD_LABELS
      : isDate
        ? DATE_OPTION_FIELD_LABELS
        : OPTION_FIELD_LABELS;

  function conflictMine(): Record<string, unknown> {
    if (!conflictFirst) return {};
    return conflictFirst.entity === "option"
      ? { ...conflictFirst.option }
      : {
          kind: conflictFirst.scenario.kind,
          dateFrom: conflictFirst.scenario.dateFrom,
          dateTo: conflictFirst.scenario.dateTo,
          locationOptionId: conflictFirst.scenario.locationOptionId,
        };
  }

  const currentVersion = conflict?.info.current?.["version"];
  const periodPreview = scenario.kind === "period" ? parseScenarioForm(scenario) : null;

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
        <SheetContent side="bottom" className="md:mx-auto md:max-w-xl">
          <SheetHeader>
            <SheetTitle>
              {editing ? "Modifica" : isDate ? "Aggiungi una data" : "Aggiungi un'opzione"}
            </SheetTitle>
            <SheetDescription>
              {isDate
                ? "Una data fissa o un periodo. Puoi collegarla a una location candidata."
                : "Pochi campi bastano: potrai completare il resto più avanti."}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            {Object.keys(errors).length > 0 ? (
              <p role="alert" className="text-destructive text-base">
                Controlla i campi segnati: ce n&apos;è almeno uno da sistemare.
              </p>
            ) : null}

            {isDate ? (
              <>
                {dateLocked && option?.scenario ? (
                  <div className="flex flex-col gap-1">
                    <p className="font-semibold tabular-nums">
                      {scenarioDateText({
                        id: option.id,
                        label: option.title,
                        kind: option.scenario.kind,
                        dateFrom: option.scenario.dateFrom,
                        ...(option.scenario.dateTo ? { dateTo: option.scenario.dateTo } : {}),
                      })}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      La data è scelta: per cambiarla riapri la scelta. Puoi ancora cambiare la
                      location collegata.
                    </p>
                  </div>
                ) : (
                  <>
                    <fieldset className="flex flex-col gap-2">
                      <legend className="text-base leading-6 font-semibold">
                        Che tipo di data?
                      </legend>
                      <RadioGroup
                        value={scenario.kind}
                        onValueChange={(kind) =>
                          setScenario((current) => ({
                            ...current,
                            kind: kind as "fixed" | "period",
                          }))
                        }
                        className="grid-cols-2"
                      >
                        {(
                          [
                            ["fixed", "Data fissa"],
                            ["period", "Periodo"],
                          ] as const
                        ).map(([kind, label]) => (
                          <div key={kind} className="flex min-h-11 items-center gap-2">
                            <RadioGroupItem value={kind} id={`kind-${kind}`} />
                            <Label htmlFor={`kind-${kind}`}>{label}</Label>
                          </div>
                        ))}
                      </RadioGroup>
                    </fieldset>
                    {scenario.kind === "fixed" ? (
                      <DateField
                        label="Data"
                        value={scenario.date}
                        onChange={(date: PlainDate | "") =>
                          setScenario((current) => ({ ...current, date }))
                        }
                        softMin={DESIRED_DATE}
                        softMinMessage={EARLIER_THAN_DESIRED}
                        {...(errors.date ? { error: errors.date } : {})}
                      />
                    ) : (
                      <>
                        <MonthYearField
                          legend="Dal mese"
                          value={scenario.from}
                          onChange={(from) => setScenario((current) => ({ ...current, from }))}
                          minYear={new Date().getFullYear()}
                          maxYear={new Date().getFullYear() + 8}
                          {...(errors.period ? { error: errors.period } : {})}
                        />
                        <MonthYearField
                          legend="Al mese"
                          value={scenario.to}
                          onChange={(to) => setScenario((current) => ({ ...current, to }))}
                          minYear={new Date().getFullYear()}
                          maxYear={new Date().getFullYear() + 8}
                        />
                        {periodPreview?.ok ? (
                          <p className="text-muted-foreground text-sm">
                            Per le scadenze useremo il primo giorno:{" "}
                            {scenarioDateText({
                              id: "preview",
                              label: "",
                              kind: "period",
                              dateFrom: periodPreview.input.dateFrom,
                              dateTo: periodPreview.input.dateTo ?? periodPreview.input.dateFrom,
                            })}
                            .
                          </p>
                        ) : null}
                        {periodPreview?.ok && earlierThanDesired(periodPreview.input.dateFrom) ? (
                          <p className="text-warning text-sm">{EARLIER_THAN_DESIRED}</p>
                        ) : null}
                      </>
                    )}
                  </>
                )}

                <Field
                  label="Collegata a una location (facoltativo)"
                  hint={
                    locationChoices.length === 0
                      ? "Nessuna location candidata: aggiungine una da Scelte > Location."
                      : "Il collegamento è solo un'indicazione: scegliere la data non sceglie la location."
                  }
                >
                  {(control) => (
                    <NativeSelect
                      {...control}
                      value={scenario.locationId}
                      onChange={(event) =>
                        setScenario((current) => ({ ...current, locationId: event.target.value }))
                      }
                    >
                      <option value="">Nessuna</option>
                      {locationChoices.map((choice) => (
                        <option key={choice.id} value={choice.id}>
                          {choice.title}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </Field>

                <Field
                  label="Etichetta (facoltativa)"
                  hint="Se la lasci vuota usiamo la data."
                  error={errors.title}
                >
                  {(control) => (
                    <Input
                      {...control}
                      value={values.title}
                      maxLength={120}
                      onChange={(event) => setField("title", event.target.value)}
                    />
                  )}
                </Field>
                <Field label="Note" error={errors.notes}>
                  {(control) => (
                    <Textarea
                      {...control}
                      value={values.notes}
                      onChange={(event) => setField("notes", event.target.value)}
                    />
                  )}
                </Field>
              </>
            ) : (
              <>
                <Field label="Nome" error={errors.title}>
                  {(control) => (
                    <Input
                      {...control}
                      value={values.title}
                      maxLength={120}
                      required
                      aria-required="true"
                      onChange={(event) => setField("title", event.target.value)}
                    />
                  )}
                </Field>
                <Field label="Comune" error={errors.comune}>
                  {(control) => (
                    <Input
                      {...control}
                      value={values.comune}
                      maxLength={80}
                      onChange={(event) => setField("comune", event.target.value)}
                    />
                  )}
                </Field>
                <Field label="Link" error={errors.link} hint="Un indirizzo che inizia con https://">
                  {(control) => (
                    <Input
                      {...control}
                      type="url"
                      inputMode="url"
                      value={values.link}
                      onChange={(event) => setField("link", event.target.value)}
                    />
                  )}
                </Field>
                <MoneyInput
                  label="Costo indicativo (facoltativo)"
                  value={values.costText}
                  onValueChange={(text) => setField("costText", text)}
                  {...(errors.costText ? { error: errors.costText } : {})}
                />
                <Field label="Pro" hint="Uno per riga." error={errors.prosText}>
                  {(control) => (
                    <Textarea
                      {...control}
                      value={values.prosText}
                      onChange={(event) => setField("prosText", event.target.value)}
                    />
                  )}
                </Field>
                <Field label="Contro" hint="Uno per riga." error={errors.consText}>
                  {(control) => (
                    <Textarea
                      {...control}
                      value={values.consText}
                      onChange={(event) => setField("consText", event.target.value)}
                    />
                  )}
                </Field>
                <Field label="Note" error={errors.notes}>
                  {(control) => (
                    <Textarea
                      {...control}
                      value={values.notes}
                      onChange={(event) => setField("notes", event.target.value)}
                    />
                  )}
                </Field>
              </>
            )}

            {formError ? (
              <p role="alert" className="text-destructive text-base">
                {formError}
              </p>
            ) : null}

            <SheetFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Un attimo…" : editing ? "Salva" : "Aggiungi"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => onOpenChange(false)}
              >
                Annulla
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {conflict ? (
        <ConflictDialog
          open
          partnerName={conflict.info.changedByName ?? partnerName}
          changedAt={conflict.info.changedAt ? new Date(conflict.info.changedAt) : new Date()}
          labels={conflictLabels}
          mine={conflictMine()}
          theirs={conflict.info.current ?? {}}
          formatValue={(field, value) =>
            field === "locationOptionId" && typeof value === "string"
              ? (locationChoices.find((choice) => choice.id === value)?.title ?? "—")
              : formatConflictValue(field, value)
          }
          saving={pending}
          onForceSave={() => {
            const [first, ...rest] = conflict.steps;
            if (!first || typeof currentVersion !== "number") {
              setConflict(null);
              setFormError("Questo elemento non c'è più: ricarico la pagina.");
              onStale();
              return;
            }
            setConflict(null);
            void run([{ ...first, version: currentVersion }, ...rest]);
          }}
          onCancel={() => {
            setConflict(null);
            onOpenChange(false);
            onStale();
          }}
        />
      ) : null}
    </>
  );
}
