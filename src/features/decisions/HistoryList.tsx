"use client";

import { useId, useState } from "react";
import {
  ArrowRightLeft,
  CircleCheck,
  Pencil,
  Pin,
  Plus,
  RotateCcw,
  StickyNote,
  Trash2,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { describeEvent, formatEventTime } from "./model";
import { Textarea } from "./form-bits";
import type { ActionResult, DecisionEventKind, EventView } from "./types";

const ICONS: Record<DecisionEventKind, LucideIcon> = {
  option_added: Plus,
  option_updated: Pencil,
  option_removed: Trash2,
  chosen: CircleCheck,
  reopened: RotateCcw,
  note: StickyNote,
  reference_set: Pin,
  reference_auto: Undo2,
};

export const NOTE_MAX = 1000;

function AddNoteForm({ onAddNote }: { onAddNote: (note: string) => Promise<ActionResult> }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const errorId = useId();
  const counterId = useId();
  const fieldId = useId();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (note.trim() === "") {
      setError("Scrivi qualcosa nella nota.");
      return;
    }
    setPending(true);
    setError(null);
    const result = await onAddNote(note);
    setPending(false);
    if (result.ok) setNote("");
    else setError(result.message);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
      <label htmlFor={fieldId} className="text-base font-semibold">
        Aggiungi nota
      </label>
      <Textarea
        id={fieldId}
        value={note}
        maxLength={NOTE_MAX}
        onChange={(event) => setNote(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${counterId}${error ? ` ${errorId}` : ""}`}
      />
      <p id={counterId} className="text-muted-foreground text-sm">
        {note.length}/{NOTE_MAX} · La nota resta nello storico e non si può modificare.
      </p>
      {error ? (
        <p id={errorId} className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={pending}>
          Aggiungi nota
        </Button>
      </div>
    </form>
  );
}

/**
 * Chronological, read-only history of a decision (AC21, design §3.5, §3.8): nothing can be edited
 * or removed, only a note appended. `onAddNote` omitted = no form.
 */
export function HistoryList({
  events,
  onAddNote,
}: {
  events: readonly EventView[];
  onAddNote?: (note: string) => Promise<ActionResult>;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3" data-testid="history">
      <h2 id={headingId} className="text-[22px] leading-7">
        Storico
      </h2>
      {events.length === 0 ? (
        <p className="text-muted-foreground">
          Ancora niente da raccontare: qui comparirà ogni passo.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {events.map((event) => {
            const Icon = ICONS[event.kind] ?? ArrowRightLeft;
            const { text, quote, detail } = describeEvent(event);
            return (
              <li key={event.id} className="border-border flex gap-3 border-l-2 pl-3">
                <Icon aria-hidden className="text-primary mt-1 size-5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="break-words">{text}</p>
                  {detail ? <p className="text-muted-foreground text-sm">{detail}</p> : null}
                  {quote ? (
                    <blockquote className="border-border mt-1 border-l-2 pl-3 break-words whitespace-pre-line">
                      {quote}
                    </blockquote>
                  ) : null}
                  <time dateTime={event.at} className="text-muted-foreground text-sm">
                    {formatEventTime(event.at)}
                  </time>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {onAddNote ? <AddNoteForm onAddNote={onAddNote} /> : null}
    </section>
  );
}
