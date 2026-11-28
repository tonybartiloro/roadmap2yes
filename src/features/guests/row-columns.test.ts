import { describe, expect, it } from "vitest";
import { rowColumns } from "./GuestRow";

// DES-08: at 768 px the fixed columns must leave Nome readable in every combination.
describe("rowColumns", () => {
  it.each([
    [false, false, false],
    [true, false, false],
    [false, true, false],
    [true, true, false],
    [false, false, true],
    [true, false, true],
    [false, true, true],
    [true, true, true],
  ])(
    "group %s, table %s, presence %s: Nome keeps at least 8rem and the others stay narrow",
    (g, t, p) => {
      const template = rowColumns(g, t, p);
      expect(template).toContain("minmax(8rem,1fr)");
      const widths = [...template.matchAll(/_(?:minmax\(0,)?(\d+(?:\.\d+)?)rem/g)].map((m) =>
        Number(m[1]),
      );
      expect(widths.length).toBe(2 + Number(g) + Number(t) + Number(p));
      // the 768 px content width is ~37rem: 8rem Nome + the other columns + the gaps (0.75rem each)
      const others = widths.reduce((a, b) => a + b, 0) + 0.75 * widths.length;
      expect(others).toBeLessThanOrEqual(p ? 29 : 27);
    },
  );
});
