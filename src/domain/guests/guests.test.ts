import { describe, expect, it } from "vitest";
import {
  NO_FILTERS,
  activeFilterCount,
  bandOf,
  countBySide,
  countGuests,
  filterGuests,
  findDuplicates,
  normalizeText,
  peopleSummary,
  validateEmail,
  validateFirstName,
  validateGuest,
  validatePhone,
  type Guest,
  type GuestGroup,
  type GuestTable,
} from ".";

let n = 0;
const guest = (extra: Partial<Guest> = {}): Guest => ({
  id: `g${++n}`,
  firstName: "Mario",
  lastName: "Rossi",
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
const group = (id: string, deletedAt: string | null = null): GuestGroup => ({
  id,
  name: id,
  deletedAt,
});
const table = (id: string, deletedAt: string | null = null): GuestTable => ({
  id,
  name: id,
  capacity: 8,
  deletedAt,
});

describe("counts", () => {
  const guests = [
    guest({ side: "A" }),
    guest({ side: "A", category: "child" }),
    guest({ side: "B", category: "infant" }),
    guest({ side: "both" }),
    guest({}),
    guest({ category: "infant", deletedAt: "2026-01-01" }),
  ];

  it("counts by category with infants in the total and skips deleted", () => {
    expect(countGuests(guests)).toEqual({ total: 5, adult: 3, child: 1, infant: 1 });
  });

  it("counts by side including Senza lato", () => {
    const by = countBySide(guests);
    expect(by.A).toEqual({ total: 2, adult: 1, child: 1, infant: 0 });
    expect(by.B).toEqual({ total: 1, adult: 0, child: 0, infant: 1 });
    expect(by.both.total).toBe(1);
    expect(by.none.total).toBe(1);
  });

  it("is all zeros for an empty list", () => {
    expect(countGuests([])).toEqual({ total: 0, adult: 0, child: 0, infant: 0 });
  });
});

describe("filters", () => {
  const groups = [group("rossi"), group("gone", "2026-01-01")];
  const tables = [table("t1"), table("t2", "2026-01-01")];
  const ctx = { groups, tables };
  const a = guest({ firstName: "Niccolò", lastName: "Bianchi", side: "A", groupId: "rossi", tableId: "t1" });
  const b = guest({ firstName: "Anna", category: "child", side: "B", groupId: "gone", tableId: "t2" });
  const c = guest({ firstName: "Zoe", category: "infant" });
  const dead = guest({ firstName: "Niccolò", deletedAt: "2026-01-01" });
  const all = [a, b, c, dead];

  it("returns every live guest without filters", () => {
    expect(filterGuests(all, NO_FILTERS, ctx)).toEqual([a, b, c]);
  });

  it("combines filters with AND", () => {
    expect(filterGuests(all, { ...NO_FILTERS, side: "A", category: "adult" }, ctx)).toEqual([a]);
    expect(filterGuests(all, { ...NO_FILTERS, side: "A", category: "child" }, ctx)).toEqual([]);
  });

  it("filters by Senza lato", () => {
    expect(filterGuests(all, { ...NO_FILTERS, side: "none" }, ctx)).toEqual([c]);
  });

  it("treats a deleted group or table as Senza gruppo / Senza tavolo", () => {
    expect(filterGuests(all, { ...NO_FILTERS, groupId: "none" }, ctx)).toEqual([b, c]);
    expect(filterGuests(all, { ...NO_FILTERS, tableId: "none" }, ctx)).toEqual([b, c]);
    expect(filterGuests(all, { ...NO_FILTERS, groupId: "rossi" }, ctx)).toEqual([a]);
    expect(filterGuests(all, { ...NO_FILTERS, tableId: "t1" }, ctx)).toEqual([a]);
  });

  it("searches by name ignoring accents, case and word order", () => {
    expect(filterGuests(all, { ...NO_FILTERS, query: "NICCOLO" }, ctx)).toEqual([a]);
    expect(filterGuests(all, { ...NO_FILTERS, query: "bianchi nic" }, ctx)).toEqual([a]);
    expect(filterGuests(all, { ...NO_FILTERS, query: "  " }, ctx)).toHaveLength(3);
  });

  it("counts active filters, not the search box", () => {
    expect(activeFilterCount({ ...NO_FILTERS, query: "x" })).toBe(0);
    expect(activeFilterCount({ ...NO_FILTERS, side: "A", tableId: "none" })).toBe(2);
  });

  it("formats the filtered count", () => {
    expect(peopleSummary(12, 42)).toBe("12 di 42 persone");
    expect(peopleSummary(42, 42)).toBe("42 persone");
    expect(peopleSummary(1, 1)).toBe("1 persona");
    expect(peopleSummary(0, 42)).toBe("0 di 42 persone");
  });
});

describe("duplicates", () => {
  const existing = [
    guest({ firstName: "Niccolò", lastName: "Rossi" }),
    guest({ firstName: "Anna", lastName: null, deletedAt: "2026-01-01" }),
  ];

  it("matches ignoring accents, case and spaces", () => {
    expect(findDuplicates({ firstName: " NICCOLO ", lastName: "rossi" }, existing)).toHaveLength(1);
  });

  it("does not match different surnames, deleted guests or the guest itself", () => {
    expect(findDuplicates({ firstName: "Niccolò", lastName: "Verdi" }, existing)).toEqual([]);
    expect(findDuplicates({ firstName: "Anna", lastName: null }, existing)).toEqual([]);
    expect(
      findDuplicates({ firstName: "Niccolò", lastName: "Rossi" }, existing, existing[0]!.id),
    ).toEqual([]);
  });

  it("ignores an empty first name", () => {
    expect(findDuplicates({ firstName: "", lastName: "" }, existing)).toEqual([]);
  });
});

describe("validation", () => {
  it("requires a first name of at most 80 characters", () => {
    expect(validateFirstName("")).toMatch(/nome/);
    expect(validateFirstName("   ")).not.toBeNull();
    expect(validateFirstName("a".repeat(80))).toBeNull();
    expect(validateFirstName("a".repeat(81))).not.toBeNull();
  });

  it("accepts phones of 6-20 allowed characters, empty included", () => {
    expect(validatePhone("")).toBeNull();
    expect(validatePhone("12345")).not.toBeNull();
    expect(validatePhone("123456")).toBeNull();
    expect(validatePhone("1".repeat(20))).toBeNull();
    expect(validatePhone("1".repeat(21))).not.toBeNull();
    expect(validatePhone("+39 (333) 123-45.6/7")).toBeNull();
    expect(validatePhone("333abc4567")).not.toBeNull();
  });

  it("validates emails loosely", () => {
    expect(validateEmail("")).toBeNull();
    expect(validateEmail("a@example.test")).toBeNull();
    expect(validateEmail("a@example")).not.toBeNull();
    expect(validateEmail("a b@example.test")).not.toBeNull();
    expect(validateEmail(`${"a".repeat(250)}@e.it`)).not.toBeNull();
  });

  it("validates notes, category and side together", () => {
    expect(validateGuest({ firstName: "Mario" })).toEqual({});
    expect(validateGuest({ firstName: "Mario", notes: "n".repeat(500) })).toEqual({});
    expect(Object.keys(validateGuest({ firstName: "", notes: "n".repeat(501) }))).toEqual([
      "firstName",
      "notes",
    ]);
    expect(validateGuest({ firstName: "M", category: "teen" }).category).toBeDefined();
    expect(validateGuest({ firstName: "M", side: "C" }).side).toBeDefined();
    expect(validateGuest({ firstName: "M", side: null, category: "infant" })).toEqual({});
  });
});

describe("bandOf", () => {
  it.each([
    [0, "up_to_50"],
    [50, "up_to_50"],
    [51, "50_80"],
    [80, "50_80"],
    [81, "80_120"],
    [120, "80_120"],
    [121, "over_120"],
    [1200, "over_120"],
  ])("%i people -> %s", (count, band) => {
    expect(bandOf(count)).toBe(band);
  });
});

describe("normalizeText", () => {
  it("strips accents, case and extra spaces", () => {
    expect(normalizeText("  Niccolò   DELLA  Rovère ")).toBe("niccolo della rovere");
    expect(normalizeText(null)).toBe("");
  });
});
