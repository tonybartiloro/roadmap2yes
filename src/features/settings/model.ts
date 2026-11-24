import type { Rite } from "@/content/milestones/types";
import { RITE_LABELS } from "@/features/onboarding/model";

/** Pure helpers of Impostazioni and Profili (no Next.js, no React). */

export function isRiteKey(value: unknown): value is Rite {
  return typeof value === "string" && value in RITE_LABELS;
}

/** The couple's answers of Impostazioni nozze as the form edits them. */
export interface SettingsValues {
  rite: Rite | null;
  guestBand: string | null;
  styleLabel: string | null;
  styleNote: string;
  region: string | null;
  comune: string;
  /** Text of the budget total as typed (euros); "" = none. */
  budgetText: string;
}

export const SESSION_EXPIRED = "La sessione è scaduta. Entra di nuovo: non hai perso nulla.";
export const GENERIC_ERROR =
  "Non sono riuscito a salvare. Riprova: quello che hai scritto resta qui.";

/** Where "Suggerimenti da rivedere" lives (Percorso): a changed rite lands there (AC16, AC48). */
export const SUGGESTIONS_HREF = "/percorso";

/**
 * `weddings.onboarding_unknown` after an edit: the steps the form owns are recomputed from the
 * answers; the others (partner, dates, theme) stay as they were.
 */
export function recomputeUnknown(
  current: readonly string[],
  answers: {
    rite: Rite | null;
    guestBand: string | null;
    styleLabel: string | null;
    styleNote: string | null;
    region: string | null;
    comune: string | null;
    hasBudget: boolean;
  },
): string[] {
  const owned = new Set(["rite", "guests", "style", "budget"]);
  const kept = current.filter((id) => !owned.has(id));
  const unknown: string[] = [];
  if (answers.rite === null || answers.rite === "unknown") unknown.push("rite");
  if (answers.guestBand === null || answers.guestBand === "unknown") unknown.push("guests");
  if (!answers.styleLabel && !answers.styleNote && !answers.region && !answers.comune) {
    unknown.push("style");
  }
  if (!answers.hasBudget) unknown.push("budget");
  return [...kept, ...unknown];
}
