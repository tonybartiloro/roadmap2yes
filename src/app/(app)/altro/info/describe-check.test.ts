import { describe, expect, it } from "vitest";
import { checkLabel, describeCheck } from "./describe-check";

const NOW = new Date("2026-12-03T10:00:00Z"); // 11:00 in Rome (winter)

describe("describeCheck", () => {
  it("says today with the Rome time", () => {
    expect(describeCheck(new Date("2026-12-03T05:12:00Z"), NOW)).toBe("oggi alle 06:12");
  });

  it("says yesterday", () => {
    expect(describeCheck(new Date("2026-12-02T05:12:00Z"), NOW)).toBe("ieri alle 06:12");
  });

  it("uses the Rome day, not the UTC one, around midnight", () => {
    // 23:30 UTC on the 2nd is 00:30 on the 3rd in Rome: today.
    expect(describeCheck(new Date("2026-12-02T23:30:00Z"), NOW)).toBe("oggi alle 00:30");
  });

  it("uses the long date from two days on", () => {
    expect(describeCheck(new Date("2026-11-30T05:12:00Z"), NOW)).toMatch(
      /^.*30.*novembre.* alle 06:12$/,
    );
  });

  it("says nobody checked yet when there is no heartbeat", () => {
    expect(checkLabel(null, NOW)).toBe("ancora nessuno");
    expect(checkLabel(new Date("2026-12-03T05:12:00Z"), NOW)).toBe("oggi alle 06:12");
  });
});
