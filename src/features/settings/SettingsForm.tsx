"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { DateScenarioList, type DateScenarioItem } from "@/components/DateScenarioList";
import { MoneyInput } from "@/components/MoneyInput";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STYLE_LABELS } from "@/content/style-tips";
import { setTotalAction } from "@/features/budget/actions";
import { useConflict } from "@/features/budget/use-conflict";
import { ChoiceCards, Drafted, TextArea } from "@/features/onboarding/form-bits";
import {
  GUEST_BANDS,
  GUEST_BAND_LABELS,
  RITE_NOTE,
  RITE_OPTIONS,
  REGIONS,
} from "@/features/onboarding/model";
import { TextField } from "@/features/onboarding/PersonForm";
import { formatCents, formatEuro, parseEuroToCents } from "@/lib/money";
import { saveSettingsAction } from "./actions";
import type { ScenarioView, SettingsView } from "./data";
import { SETTINGS_FIELD_LABELS, formatSettingsValue } from "./field-labels";
import {
  GENERIC_ERROR,
  GUESTS_HREF,
  SUGGESTIONS_HREF,
  guestBandText,
  type SettingsValues,
} from "./model";
import type { VersionedResult } from "@/features/decisions/types";

/** Impostazioni nozze (AC16, AC46, AC48): the answers of the onboarding, editable by either partner. */

function scenarioItems(scenarios: readonly ScenarioView[]): DateScenarioItem[] {
  return scenarios.map((scenario) => ({
    id: scenario.id,
    label: scenario.title,
    kind: scenario.kind,
    dateFrom: scenario.dateFrom,
    ...(scenario.dateTo ? { dateTo: scenario.dateTo } : {}),
    locationName: scenario.locationName,
    discarded: scenario.status === "discarded",
    ...(scenario.status === "chosen"
      ? { isReference: true, referenceStatus: "definitive" as const }
      : {}),
  }));
}

export function SettingsForm({ view, scope }: { view: SettingsView; scope: string }) {
  const saved: SettingsValues = {
    rite: view.rite,
    guestBand: view.guestBand,
    styleLabel: view.styleLabel,
    styleNote: view.styleNote ?? "",
    region: view.region,
    comune: view.comune ?? "",
    budgetText: view.budgetCents === null ? "" : formatCents(view.budgetCents),
  };
  return (
    <Drafted draftKey="settings" scope={scope} saved={saved}>
      {({ initial, save, clear }) => (
        // A new version (own save or the other partner's) remounts the form from the fresh values.
        <Form key={view.version} view={view} initial={initial} save={save} clear={clear} />
      )}
    </Drafted>
  );
}

function Form({
  view,
  initial,
  save,
  clear,
}: {
  view: SettingsView;
  initial: SettingsValues;
  save: (value: SettingsValues) => void;
  clear: () => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [riteChanged, setRiteChanged] = useState(false);
  const [budgetBusy, setBudgetBusy] = useState(false);
  const [budgetError, setBudgetError] = useState<string | undefined>(undefined);

  const change = (patch: Partial<SettingsValues>) => {
    const next = { ...value, ...patch };
    setValue(next);
    save(next);
  };

  const { handle, dialog } = useConflict({
    labels: SETTINGS_FIELD_LABELS,
    formatValue: formatSettingsValue,
    partnerName: view.partnerName,
    onResolved: (result) => {
      if (result.ok) afterSaved();
      else setError(result.message);
    },
    // "Annulla": the other partner's version is shown (the draft stays on the device).
    onCancel: () => router.refresh(),
  });

  function afterSaved() {
    clear();
    if (value.rite !== view.rite) setRiteChanged(true);
    toast.success("Salvato.");
    router.refresh();
  }

  const body = (version: number) => ({
    version,
    rite: value.rite,
    guestBand: value.guestBand,
    styleLabel: value.styleLabel,
    styleNote: value.styleNote,
    region: value.region,
    comune: value.comune,
  });

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      const result: VersionedResult = await saveSettingsAction(body(view.version));
      const mine = {
        rite: value.rite,
        guestBand: value.guestBand,
        styleLabel: value.styleLabel,
        styleNote: value.styleNote,
        region: value.region,
        comune: value.comune,
      };
      if (handle(result, mine, (version) => saveSettingsAction(body(version)))) return;
      if (result.ok) afterSaved();
      else setError(result.message);
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setBusy(false);
    }
  }

  async function saveBudget() {
    const parsed = value.budgetText.trim() === "" ? null : parseEuroToCents(value.budgetText);
    if (parsed === null) {
      setBudgetError("Scrivi un importo, oppure lascia il budget com'è.");
      return;
    }
    if (!parsed.ok) {
      setBudgetError(parsed.message);
      return;
    }
    setBudgetError(undefined);
    setBudgetBusy(true);
    try {
      const result = await setTotalAction({
        totalCents: parsed.cents,
        reason: "Modificato da Impostazioni",
      });
      if (result.ok) {
        toast.success("Budget salvato.");
        // The saved total is now the stored one: the draft keeps no stale text of it.
        change({ budgetText: formatCents(parsed.cents) });
        router.refresh();
      } else {
        setBudgetError(result.message);
      }
    } catch {
      setBudgetError(GENERIC_ERROR);
    } finally {
      setBudgetBusy(false);
    }
  }

  return (
    <div className="flex max-w-xl flex-col gap-10">
      {dialog}
      <form
        noValidate
        className="flex flex-col gap-8"
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit();
        }}
        data-testid="settings-form"
      >
        <section aria-labelledby="set-rite" className="flex flex-col gap-3">
          <h2 id="set-rite" className="text-xl font-semibold">
            Rito
          </h2>
          <ChoiceCards
            legend="Tipo di cerimonia"
            value={value.rite}
            onChange={(rite) => change({ rite })}
            options={RITE_OPTIONS}
            testId="settings-rite"
          />
          <p className="text-muted-foreground">
            {RITE_NOTE} Se lo cambi, in Percorso trovi i suggerimenti da rivedere: non aggiungiamo
            né togliamo nulla da soli.
          </p>
        </section>

        <section aria-labelledby="set-guests" className="flex flex-col gap-3">
          <h2 id="set-guests" className="text-xl font-semibold">
            Invitati
          </h2>
          {view.guestCount > 0 ? (
            <p className="text-base" data-testid="settings-guests-computed">
              {guestBandText(view.guestCount)}{" "}
              <Link href={GUESTS_HREF} className="text-primary underline underline-offset-2">
                Vedi la lista
              </Link>
            </p>
          ) : (
            <ChoiceCards
              legend="Quanti invitati"
              value={(value.guestBand as (typeof GUEST_BANDS)[number] | null) ?? null}
              onChange={(guestBand) => change({ guestBand })}
              options={GUEST_BANDS.map((band) => ({
                value: band,
                label: GUEST_BAND_LABELS[band],
              }))}
              testId="settings-guests"
            />
          )}
        </section>

        <section aria-labelledby="set-style" className="flex flex-col gap-3">
          <h2 id="set-style" className="text-xl font-semibold">
            Stile e luogo
          </h2>
          <ChoiceCards
            legend="Stile"
            value={value.styleLabel}
            onChange={(styleLabel) => change({ styleLabel })}
            options={STYLE_LABELS.map((label) => ({ value: label, label }))}
            columns={2}
            testId="settings-style"
          />
          {value.styleLabel ? (
            <div>
              <Button type="button" variant="ghost" onClick={() => change({ styleLabel: null })}>
                Togli la scelta dello stile
              </Button>
            </div>
          ) : null}
          <TextArea
            id="settings-style-note"
            label="Una nota sullo stile (facoltativa)"
            value={value.styleNote}
            onChange={(styleNote) => change({ styleNote })}
            maxLength={500}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="settings-region">Regione</Label>
            <Select
              value={value.region ?? undefined}
              onValueChange={(region) => change({ region })}
              name="region"
            >
              <SelectTrigger id="settings-region" data-testid="settings-region">
                <SelectValue placeholder="Scegli la regione" />
              </SelectTrigger>
              <SelectContent>
                {REGIONS.map((region) => (
                  <SelectItem key={region} value={region}>
                    {region}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <TextField
            id="settings-comune"
            label="Comune"
            value={value.comune}
            onChange={(comune) => change({ comune })}
          />
        </section>

        {error ? (
          <Alert variant="destructive" data-testid="settings-error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {riteChanged ? (
          <Alert variant="success" role="status" data-testid="settings-rite-note">
            <AlertDescription>
              Rito aggiornato.{" "}
              <Link href={SUGGESTIONS_HREF} className="text-primary underline underline-offset-4">
                Guarda i suggerimenti da rivedere in Percorso
              </Link>
              .
            </AlertDescription>
          </Alert>
        ) : null}
        <div>
          <Button
            type="submit"
            size="lg"
            disabled={busy}
            aria-busy={busy}
            data-testid="settings-save"
          >
            {busy ? <Loader2 aria-hidden className="size-5 animate-spin" /> : null}
            Salva le modifiche
          </Button>
        </div>
      </form>

      <section
        aria-labelledby="set-dates"
        className="flex flex-col gap-3"
        data-testid="settings-dates"
      >
        <h2 id="set-dates" className="text-xl font-semibold">
          Date
        </h2>
        <DateScenarioList
          items={scenarioItems(view.scenarios)}
          emptyText="Ancora nessuna data: la scegli quando vuoi."
        />
        <p>
          <Link href="/scelte/date" className="text-primary underline underline-offset-4">
            Aggiungi, cambia o scegli le date in Scelte
          </Link>
        </p>
      </section>

      <section
        aria-labelledby="set-budget"
        className="flex flex-col gap-3"
        data-testid="settings-budget"
      >
        <h2 id="set-budget" className="text-xl font-semibold">
          Budget totale
        </h2>
        <p className="text-muted-foreground">
          {view.budgetCents === null
            ? "Non è ancora stato definito."
            : `Ora è ${formatEuro(view.budgetCents)}. Ogni modifica resta nello storico del Budget.`}
        </p>
        <MoneyInput
          label="Nuovo totale"
          name="budgetTotal"
          value={value.budgetText}
          onValueChange={(budgetText) => change({ budgetText })}
          error={budgetError}
        />
        <div>
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={budgetBusy}
            aria-busy={budgetBusy}
            onClick={() => void saveBudget()}
            data-testid="settings-budget-save"
          >
            {budgetBusy ? <Loader2 aria-hidden className="size-5 animate-spin" /> : null}
            Salva il budget
          </Button>
        </div>
      </section>
    </div>
  );
}
