import { plural } from "@/components/format";
import {
  normalizeText,
  type Guest,
  type GuestCategory,
  type GuestCounts,
  type GuestSide,
} from "@/domain/guests";
import type { GroupView, GuestView } from "./data";

/** Rows shown at a time per list, and the size above which groups start closed (design §2.1). */
export const PAGE_SIZE = 100;
export const COLLAPSE_ABOVE = 100;

export interface PartnerNames {
  a: string;
  b: string;
}

export const fullName = (g: Pick<Guest, "firstName" | "lastName">): string =>
  [g.firstName, g.lastName].filter(Boolean).join(" ");

export function compareNames(a: Pick<Guest, "firstName" | "lastName">, b: typeof a): number {
  const left = normalizeText(`${a.lastName ?? ""} ${a.firstName}`);
  const right = normalizeText(`${b.lastName ?? ""} ${b.firstName}`);
  return left < right ? -1 : left > right ? 1 : 0;
}

export function sideText(side: GuestSide | null, partners: PartnerNames): string {
  if (side === "A") return partners.a;
  if (side === "B") return partners.b;
  return side === "both" ? "Entrambi" : "Non indicato";
}

/** Short type text for a row: nothing for an adult. */
export const typeText = (category: GuestCategory): string =>
  category === "child" ? "Bambino" : category === "infant" ? "Neonato" : "";

const typeWord = (category: GuestCategory): string =>
  category === "child" ? "bambino" : category === "infant" ? "neonato" : "adulto";

/** "2 adulti, 1 bambino" (zeros left out). */
export function categorySummary(counts: GuestCounts): string {
  const parts = [
    counts.adult > 0 ? plural(counts.adult, "adulto", "adulti") : "",
    counts.child > 0 ? plural(counts.child, "bambino", "bambini") : "",
    counts.infant > 0 ? plural(counts.infant, "neonato", "neonati") : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "nessuno";
}

/** "42 persone · 30 adulti · 8 bambini · 4 neonati" (all four numbers, always). */
export function breakdown(counts: GuestCounts): string {
  return [
    plural(counts.adult, "adulto", "adulti"),
    plural(counts.child, "bambino", "bambini"),
    plural(counts.infant, "neonato", "neonati"),
  ].join(" · ");
}

/** Accessible name of a row: "Mario Rossi, adulto, Famiglia Rossi". */
export function rowLabel(guest: Guest, groupName: string | null): string {
  return [fullName(guest), typeWord(guest.category), groupName].filter(Boolean).join(", ");
}

export interface Section {
  /** `null` = "Senza gruppo". */
  id: string | null;
  name: string;
  group: GroupView | null;
  members: GuestView[];
}

/** Live group id of a guest; a deleted group means "Senza gruppo" (P2). */
export function liveGroupId(guest: Guest, groups: readonly GroupView[]): string | null {
  const group = guest.groupId ? groups.find((g) => g.id === guest.groupId) : undefined;
  return group && !group.deletedAt ? group.id : null;
}

/**
 * Sections for the grouped list: live groups by name, then "Senza gruppo". `guests` are the live
 * guests to show; empty groups appear only when `keepEmpty` (no filters active).
 */
export function buildSections(
  guests: readonly GuestView[],
  groups: readonly GroupView[],
  keepEmpty: boolean,
): Section[] {
  const members = new Map<string | null, GuestView[]>();
  for (const guest of guests) {
    const key = liveGroupId(guest, groups);
    members.set(key, [...(members.get(key) ?? []), guest]);
  }
  const sections: Section[] = groups
    .filter((g) => !g.deletedAt)
    .toSorted((a, b) => (normalizeText(a.name) < normalizeText(b.name) ? -1 : 1))
    .map((group) => ({
      id: group.id,
      name: group.name,
      group,
      members: (members.get(group.id) ?? []).toSorted(compareNames),
    }))
    .filter((section) => keepEmpty || section.members.length > 0);
  const loose = members.get(null) ?? [];
  if (loose.length > 0) {
    sections.push({
      id: null,
      name: "Senza gruppo",
      group: null,
      members: loose.toSorted(compareNames),
    });
  }
  return sections;
}
