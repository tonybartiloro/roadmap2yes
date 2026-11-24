import { MILESTONES } from "./it";
import { RITES, type Milestone, type Rite } from "./types";

export { MILESTONES } from "./it";
export { CATEGORY_LABELS } from "./categories";
export * from "./types";

/** AC25: single constant for the bureaucratic note. */
export const BUREAUCRATIC_DISCLAIMER =
  "Indicativo: verificate sempre con il comune o la parrocchia";

/** The milestones key that asks the couple to choose the rite (AC63). */
export const CHOOSE_RITE_KEY = "scegli-il-rito";

export function isRite(value: unknown): value is Rite {
  return typeof value === "string" && (RITES as readonly string[]).includes(value);
}

/** Milestones generated for a rite (AC25, AC63): `unknown` gets only the ones tagged `unknown`. */
export function milestonesForRite(rite: Rite): readonly Milestone[] {
  return MILESTONES.filter((m) => m.rites.includes(rite));
}

const BY_KEY = new Map(MILESTONES.map((m) => [m.key, m]));

export function getMilestone(key: string): Milestone | undefined {
  return BY_KEY.get(key);
}
