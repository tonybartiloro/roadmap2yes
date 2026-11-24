"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Info, Lightbulb, RefreshCw, Undo2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { Milestone } from "@/content/milestones/types";
import { formatShortDate } from "@/components/format";
import { COPY } from "./copy";
import { DATE_DECISION_HREF } from "./links";
import type { TaskView } from "./model";
import type { PreviewClosedReason, ReferenceView } from "./view";

/** Banner "Data riaperta" (AC20) with the way to acknowledge every task to review at once. */
export function ReopenedBanner({
  reviewCount,
  busy,
  onAcknowledgeAll,
}: {
  reviewCount: number;
  busy: boolean;
  onAcknowledgeAll: () => void;
}) {
  return (
    <Alert role="status" data-testid="reopened-banner">
      <Info aria-hidden className="size-5" />
      <AlertDescription className="flex flex-col gap-2">
        <p className="text-base">{COPY.reopenedBanner}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="outline" size="sm">
            <Link href={DATE_DECISION_HREF}>Vai alla scelta della data</Link>
          </Button>
          {reviewCount > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={onAcknowledgeAll}
              data-testid="acknowledge-all"
            >
              {COPY.reviewOk} per tutti ({reviewCount})
            </Button>
          ) : null}
        </div>
      </AlertDescription>
    </Alert>
  );
}

/** "Scadenze ricalcolate" for the session after a partner changed the dates (DES-19). */
export function RecalculatedStrip({
  byName,
  reference,
}: {
  byName: string | null;
  reference: ReferenceView;
}) {
  const who = byName ?? "Il tuo partner";
  return (
    <Alert role="status" data-testid="recalc-strip">
      <RefreshCw aria-hidden className="size-5" />
      <AlertDescription>
        <span className="font-semibold">Scadenze ricalcolate.</span> {who} ha cambiato qualcosa
        sulle date: ora le scadenze seguono il{" "}
        {reference.scenario.kind === "period"
          ? `${formatShortDate(reference.scenario.dateFrom)} (primo giorno del periodo)`
          : reference.scenario.dateText}
        .
      </AlertDescription>
    </Alert>
  );
}

/** The `?anteprima` the URL asked for cannot be shown: closed with a notice (design §4). */
export function PreviewClosedNotice({ reason }: { reason: PreviewClosedReason }) {
  return (
    <Alert role="status" data-testid="preview-closed">
      <Info aria-hidden className="size-5" />
      <AlertDescription>
        {reason === "taken"
          ? "La data è stata scelta, quindi l'anteprima si è chiusa."
          : "Questo scenario non c'è più (o è cambiato), quindi l'anteprima si è chiusa."}
      </AlertDescription>
    </Alert>
  );
}

/** "Suggerimenti da rivedere" (AC16, AC48): accept or ignore, nothing happens by itself. */
export function SuggestionsCard({
  additions,
  removals,
  busyKey,
  onAcceptAdd,
  onAcceptRemove,
  onDismiss,
}: {
  additions: readonly Milestone[];
  removals: readonly TaskView[];
  busyKey: string | null;
  onAcceptAdd: (milestone: Milestone) => void;
  onAcceptRemove: (task: TaskView) => void;
  onDismiss: (templateKey: string, kind: "add" | "remove") => void;
}) {
  if (additions.length === 0 && removals.length === 0) return null;
  return (
    <section
      aria-labelledby="suggestions-title"
      data-testid="suggestions-card"
      className="border-border bg-card flex flex-col gap-3 rounded-lg border p-4"
    >
      <h2 id="suggestions-title" className="flex items-center gap-2 text-[22px] leading-7">
        <Lightbulb aria-hidden className="size-5" />
        Suggerimenti da rivedere
      </h2>
      <p className="text-muted-foreground text-sm">
        Hai cambiato qualcosa nelle risposte. Non aggiungiamo né togliamo nulla da soli: decidi tu.
      </p>
      <ul className="flex flex-col gap-3">
        {additions.map((m) => (
          <li
            key={`add-${m.key}`}
            className="flex flex-col gap-2"
            data-testid={`suggestion-add-${m.key}`}
          >
            <div>
              <p className="font-semibold">Nuova tappa: {m.title}</p>
              <p className="text-muted-foreground text-sm">{m.advice}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={busyKey === m.key}
                onClick={() => onAcceptAdd(m)}
                data-testid={`suggestion-accept-${m.key}`}
              >
                Aggiungi al Percorso
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busyKey === m.key}
                onClick={() => onDismiss(m.key, "add")}
                data-testid={`suggestion-ignore-${m.key}`}
              >
                Ignora
              </Button>
            </div>
          </li>
        ))}
        {removals.map((task) => (
          <li
            key={`remove-${task.id}`}
            className="flex flex-col gap-2"
            data-testid={`suggestion-remove-${task.templateKey}`}
          >
            <div>
              <p className="font-semibold">Forse non serve più: {task.title}</p>
              <p className="text-muted-foreground text-sm">
                Non rientra nelle tappe previste per il rito che hai scelto. Se l&apos;hai già
                iniziata, tienila.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={busyKey === task.templateKey}
                onClick={() => onAcceptRemove(task)}
                data-testid={`suggestion-accept-${task.templateKey}`}
              >
                Togli dal Percorso
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busyKey === task.templateKey}
                onClick={() => onDismiss(task.templateKey as string, "remove")}
                data-testid={`suggestion-ignore-${task.templateKey}`}
              >
                Tienila
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "Eliminati di recente": every logically deleted task, restorable (AC31). */
export function RecentlyDeleted({
  tasks,
  busyId,
  onRestore,
}: {
  tasks: readonly TaskView[];
  busyId: string | null;
  onRestore: (task: TaskView) => void;
}) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  if (tasks.length === 0) return null;
  return (
    <section data-testid="recently-deleted" className="flex flex-col gap-3">
      <h2 className="text-[22px] leading-7">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((current) => !current)}
          className="hover:bg-muted focus-visible:ring-ring -mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center gap-2 rounded-md px-2 text-left focus-visible:ring-2 focus-visible:outline-none"
        >
          {open ? (
            <ChevronDown aria-hidden className="size-5" />
          ) : (
            <ChevronRight aria-hidden className="size-5" />
          )}
          <span>Eliminati di recente</span>
          <span className="text-muted-foreground text-base font-normal">({tasks.length})</span>
        </button>
      </h2>
      <ul id={bodyId} hidden={!open} className="flex flex-col gap-2">
        {tasks.map((task) => (
          <li
            key={task.id}
            data-testid="deleted-row"
            data-task-id={task.id}
            className="border-border bg-card flex items-center justify-between gap-3 rounded-lg border p-3"
          >
            <span className="min-w-0 break-words">{task.title}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busyId === task.id}
              onClick={() => onRestore(task)}
              data-testid={`restore-${task.id}`}
            >
              <Undo2 aria-hidden />
              Ripristina
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
