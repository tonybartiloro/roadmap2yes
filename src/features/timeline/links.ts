/**
 * Where the Percorso sends the person to act on the date decision: `/scelte/[key]` (T12) with the
 * decision key `date` (`decisions.key`). Single place to change if that route moves.
 */
export const DATE_DECISION_HREF = "/scelte/date";

/** The guest list, linked from the guest tasks of the Percorso (no auto-completion). */
export const GUESTS_HREF = "/invitati";

/** Template keys of the tasks that get "Vai a Invitati" in their sheet. */
export const GUESTS_TASK_KEYS: ReadonlySet<string> = new Set([
  "lista-invitati-preliminare",
  "raccogli-conferme",
]);

export const PERCORSO_HREF = "/percorso";

/** `?anteprima=<option id>` preview URL (design §3.8): the state lives in the URL. */
export function previewHref(optionId: string): string {
  return `${PERCORSO_HREF}?anteprima=${encodeURIComponent(optionId)}`;
}
