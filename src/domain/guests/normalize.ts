// Combining diacritical marks, written as escapes so editors cannot lose them.
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

/** Lowercase, accent-insensitive, single-spaced text for comparisons and search. */
export function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
