/** How a person is shown in the UI (design §7: tone). Never a fixed "sposo/sposa". */
export interface NameParts {
  readonly firstName?: string | null;
  readonly lastName?: string | null;
  /** Couple-chosen label, e.g. "Sposo" or free text. */
  readonly label?: string | null;
}

export const PARTNER_FALLBACK_NAME = "il tuo partner";

function clean(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

/** First name, else the label, else "il tuo partner" (or `fallback`). */
export function displayName(
  person: NameParts | null | undefined,
  fallback: string = PARTNER_FALLBACK_NAME,
): string {
  return clean(person?.firstName) || clean(person?.label) || fallback;
}

/** "Tony Rossi"; falls back like `displayName` when there is no first name. */
export function fullName(
  person: NameParts | null | undefined,
  fallback: string = PARTNER_FALLBACK_NAME,
): string {
  const first = clean(person?.firstName);
  if (!first) return displayName(person, fallback);
  const last = clean(person?.lastName);
  return last ? `${first} ${last}` : first;
}
