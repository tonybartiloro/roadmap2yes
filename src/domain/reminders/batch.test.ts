import { describe, expect, it } from "vitest";
import { digestBatchKey, isDigestWindow, isoWeekKey, isoWeekday, reminderBatchKey } from "./batch";

describe("isoWeekday", () => {
  it("1 = Monday ... 7 = Sunday", () => {
    expect(isoWeekday("2027-03-01")).toBe(1);
    expect(isoWeekday("2027-03-03")).toBe(3);
    expect(isoWeekday("2027-03-07")).toBe(7);
  });
});

describe("isoWeekKey", () => {
  it("handles the 2026-W53 / 2027-W01 boundary", () => {
    expect(isoWeekKey("2026-12-31")).toBe("2026-W53");
    expect(isoWeekKey("2027-01-01")).toBe("2026-W53");
    expect(isoWeekKey("2027-01-03")).toBe("2026-W53");
    expect(isoWeekKey("2027-01-04")).toBe("2027-W01");
    expect(isoWeekKey("2027-01-10")).toBe("2027-W01");
    expect(isoWeekKey("2027-01-11")).toBe("2027-W02");
  });

  it("a 52-week year rolls over on the first Monday containing a Thursday of the new year", () => {
    expect(isoWeekKey("2027-12-27")).toBe("2027-W52");
    expect(isoWeekKey("2028-01-02")).toBe("2027-W52");
    expect(isoWeekKey("2028-01-03")).toBe("2028-W01");
  });

  it("Monday to Wednesday of one week share the key", () => {
    const keys = new Set(["2027-09-06", "2027-09-07", "2027-09-08"].map(isoWeekKey));
    expect(keys.size).toBe(1);
  });
});

describe("batch keys", () => {
  const user = "00000000-0000-4000-8000-000000000001";
  it("contain only the user id and the date", () => {
    expect(reminderBatchKey(user, "2027-03-01")).toBe(`reminder:${user}:2027-03-01`);
    expect(digestBatchKey(user, "2027-01-01")).toBe(`digest:${user}:2026-W53`);
  });
});

describe("isDigestWindow", () => {
  it("is Monday to Wednesday only (D41)", () => {
    expect(["2027-03-01", "2027-03-02", "2027-03-03"].map(isDigestWindow)).toEqual([
      true,
      true,
      true,
    ]);
    expect(["2027-03-04", "2027-03-05", "2027-03-06", "2027-03-07"].map(isDigestWindow)).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });
});
