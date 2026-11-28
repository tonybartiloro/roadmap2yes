import { DIET_OPTIONS } from "../constants";
import type { RsvpPerson } from "../public-rpc";

/**
 * Shared by the server action and the guest page (client components import from here, never from
 * `public-rpc.ts`, which is server-only). No Node imports.
 */

export const NOTE_MAX = 200;

export { DIET_OPTIONS };

export const DIET_VALUES: readonly string[] = DIET_OPTIONS.map((option) => option.value);

export const MESSAGES = {
  none: "Scegli Sì o No per almeno una persona.",
  invalid: "Controlla le risposte: le preferenze non sono valide o l'indicazione è troppo lunga.",
  blocked: "Troppi tentativi: riprova tra 15 minuti",
  save: "Non sono riuscito a salvare. Controlla la connessione e riprova.",
} as const;

export type ErrorKind = keyof typeof MESSAGES;

export type Person = RsvpPerson;

/** What one person's card holds. `note` is the raw text of the field. */
export type PersonValues = { status: "yes" | "no" | null; diet: string[]; note: string };
export type FormValues = Record<string, PersonValues>;

export type RsvpFormState =
  | { status: "idle" }
  | { status: "error"; kind: ErrorKind; values: FormValues }
  /** The server's saved state; `changed` = people whose answer was changed by someone else meanwhile. */
  | { status: "saved"; people: Person[]; changed: string[] }
  /** The link stopped working while the form was open: the whole page is replaced (DES-25). */
  | { status: "unavailable" };

export const IDLE: RsvpFormState = { status: "idle" };

export function valuesFromPeople(people: readonly Person[]): FormValues {
  const values: FormValues = {};
  for (const person of people) {
    values[person.id] = {
      status: person.status,
      diet: person.status === "yes" ? [...person.diet] : [],
      note: person.status === "yes" ? (person.diet_note ?? "") : "",
    };
  }
  return values;
}

export function fullName(person: Pick<Person, "first_name" | "last_name">): string {
  return [person.first_name, person.last_name].filter(Boolean).join(" ");
}

export function hasAnswers(people: readonly Person[]): boolean {
  return people.some((person) => person.status !== null);
}
