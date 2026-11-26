import type { Guest, GuestTable } from "./types";

export const TABLE_NAME_MAX = 60;
export const CAPACITY_MIN = 1;
export const CAPACITY_MAX = 50;

/** Name of a table: required, at most 60 characters. `null` = valid. */
export function validateTableName(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (v === "") return "Scrivi il nome del tavolo.";
  return v.length > TABLE_NAME_MAX
    ? `Il nome del tavolo può avere al massimo ${TABLE_NAME_MAX} caratteri.`
    : null;
}

/**
 * Capacity as typed in the form: empty = no capacity (valid), otherwise a whole number from 1 to
 * 50. Returns the parsed value (`null` for empty) or a message.
 */
export function parseCapacity(
  value: string | number | null | undefined,
): { ok: true; capacity: number | null } | { ok: false; message: string } {
  const text = String(value ?? "").trim();
  if (text === "") return { ok: true, capacity: null };
  const bad = {
    ok: false,
    message: `La capienza è un numero intero da ${CAPACITY_MIN} a ${CAPACITY_MAX}.`,
  } as const;
  if (!/^\d+$/.test(text)) return bad;
  const n = Number(text);
  return n >= CAPACITY_MIN && n <= CAPACITY_MAX ? { ok: true, capacity: n } : bad;
}

/** The table a guest really sits at: a deleted table means "Senza tavolo" (P2). */
export function liveTableOf(
  guest: Pick<Guest, "tableId">,
  tables: readonly GuestTable[],
): GuestTable | null {
  if (!guest.tableId) return null;
  const table = tables.find((t) => t.id === guest.tableId);
  return table && !table.deletedAt ? table : null;
}

export interface Occupancy {
  tableId: string;
  /** People who take a seat: live guests at the table, infants excluded (AC14). */
  seated: number;
  /** Infants at the table: counted apart, no seat. */
  infants: number;
  capacity: number | null;
  /** Seats over the capacity (0 when within it or without capacity). Allowed, never blocked. */
  over: number;
}

/** Seats used by a table. Deleted guests never count. */
export function occupancy(table: GuestTable, guests: readonly Guest[]): Occupancy {
  let seated = 0;
  let infants = 0;
  for (const g of guests) {
    if (g.deletedAt || g.tableId !== table.id) continue;
    if (g.category === "infant") infants += 1;
    else seated += 1;
  }
  const over = table.capacity !== null && seated > table.capacity ? seated - table.capacity : 0;
  return { tableId: table.id, seated, infants, capacity: table.capacity, over };
}

/** Occupancy of every live table, by id (one pass over the guests). */
export function occupancyByTable(
  tables: readonly GuestTable[],
  guests: readonly Guest[],
): Map<string, Occupancy> {
  const live = tables.filter((t) => !t.deletedAt);
  const seats = new Map(live.map((t) => [t.id, { seated: 0, infants: 0 }]));
  for (const g of guests) {
    const entry = g.deletedAt || !g.tableId ? undefined : seats.get(g.tableId);
    if (!entry) continue;
    if (g.category === "infant") entry.infants += 1;
    else entry.seated += 1;
  }
  return new Map(
    live.map((t) => {
      const { seated, infants } = seats.get(t.id)!;
      const over = t.capacity !== null && seated > t.capacity ? seated - t.capacity : 0;
      return [t.id, { tableId: t.id, seated, infants, capacity: t.capacity, over }];
    }),
  );
}

/** "7 / 8 posti", or "7 posti occupati" when the table has no capacity. */
export function seatsText(o: Occupancy): string {
  if (o.capacity === null)
    return o.seated === 1 ? "1 posto occupato" : `${o.seated} posti occupati`;
  return `${o.seated} / ${o.capacity} posti`;
}

/** "Oltre la capienza di 8" (text, never only colour), or `null` when within it. */
export function overText(o: Occupancy): string | null {
  return o.over > 0 && o.capacity !== null ? `Oltre la capienza di ${o.capacity}` : null;
}

/** "Neonati: 1 (non occupano posto)", or `null` when there are none. */
export function infantsText(o: Occupancy): string | null {
  return o.infants > 0 ? `Neonati: ${o.infants} (non occupano posto)` : null;
}

/** "1 tavolo oltre la capienza" / "2 tavoli oltre la capienza", or `null` when none is over. */
export function overSummary(occupancies: Iterable<Occupancy>): string | null {
  let n = 0;
  for (const o of occupancies) if (o.over > 0) n += 1;
  if (n === 0) return null;
  return n === 1 ? "1 tavolo oltre la capienza" : `${n} tavoli oltre la capienza`;
}

/**
 * "Aggiungi un gruppo intero": splits the live members of a group into those who can simply sit
 * at the target table and those already seated at ANOTHER live table (the screen asks first).
 */
export function planGroupSeating(
  members: readonly Guest[],
  tables: readonly GuestTable[],
  targetTableId: string,
): { toSeat: Guest[]; alreadyElsewhere: { guest: Guest; table: GuestTable }[] } {
  const toSeat: Guest[] = [];
  const alreadyElsewhere: { guest: Guest; table: GuestTable }[] = [];
  for (const guest of members) {
    if (guest.deletedAt) continue;
    const table = liveTableOf(guest, tables);
    if (!table) toSeat.push(guest);
    else if (table.id !== targetTableId) alreadyElsewhere.push({ guest, table });
  }
  return { toSeat, alreadyElsewhere };
}
