"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Check, CircleCheck, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { DateScenarioList, scenarioDateText } from "@/components/DateScenarioList";
import { EmptyState } from "@/components/EmptyState";
import { formatShortDate } from "@/components/format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { PlainDate } from "@/lib/dates/plain-date";
import {
  addNoteAction,
  addOptionAction,
  chooseOptionAction,
  removeOptionAction,
  reopenDecisionAction,
  restoreOptionAction,
  setReactionAction,
  setReferenceAction,
  updateOptionAction,
  updateScenarioAction,
} from "./actions";
import { ChooseSheet } from "./ChooseSheet";
import { CompareOptions } from "./CompareOptions";
import { HistoryList } from "./HistoryList";
import { formatEventTime, toScenarioItem } from "./model";
import { OptionCard } from "./OptionCard";
import { OptionFormSheet, type OptionFormApi } from "./OptionFormSheet";
import { ReactionButtons } from "./ReactionButtons";
import { ReferenceSheet } from "./ReferenceSheet";
import { ReopenSheet } from "./ReopenSheet";
import { StatusBadge } from "./StatusBadge";
import type { ActionResult, DecisionDetailView, OptionView, ReactionKind } from "./types";

/** Annulla toasts stay at least 8 s (design §8). */
export const UNDO_MS = 10_000;

const STALE_CODES = new Set(["version_conflict", "already_taken", "invalid_option"]);

const formApi: OptionFormApi = {
  addOption: (input) => addOptionAction(input),
  updateOption: (input) => updateOptionAction(input),
  updateScenario: (input) => updateScenarioAction(input),
};

type FormState = { mode: "add" } | { mode: "edit"; option: OptionView };

/**
 * Detail of a decision (design §3.5, §3.8): the question, the options as cards, "Confronta 2",
 * choose / reopen, the collapsed discarded ones and the read-only history. For the date decision
 * the cards also carry the reference actions.
 */
export function DecisionDetail({ view }: { view: DecisionDetailView }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState | null>(null);
  const [chooseFor, setChooseFor] = useState<OptionView | null>(null);
  const [referenceFor, setReferenceFor] = useState<OptionView | null>(null);
  const [reopening, setReopening] = useState(false);
  const [compare, setCompare] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const isDate = view.type === "date";
  const open = view.status === "open";
  const active = view.options.filter((o) => o.status !== "discarded");
  const discarded = view.options.filter((o) => o.status === "discarded");
  const candidates = view.options.filter((o) => o.status === "candidate");
  const chosen = view.options.find((o) => o.id === view.chosenOptionId) ?? null;
  const canSetReference = isDate && open && candidates.length >= 2;
  const comparing = compare
    .map((id) => view.options.find((o) => o.id === id))
    .filter((o): o is OptionView => o !== undefined);

  const refresh = () => router.refresh();
  const guardStale = <T,>(result: ActionResult<T>): ActionResult<T> => {
    if (!result.ok && STALE_CODES.has(result.code)) refresh();
    return result;
  };

  async function react(option: OptionView, reaction: ReactionKind | null) {
    setBusy(option.id);
    const result = await setReactionAction({ optionId: option.id, reaction });
    setBusy(null);
    if (!result.ok) toast.error(result.message);
  }

  async function remove(option: OptionView) {
    const result = await removeOptionAction({ optionId: option.id, version: option.version });
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setCompare((current) => current.filter((id) => id !== option.id));
    toast(`«${option.title}» è stata tolta.`, {
      duration: UNDO_MS,
      action: {
        label: "Annulla",
        onClick: async () => {
          const restored = await restoreOptionAction({
            optionId: option.id,
            version: result.data.version,
          });
          if (restored.ok) toast("Rimessa tra le opzioni.");
          else toast.error(restored.message);
        },
      },
    });
  }

  async function undoReference(previous: string | null) {
    const result = await setReferenceAction({ optionId: previous });
    if (result.ok) toast("Riferimento ripristinato.");
    else toast.error(result.message);
  }

  async function setReference(option: OptionView): Promise<ActionResult<unknown>> {
    const previous = view.manualReferenceId;
    const result = await setReferenceAction({ optionId: option.id });
    if (result.ok) {
      const when = result.data.referenceDate
        ? formatShortDate(result.data.referenceDate)
        : "questa data";
      toast(`Il riferimento ora è il ${when}.`, {
        duration: UNDO_MS,
        action: { label: "Annulla", onClick: () => undoReference(previous) },
      });
    }
    return result;
  }

  async function backToAutomatic(option: OptionView) {
    const result = await setReferenceAction({ optionId: null });
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    const when = result.data.referenceDate
      ? formatShortDate(result.data.referenceDate)
      : "la data più vicina";
    toast(`Il riferimento ora è il ${when} (il più vicino).`, {
      duration: UNDO_MS,
      action: { label: "Annulla", onClick: () => undoReference(option.id) },
    });
  }

  async function choose(option: OptionView, exactDate: PlainDate | null) {
    const result = guardStale(
      await chooseOptionAction({
        decisionId: view.id,
        optionId: option.id,
        expectedVersion: view.version,
        exactDate,
      }),
    );
    if (result.ok) {
      setCompare([]);
      setShowCompare(false);
      toast(isDate ? "Data scelta. Le scadenze si calcolano su questa data." : "Scelta presa.");
    }
    return result;
  }

  async function reopen(reason: string) {
    const result = guardStale(
      await reopenDecisionAction({ decisionId: view.id, reason, expectedVersion: view.version }),
    );
    if (result.ok) toast("Scelta riaperta. Il motivo è nello storico.");
    return result;
  }

  function toggleCompare(option: OptionView, selected: boolean) {
    setCompare((current) =>
      selected
        ? current.includes(option.id)
          ? current
          : [...current, option.id].slice(0, 2)
        : current.filter((id) => id !== option.id),
    );
    setShowCompare(false);
  }

  function actionsFor(option: OptionView): ReactNode {
    const isReference = view.reference?.optionId === option.id;
    const candidate = option.status === "candidate";
    return (
      <div className="flex flex-col gap-3">
        <ReactionButtons
          option={option}
          disabled={!open || !candidate}
          pending={busy === option.id}
          onReact={(reaction) => react(option, reaction)}
        />
        {option.status !== "discarded" && active.length >= 2 ? (
          <label className="flex min-h-11 items-center gap-3">
            <Checkbox
              checked={compare.includes(option.id)}
              disabled={!compare.includes(option.id) && compare.length >= 2}
              onCheckedChange={(checked) => toggleCompare(option, checked === true)}
              aria-label={`Confronta «${option.title}»`}
            />
            <span>Confronta</span>
          </label>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {open && candidate ? (
            <Button type="button" onClick={() => setChooseFor(option)}>
              <Check aria-hidden className="size-4" />
              {isDate ? "Scegli questa data" : "Scegli"}
            </Button>
          ) : null}
          {canSetReference && candidate && !isReference ? (
            <>
              <Button type="button" variant="outline" onClick={() => setReferenceFor(option)}>
                Imposta come riferimento
              </Button>
              <Button asChild variant="outline">
                <Link href={`/percorso?anteprima=${option.id}`}>Anteprima</Link>
              </Button>
            </>
          ) : null}
          {canSetReference && isReference && view.reference?.source === "manual" ? (
            <Button type="button" variant="outline" onClick={() => backToAutomatic(option)}>
              Torna automatico (il più vicino)
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => setForm({ mode: "edit", option })}>
            <Pencil aria-hidden className="size-4" />
            Modifica
          </Button>
          {open && candidate ? (
            <Button type="button" variant="ghost" onClick={() => remove(option)}>
              <Trash2 aria-hidden className="size-4" />
              Elimina
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  function renderOptions(options: readonly OptionView[], areDiscarded: boolean): ReactNode {
    if (isDate) {
      const items = options.flatMap((o) => {
        const item = toScenarioItem(o, view);
        return item ? [item] : [];
      });
      return (
        <DateScenarioList
          items={items}
          actions={(item) => {
            const option = options.find((o) => o.id === item.id);
            if (!option) return null;
            return (
              <div className="flex w-full flex-col gap-3">
                {option.id === view.chosenOptionId ? (
                  <p className="text-primary inline-flex items-center gap-1.5 font-semibold">
                    <CircleCheck aria-hidden className="size-5" />
                    Data scelta
                  </p>
                ) : null}
                {option.notes ? <p className="whitespace-pre-line">{option.notes}</p> : null}
                {areDiscarded ? <ReactionButtons option={option} disabled /> : actionsFor(option)}
              </div>
            );
          }}
        />
      );
    }
    return (
      <ul className="flex flex-col gap-3">
        {options.map((option) => (
          <OptionCard
            key={option.id}
            option={option}
            chosen={option.id === view.chosenOptionId}
            discarded={areDiscarded}
          >
            {areDiscarded ? <ReactionButtons option={option} disabled /> : actionsFor(option)}
          </OptionCard>
        ))}
      </ul>
    );
  }

  const chosenItem = chosen ? toScenarioItem(chosen, view) : null;
  const chosenText = chosenItem ? scenarioDateText(chosenItem) : (chosen?.title ?? "");

  return (
    <div className="flex flex-col gap-6" data-testid={`decision-${view.key}`}>
      <div className="flex flex-col gap-2">
        <Link
          href="/scelte"
          className="text-primary inline-flex min-h-11 items-center gap-1 underline underline-offset-4"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Tutte le scelte
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="text-2xl leading-8 font-semibold">{view.question}</h1>
          <StatusBadge state={view.state} />
        </div>
      </div>

      {view.status === "taken" && chosen ? (
        <Alert variant="success" data-testid="taken-card">
          <CircleCheck aria-hidden className="size-5" />
          <AlertTitle>
            {isDate ? `Data scelta: ${chosenText}` : `Scelta presa: ${chosen.title}`}
          </AlertTitle>
          <AlertDescription>
            <p>
              {view.chosenByName ? `${view.chosenByName}, ` : ""}
              {view.chosenAt ? formatEventTime(view.chosenAt) : ""}
            </p>
            {isDate ? <p>La data è scelta: per cambiare le scadenze riapri la scelta.</p> : null}
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              onClick={() => setReopening(true)}
            >
              <RotateCcw aria-hidden className="size-4" />
              Riapri la scelta
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {isDate && open && view.options.length > 0 ? (
        <div
          className="text-muted-foreground flex flex-col gap-1 text-base"
          data-testid="reference-help"
        >
          <p>
            Il riferimento è la data su cui calcoliamo le scadenze. Resta provvisorio finché non
            scegliete.
          </p>
          {candidates.length > 1 && view.reference?.source === "automatic" ? (
            <p>Il più vicino: lo usiamo per non farti arrivare tardi.</p>
          ) : null}
          <details>
            <summary className="text-primary min-h-11 cursor-pointer py-2 underline underline-offset-4">
              Cos&apos;è?
            </summary>
            <dl className="flex flex-col gap-1 pb-2">
              <div>
                <dt className="inline font-semibold">Riferimento: </dt>
                <dd className="inline">la data su cui il Percorso calcola le scadenze.</dd>
              </div>
              <div>
                <dt className="inline font-semibold">Provvisorio: </dt>
                <dd className="inline">finché la data non è scelta.</dd>
              </div>
              <div>
                <dt className="inline font-semibold">Definitivo: </dt>
                <dd className="inline">dopo che avete scelto la data.</dd>
              </div>
              <div>
                <dt className="inline font-semibold">Anteprima: </dt>
                <dd className="inline">
                  vedere come cambierebbero le scadenze con un altro scenario, senza salvare nulla.
                </dd>
              </div>
            </dl>
          </details>
        </div>
      ) : null}

      {open ? (
        <div>
          <Button type="button" onClick={() => setForm({ mode: "add" })}>
            <Plus aria-hidden className="size-4" />
            {isDate ? "Aggiungi una data" : "Aggiungi un'opzione"}
          </Button>
        </div>
      ) : null}

      {view.options.length === 0 ? (
        <EmptyState
          title={isDate ? "Nessuna data: aggiungi la prima" : "Nessuna opzione: aggiungi la prima"}
          description={
            isDate
              ? "Hai più opzioni? Aggiungile pure: una data fissa o un periodo."
              : "Una frase per ricordarti cosa hai in mente basta già."
          }
        />
      ) : null}

      {active.length >= 2 ? (
        <div className="flex flex-wrap items-center gap-3" data-testid="compare-bar">
          <Button
            type="button"
            variant="outline"
            disabled={comparing.length < 2}
            onClick={() => setShowCompare(true)}
          >
            Confronta 2
          </Button>
          <span className="text-muted-foreground text-sm" aria-live="polite">
            {comparing.length === 2
              ? "Pronte da confrontare."
              : `Spunta due opzioni per confrontarle (${comparing.length}/2).`}
          </span>
        </div>
      ) : null}

      {showCompare && comparing.length === 2 ? (
        <CompareOptions
          a={comparing[0]!}
          b={comparing[1]!}
          type={view.type}
          reference={view.reference}
          onClose={() => setShowCompare(false)}
        />
      ) : null}

      {active.length > 0 ? renderOptions(active, false) : null}

      {discarded.length > 0 ? (
        <details className="border-border rounded-lg border p-4" data-testid="discarded">
          <summary className="min-h-11 cursor-pointer py-2 font-semibold">
            Opzioni scartate ({discarded.length})
          </summary>
          <div className="pt-3">{renderOptions(discarded, true)}</div>
        </details>
      ) : null}

      <HistoryList
        events={view.events}
        onAddNote={(note) => addNoteAction({ decisionId: view.id, note })}
      />

      {form ? (
        <OptionFormSheet
          key={form.mode === "edit" ? form.option.id : "new"}
          open
          onOpenChange={(next) => {
            if (!next) setForm(null);
          }}
          decision={{ id: view.id, type: view.type, status: view.status }}
          option={form.mode === "edit" ? form.option : null}
          locationChoices={view.locationChoices}
          partnerName={view.partnerName}
          api={formApi}
          onSaved={(message) => toast(message)}
          onStale={refresh}
        />
      ) : null}

      {chooseFor ? (
        <ChooseSheet
          key={chooseFor.id}
          open
          onOpenChange={(next) => {
            if (!next) setChooseFor(null);
          }}
          option={chooseFor}
          type={view.type}
          onConfirm={(exactDate) => choose(chooseFor, exactDate)}
        />
      ) : null}

      {referenceFor ? (
        <ReferenceSheet
          key={referenceFor.id}
          open
          onOpenChange={(next) => {
            if (!next) setReferenceFor(null);
          }}
          option={referenceFor}
          changedCount={view.changedCounts[referenceFor.id] ?? 0}
          onConfirm={() => setReference(referenceFor)}
        />
      ) : null}

      {reopening ? (
        <ReopenSheet
          open
          type={view.type}
          onOpenChange={(next) => {
            if (!next) setReopening(false);
          }}
          onConfirm={reopen}
        />
      ) : null}
    </div>
  );
}
