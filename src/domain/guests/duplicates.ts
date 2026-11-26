import { normalizeText } from "./normalize";
import type { Guest } from "./types";

/** Same first and last name, ignoring case, spaces and accents. */
export function duplicateKey(firstName: string | null, lastName: string | null): string {
  return `${normalizeText(firstName)}|${normalizeText(lastName)}`;
}

/**
 * Live guests with the same name as the candidate (a warning, never an error: BR4).
 * `excludeId` skips the guest being edited.
 */
export function findDuplicates(
  candidate: { firstName: string | null; lastName: string | null },
  guests: readonly Guest[],
  excludeId?: string,
): Guest[] {
  if (normalizeText(candidate.firstName) === "") return [];
  const key = duplicateKey(candidate.firstName, candidate.lastName);
  return guests.filter(
    (g) => !g.deletedAt && g.id !== excludeId && duplicateKey(g.firstName, g.lastName) === key,
  );
}
