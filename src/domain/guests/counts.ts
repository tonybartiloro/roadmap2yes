import type { Guest, GuestCounts, SideKey } from "./types";

export const SIDE_KEYS: readonly SideKey[] = ["A", "B", "both", "none"];

export const emptyCounts = (): GuestCounts => ({ total: 0, adult: 0, child: 0, infant: 0 });

export const sideKeyOf = (guest: Pick<Guest, "side">): SideKey => guest.side ?? "none";

/** People per category. Deleted guests are never counted; infants count in the total. */
export function countGuests(guests: readonly Guest[]): GuestCounts {
  const counts = emptyCounts();
  for (const g of guests) {
    if (g.deletedAt) continue;
    counts[g.category] += 1;
    counts.total += 1;
  }
  return counts;
}

/** The same four numbers for A, B, both and "Senza lato". */
export function countBySide(guests: readonly Guest[]): Record<SideKey, GuestCounts> {
  const result: Record<SideKey, GuestCounts> = {
    A: emptyCounts(),
    B: emptyCounts(),
    both: emptyCounts(),
    none: emptyCounts(),
  };
  for (const g of guests) {
    if (g.deletedAt) continue;
    const c = result[sideKeyOf(g)];
    c[g.category] += 1;
    c.total += 1;
  }
  return result;
}
