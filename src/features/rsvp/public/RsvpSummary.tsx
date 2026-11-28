import { Check, Clock, X } from "lucide-react";
import type { Ref } from "react";
import { DIET_OPTIONS, fullName, type Person } from "./state";

const DIET_LABEL = new Map<string, string>(DIET_OPTIONS.map((o) => [o.value, o.label]));

/** "Sì, vegetariano, senza glutine" / "No" / "In attesa". */
export function answerText(person: Person): string {
  if (person.status === "no") return "No";
  if (person.status === null) return "In attesa";
  const parts = ["Sì", ...person.diet.map((d) => DIET_LABEL.get(d)?.toLowerCase() ?? d)];
  return parts.join(", ");
}

/**
 * What the server has saved, one line per person. `thanks` adds the confirmation after a submit
 * (role=status panel, focused by the form); `changed` = people whose answers were already changed by
 * someone else while the page was open (AC11).
 */
export function RsvpSummary({
  people,
  thanks,
  changed,
  panelRef,
}: {
  people: readonly Person[];
  thanks: boolean;
  changed: readonly string[];
  panelRef?: Ref<HTMLDivElement>;
}) {
  const changedNames = people.filter((p) => changed.includes(p.id)).map(fullName);
  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      role={thanks ? "status" : undefined}
      className="border-border bg-card rounded-lg border p-4 focus:outline-none"
      data-testid="rsvp-summary"
    >
      {thanks ? (
        <h2 className="font-heading mb-2 text-[22px] leading-7">
          Grazie! Abbiamo ricevuto le risposte
        </h2>
      ) : null}
      {changedNames.length > 0 ? (
        <p className="mb-3" data-testid="rsvp-changed">
          {changedNames.length === 1
            ? `Le risposte di ${changedNames[0]} erano già cambiate: ecco quelle salvate.`
            : `Le risposte di ${changedNames.join(", ")} erano già cambiate: ecco quelle salvate.`}
        </p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {people.map((person) => {
          const Icon = person.status === "yes" ? Check : person.status === "no" ? X : Clock;
          return (
            <li key={person.id} className="flex items-start gap-2">
              <Icon className="mt-1 size-5 shrink-0" aria-hidden="true" />
              <span>
                {fullName(person)}: <strong>{answerText(person)}</strong>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
