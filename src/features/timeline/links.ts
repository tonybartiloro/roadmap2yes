/**
 * Where the Percorso sends the person to act on the date decision: `/scelte/[key]` (T12) with the
 * decision key `date` (`decisions.key`). Single place to change if that route moves.
 */
export const DATE_DECISION_HREF = "/scelte/date";

export const PERCORSO_HREF = "/percorso";

/** `?anteprima=<option id>` preview URL (design §3.8): the state lives in the URL. */
export function previewHref(optionId: string): string {
  return `${PERCORSO_HREF}?anteprima=${encodeURIComponent(optionId)}`;
}
