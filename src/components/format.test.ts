import { describe, expect, it } from "vitest";
import { formatDayMonth, formatElapsed, formatLongDate, formatShortDate, plural } from "./format";

describe("format helpers (Italian, no floating point)", () => {
  it("formats dates", () => {
    expect(formatLongDate("2027-09-03")).toBe("3 settembre 2027");
    expect(formatShortDate("2028-05-14")).toBe("14 mag 2028");
    expect(formatDayMonth("2028-05-01")).toBe("1 mag");
  });

  it("formats elapsed time", () => {
    const now = new Date("2026-11-24T12:00:00Z");
    const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
    expect(formatElapsed(ago(0), now)).toBe("meno di un minuto");
    expect(formatElapsed(ago(1), now)).toBe("1 minuto");
    expect(formatElapsed(ago(2), now)).toBe("2 minuti");
    expect(formatElapsed(ago(60), now)).toBe("1 ora");
    expect(formatElapsed(ago(180), now)).toBe("3 ore");
    expect(formatElapsed(ago(60 * 24), now)).toBe("1 giorno");
    expect(formatElapsed(ago(60 * 24 * 4), now)).toBe("4 giorni");
    expect(formatElapsed(new Date(now.getTime() + 5000), now)).toBe("meno di un minuto");
  });

  it("pluralises", () => {
    expect(plural(1, "giorno", "giorni")).toBe("1 giorno");
    expect(plural(284, "giorno", "giorni")).toBe("284 giorni");
  });
});
