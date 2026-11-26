import { toCsv } from "../export/csv";
import { normalizeText } from "./normalize";
import type { Guest, GuestCategory, GuestGroup } from "./types";

/**
 * CSV of the guests (AC21): the SAME columns, in the same order, that the import reads, so an
 * exported file can be imported back and gives the same data. Text cells go through `toCsv`
 * (`;`, BOM, CRLF, formulas neutralised with a leading `'`, which the import removes again).
 */
export const GUEST_CSV_COLUMNS = [
  "nome",
  "cognome",
  "tipo",
  "lato",
  "gruppo",
  "telefono",
  "email",
  "note",
] as const;

/** Words of the `tipo` column (import accepts these, case-insensitive; empty = adult). */
export const CATEGORY_WORDS: Record<GuestCategory, string> = {
  adult: "adulto",
  child: "bambino",
  infant: "neonato",
};

/** Word of the `lato` column for "both" (import also accepts it in any case). */
export const SIDE_BOTH_WORD = "entrambi";

/** First names of the two partners as the app shows them; `null` = not set. */
export interface PartnerNames {
  a: string | null;
  b: string | null;
}

/** Words that already mean something in the `lato` column: a partner called like this is ambiguous. */
const RESERVED_SIDE_WORDS: ReadonlySet<string> = new Set(["a", "b", "both", SIDE_BOTH_WORD]);

/**
 * The partner names usable in the `lato` column. A name is usable only if it exists, differs from
 * the other partner's (accents and case ignored) and is not a reserved word. Otherwise that side is
 * written as its letter, so the round trip stays exact (plan: "lettera se il nome è ambiguo").
 */
export function usableSideNames(partners: PartnerNames): { a: string | null; b: string | null } {
  const a = normalizeText(partners.a);
  const b = normalizeText(partners.b);
  const clear = (key: string) => key !== "" && !RESERVED_SIDE_WORDS.has(key);
  const same = a === b;
  return {
    a: clear(a) && !same ? (partners.a ?? "").trim() : null,
    b: clear(b) && !same ? (partners.b ?? "").trim() : null,
  };
}

/**
 * All LIVE guests, whatever filters the screen has, never the deleted ones. A guest in a deleted
 * group is written without a group ("Senza gruppo"). Order is the order given.
 */
export function guestsToCsv(
  guests: readonly Guest[],
  groups: readonly GuestGroup[],
  partners: PartnerNames,
): string {
  const liveGroups = new Map(groups.filter((g) => !g.deletedAt).map((g) => [g.id, g.name]));
  const names = usableSideNames(partners);
  const side = (guest: Guest): string => {
    if (guest.side === "both") return SIDE_BOTH_WORD;
    if (guest.side === "A") return names.a ?? "A";
    if (guest.side === "B") return names.b ?? "B";
    return "";
  };
  const rows = guests
    .filter((guest) => !guest.deletedAt)
    .map((guest) => [
      guest.firstName,
      guest.lastName,
      CATEGORY_WORDS[guest.category],
      side(guest),
      guest.groupId ? (liveGroups.get(guest.groupId) ?? null) : null,
      guest.phone,
      guest.email,
      guest.notes,
    ]);
  return toCsv(GUEST_CSV_COLUMNS, rows);
}
