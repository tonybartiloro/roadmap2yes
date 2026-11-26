import { describe, expect, it } from "vitest";
import {
  infantsText,
  occupancy,
  occupancyByTable,
  overSummary,
  overText,
  parseCapacity,
  planGroupSeating,
  seatsText,
  validateTableName,
  type Guest,
  type GuestTable,
} from ".";

let n = 0;
const guest = (extra: Partial<Guest> = {}): Guest => ({
  id: `g${++n}`,
  firstName: "Mario",
  lastName: null,
  category: "adult",
  side: null,
  phone: null,
  email: null,
  notes: null,
  groupId: null,
  tableId: null,
  deletedAt: null,
  ...extra,
});
const table = (
  id: string,
  capacity: number | null,
  deletedAt: string | null = null,
): GuestTable => ({
  id,
  name: id,
  capacity,
  deletedAt,
});

describe("occupancy (AC14)", () => {
  const t = table("t1", 3);

  it("infants take no seat but are counted apart; deleted guests never count", () => {
    const guests = [
      guest({ tableId: "t1" }),
      guest({ tableId: "t1", category: "child" }),
      guest({ tableId: "t1", category: "infant" }),
      guest({ tableId: "t1", deletedAt: "2026-01-01" }),
      guest({ tableId: "t2" }),
    ];
    const o = occupancy(t, guests);
    expect(o).toMatchObject({ seated: 2, infants: 1, over: 0 });
    expect(seatsText(o)).toBe("2 / 3 posti");
    expect(infantsText(o)).toBe("Neonati: 1 (non occupano posto)");
    expect(overText(o)).toBeNull();
  });

  it("is over capacity only above it (boundary), in written text", () => {
    const seat = (count: number) => Array.from({ length: count }, () => guest({ tableId: "t1" }));
    expect(occupancy(t, seat(3)).over).toBe(0);
    const over = occupancy(t, seat(4));
    expect(over.over).toBe(1);
    expect(overText(over)).toBe("Oltre la capienza di 3");
  });

  it("an infant never pushes a table over", () => {
    const guests = [
      ...Array.from({ length: 3 }, () => guest({ tableId: "t1" })),
      guest({ tableId: "t1", category: "infant" }),
    ];
    expect(occupancy(t, guests).over).toBe(0);
  });

  it("without capacity there is no limit and the text only counts seats", () => {
    const o = occupancy(table("t9", null), [guest({ tableId: "t9" }), guest({ tableId: "t9" })]);
    expect(o.over).toBe(0);
    expect(seatsText(o)).toBe("2 posti occupati");
    expect(seatsText(occupancy(table("t9", null), [guest({ tableId: "t9" })]))).toBe(
      "1 posto occupato",
    );
  });

  it("summarises the tables over capacity and ignores deleted tables", () => {
    const tables = [table("a", 1), table("b", 1), table("c", 5), table("d", 1, "2026-01-01")];
    const guests = [
      guest({ tableId: "a" }),
      guest({ tableId: "a" }),
      guest({ tableId: "b" }),
      guest({ tableId: "b" }),
      guest({ tableId: "d" }),
      guest({ tableId: "d" }),
    ];
    const map = occupancyByTable(tables, guests);
    expect([...map.keys()]).toEqual(["a", "b", "c"]);
    expect(overSummary(map.values())).toBe("2 tavoli oltre la capienza");
    expect(overSummary([map.get("a")!, map.get("c")!])).toBe("1 tavolo oltre la capienza");
    expect(overSummary([map.get("c")!])).toBeNull();
  });
});

describe("table fields", () => {
  it("requires a name of at most 60 characters", () => {
    expect(validateTableName("")).not.toBeNull();
    expect(validateTableName("  ")).not.toBeNull();
    expect(validateTableName("a".repeat(60))).toBeNull();
    expect(validateTableName("a".repeat(61))).not.toBeNull();
  });

  it.each([
    ["", true, null],
    ["  ", true, null],
    ["1", true, 1],
    ["50", true, 50],
    ["0", false, undefined],
    ["51", false, undefined],
    ["8.5", false, undefined],
    ["-3", false, undefined],
    ["abc", false, undefined],
  ])("capacity %j", (text, ok, value) => {
    const parsed = parseCapacity(text);
    expect(parsed.ok).toBe(ok);
    if (parsed.ok) expect(parsed.capacity).toBe(value);
  });

  it("accepts a number and null", () => {
    expect(parseCapacity(8)).toEqual({ ok: true, capacity: 8 });
    expect(parseCapacity(null)).toEqual({ ok: true, capacity: null });
  });
});

describe("planGroupSeating (AC15)", () => {
  it("separates free people from those seated at another live table", () => {
    const tables = [table("t1", 8), table("t2", 8), table("gone", 8, "2026-01-01")];
    const free = guest();
    const here = guest({ tableId: "t1" });
    const elsewhere = guest({ tableId: "t2" });
    const atDeleted = guest({ tableId: "gone" });
    const dead = guest({ deletedAt: "2026-01-01" });
    const plan = planGroupSeating([free, here, elsewhere, atDeleted, dead], tables, "t1");
    expect(plan.toSeat).toEqual([free, atDeleted]);
    expect(plan.alreadyElsewhere.map((x) => x.guest)).toEqual([elsewhere]);
    expect(plan.alreadyElsewhere[0]!.table.id).toBe("t2");
  });
});
