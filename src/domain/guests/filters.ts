import { normalizeText } from "./normalize";
import { sideKeyOf } from "./counts";
import type { Guest, GuestCategory, GuestGroup, GuestTable, SideKey } from "./types";

/** `null` = no filter on that field. `"none"` = "Senza gruppo" / "Senza tavolo". */
export type GuestFilters = {
  query: string;
  side: SideKey | null;
  category: GuestCategory | null;
  groupId: string | "none" | null;
  tableId: string | "none" | null;
};

export const NO_FILTERS: GuestFilters = {
  query: "",
  side: null,
  category: null,
  groupId: null,
  tableId: null,
};

type Context = { groups: readonly GuestGroup[]; tables: readonly GuestTable[] };

const liveIds = (items: readonly { id: string; deletedAt: string | null }[]) =>
  new Set(items.filter((i) => !i.deletedAt).map((i) => i.id));

/** Search by name: every word must appear in "first last" (accents and case ignored). */
export function matchesQuery(guest: Guest, query: string): boolean {
  const words = normalizeText(query).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const name = normalizeText(`${guest.firstName} ${guest.lastName ?? ""}`);
  return words.every((w) => name.includes(w));
}

/** Number of active filters (the search box does not count: it has no chip in the sheet). */
export function activeFilterCount(f: GuestFilters): number {
  return [f.side, f.category, f.groupId, f.tableId].filter((v) => v !== null).length;
}

export const hasActiveFilters = (f: GuestFilters): boolean =>
  activeFilterCount(f) > 0 || normalizeText(f.query) !== "";

/** Live guests matching all filters together. A deleted group/table counts as "none". */
export function filterGuests(
  guests: readonly Guest[],
  filters: GuestFilters,
  { groups, tables }: Context,
): Guest[] {
  const liveGroups = liveIds(groups);
  const liveTables = liveIds(tables);
  return guests.filter((g) => {
    if (g.deletedAt) return false;
    if (filters.side !== null && sideKeyOf(g) !== filters.side) return false;
    if (filters.category !== null && g.category !== filters.category) return false;
    if (filters.groupId !== null) {
      const effective = g.groupId && liveGroups.has(g.groupId) ? g.groupId : "none";
      if (effective !== filters.groupId) return false;
    }
    if (filters.tableId !== null) {
      const effective = g.tableId && liveTables.has(g.tableId) ? g.tableId : "none";
      if (effective !== filters.tableId) return false;
    }
    return matchesQuery(g, filters.query);
  });
}

/** "42 persone", or "12 di 42 persone" when filters narrow the list. */
export function peopleSummary(shown: number, total: number): string {
  const noun = total === 1 ? "persona" : "persone";
  return shown === total ? `${total} ${noun}` : `${shown} di ${total} ${noun}`;
}
