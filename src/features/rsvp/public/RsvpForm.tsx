"use client";

import { useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { FormEvent, Ref } from "react";
import { Button } from "@/components/ui/button";
import { LinkUnavailable } from "./LinkUnavailable";
import { RsvpPersonCard } from "./RsvpPersonCard";
import { RsvpSummary } from "./RsvpSummary";
import { coupleNames, coupleTitle } from "./format";
import {
  IDLE,
  MESSAGES,
  hasAnswers,
  valuesFromPeople,
  type FormValues,
  type Person,
  type RsvpFormState,
} from "./state";

export type RsvpAction = (previous: RsvpFormState, formData: FormData) => Promise<RsvpFormState>;

const noop = () => () => {};
const ERROR_ID = "rsvp-error";

/**
 * The guest page body (design §1.1). Without JavaScript the `<form action>` posts to the server
 * action and the server renders the result (`useActionState` carries it); the summary and the form
 * sit in a native `<details>` ("Modifica" = its summary). With JavaScript the submit is intercepted:
 * the action is awaited inside a `try/catch` (a network error keeps the choices and shows an alert),
 * and "Vengono tutti", the counter and the preferences that appear only after "Sì" are added.
 * Nothing is kept on the device (AC11): the choices live in memory only.
 */
export function RsvpForm({
  action,
  couple,
  dateLabel,
  locationLabel,
  people: initialPeople,
}: {
  action: RsvpAction;
  couple: [string | null, string | null];
  dateLabel: string;
  locationLabel: string;
  people: Person[];
}) {
  const [serverState, formAction] = useActionState(action, IDLE);
  const [live, setLive] = useState<RsvpFormState | null>(null);
  const [pending, setPending] = useState(false);
  const [networkError, setNetworkError] = useState(false);
  const [saves, setSaves] = useState(0);
  const enhanced = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  const panel = useRef<HTMLDivElement>(null);
  const errorLine = useRef<HTMLParagraphElement>(null);

  const state = live ?? serverState;
  const people = state.status === "saved" ? state.people : initialPeople;
  const known = state.status === "saved" || hasAnswers(people);
  const errorKind = networkError ? "save" : state.status === "error" ? state.kind : null;
  const sentValues: FormValues | null = state.status === "error" ? state.values : null;

  // Focus moves to the confirmation after a save, to the error line on a failure (design §5).
  useEffect(() => {
    if (live?.status === "saved") panel.current?.focus();
  }, [live]);
  useEffect(() => {
    if (errorKind) errorLine.current?.focus();
  }, [errorKind, live]);

  if (state.status === "unavailable") return <LinkUnavailable />;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    setPending(true);
    setNetworkError(false);
    try {
      const next = await action(state, data);
      if (next.status === "saved") setSaves((n) => n + 1);
      setLive(next);
    } catch {
      setNetworkError(true);
    } finally {
      setPending(false);
    }
  }

  const label = coupleNames(couple);
  const form = (
    <PeopleForm
      // A new key after each save: the cards restart from the saved state.
      key={saves}
      people={people}
      initial={sentValues ?? valuesFromPeople(people)}
      enhanced={enhanced}
      coupleLabel={label}
      errorKind={errorKind}
      pending={pending}
      formAction={formAction}
      onSubmit={onSubmit}
      errorRef={errorLine}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-[30px] leading-9">{coupleTitle(couple)}</h1>
        <p>{dateLabel}</p>
        <p>{locationLabel}</p>
        {dateLabel === "Data da confermare" || locationLabel === "Luogo da confermare" ? (
          <p className="text-muted-foreground mt-2">
            Puoi rispondere adesso e cambiare quando vuoi.
          </p>
        ) : null}
      </header>
      {known ? (
        <>
          <RsvpSummary
            people={people}
            thanks={state.status === "saved"}
            changed={state.status === "saved" ? state.changed : []}
            panelRef={panel}
          />
          <details
            key={saves}
            open={errorKind !== null}
            className="border-border rounded-lg border"
          >
            <summary className="flex min-h-12 cursor-pointer items-center px-4 font-semibold">
              Modifica
            </summary>
            <div className="p-4 pt-0">{form}</div>
          </details>
        </>
      ) : (
        form
      )}
      <footer className="text-muted-foreground flex flex-col gap-2 text-sm">
        <p>
          Le risposte le vedono solo {label}, servono per organizzare il matrimonio; per farle
          cancellare scrivi a {couple.filter(Boolean).length === 2 ? "loro" : "chi ti ha invitato"}.
        </p>
        <p>Manca qualcuno o c&apos;è un nome sbagliato? Scrivi a chi ti ha invitato.</p>
      </footer>
    </div>
  );
}

function PeopleForm({
  people,
  initial,
  enhanced,
  coupleLabel,
  errorKind,
  pending,
  formAction,
  onSubmit,
  errorRef,
}: {
  people: readonly Person[];
  initial: FormValues;
  enhanced: boolean;
  coupleLabel: string;
  errorKind: keyof typeof MESSAGES | null;
  pending: boolean;
  formAction: (formData: FormData) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  errorRef: Ref<HTMLParagraphElement>;
}) {
  const [values, setValues] = useState<FormValues>(initial);
  const many = people.length > 1;
  const chosen = people.filter((p) => values[p.id]?.status != null).length;

  return (
    <form action={formAction} onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <p className="font-medium">{many ? "Dicci chi di voi viene." : "Dicci se ci sei."}</p>
      {enhanced && many ? (
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="min-h-12"
          onClick={() =>
            setValues((current) =>
              Object.fromEntries(
                people.map((p) => [
                  p.id,
                  { ...(current[p.id] ?? { diet: [], note: "" }), status: "yes" as const },
                ]),
              ),
            )
          }
        >
          Vengono tutti
        </Button>
      ) : null}
      {people.map((person) => (
        <RsvpPersonCard
          key={person.id}
          person={person}
          value={values[person.id] ?? { status: null, diet: [], note: "" }}
          enhanced={enhanced}
          coupleLabel={coupleLabel}
          describedBy={errorKind === "none" ? ERROR_ID : undefined}
          onChange={(next) => setValues((current) => ({ ...current, [person.id]: next }))}
        />
      ))}
      {enhanced && many ? (
        <p role="status" aria-live="polite" className="font-medium">
          Hai scelto per {chosen} di {people.length} persone
        </p>
      ) : null}
      {errorKind ? (
        <p
          id={ERROR_ID}
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="text-destructive font-medium focus:outline-none"
          data-testid="rsvp-error"
        >
          {MESSAGES[errorKind]}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="min-h-12 text-lg" disabled={pending}>
        {pending ? "Invio in corso…" : "Invia le risposte"}
      </Button>
    </form>
  );
}
