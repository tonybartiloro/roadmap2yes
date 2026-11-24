import { describe, expect, it } from "vitest";
import vectors from "../../../tests/fixtures/date-offset-vectors.json";
import {
  addDays,
  addMonths,
  applyOffset,
  comparePlainDates,
  diffDays,
  isPlainDate,
  parsePlainDate,
  todayInRome,
} from "./plain-date";

describe("applyOffset: shared vectors (also run with TZ=UTC and TZ=America/Los_Angeles)", () => {
  it("has the vectors the SQL side needs", () => {
    const refs = new Set(vectors.vectors.map((v) => v.reference));
    for (const needed of ["2027-08-31", "2028-08-31", "2028-02-29", "2027-03-28", "2027-10-31"]) {
      expect(refs.has(needed)).toBe(true);
    }
    expect(vectors.vectors.some((v) => Object.values(v.offset).some((n) => n < 0))).toBe(true);
  });

  it.each(vectors.vectors.map((v) => [v.note, v] as const))("%s", (_note, v) => {
    expect(applyOffset(v.reference, v.offset)).toBe(v.expected);
  });

  it("applies months before weeks: 2m+2w from 2027-08-31 is 2027-06-16, not 2027-06-17", () => {
    const result = applyOffset("2027-08-31", { months: 2, weeks: 2 });
    expect(result).toBe("2027-06-16");
    expect(result).not.toBe(addMonths(addDays("2027-08-31", -14), -2));
    expect(addMonths(addDays("2027-08-31", -14), -2)).toBe("2027-06-17");
  });
});

describe("plain date helpers", () => {
  it("validates strictly", () => {
    expect(isPlainDate("2028-02-29")).toBe(true);
    expect(isPlainDate("2027-02-29")).toBe(false);
    expect(isPlainDate("2027-13-01")).toBe(false);
    expect(isPlainDate("2027-1-1")).toBe(false);
    expect(isPlainDate(20270101)).toBe(false);
    expect(() => parsePlainDate("nope")).toThrow(RangeError);
  });

  it("diffDays is exact across DST changes", () => {
    expect(diffDays("2027-03-27", "2027-03-29")).toBe(2);
    expect(diffDays("2027-10-30", "2027-11-01")).toBe(2);
    expect(diffDays("2027-09-03", "2026-11-24")).toBe(-283);
    expect(diffDays("2026-11-24", "2027-09-03")).toBe(283);
  });

  it("compares lexicographically", () => {
    expect(comparePlainDates("2027-01-01", "2027-01-02")).toBe(-1);
    expect(comparePlainDates("2027-01-02", "2027-01-02")).toBe(0);
    expect(comparePlainDates("2028-01-01", "2027-12-31")).toBe(1);
  });
});

describe("todayInRome", () => {
  it.each([
    ["2026-11-24T23:30:00Z", "2026-11-25"], // CET: already after midnight in Rome
    ["2026-11-24T22:59:59Z", "2026-11-24"],
    ["2027-03-27T22:59:59Z", "2027-03-27"], // day before the spring change
    ["2027-03-27T23:00:00Z", "2027-03-28"],
    ["2027-03-28T23:30:00Z", "2027-03-29"], // CEST (+2) after the change
    ["2027-03-28T21:59:59Z", "2027-03-28"],
    ["2027-08-31T22:00:00Z", "2027-09-01"], // CEST midnight
    ["2027-10-30T22:00:00Z", "2027-10-31"],
    ["2027-10-31T22:30:00Z", "2027-10-31"], // CET after the autumn change: still the 31st
    ["2027-10-31T23:00:00Z", "2027-11-01"],
  ])("%s -> %s", (iso, expected) => {
    expect(todayInRome(new Date(iso))).toBe(expected);
  });
});
