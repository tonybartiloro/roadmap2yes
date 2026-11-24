import { describe, expect, it } from "vitest";
import {
  MAX_CENTS,
  MONEY_ERROR_MESSAGE,
  formatCents,
  formatCentsPlain,
  formatEuro,
  parseEuroToCents,
} from "./money";

const ok = (input: string) => {
  const r = parseEuroToCents(input);
  return r.ok ? r.cents : r;
};

describe("parseEuroToCents (AC38, D40)", () => {
  it.each([
    ["1.500", 150000],
    ["1.234,56", 123456],
    ["1,234.56", 123456],
    ["1234,5", 123450],
    ["1234.5", 123450],
    ["12,50", 1250],
    ["1.5", 150],
    ["1.50", 150],
    ["0", 0],
    ["0,05", 5],
    ["1.234.567", 123456700],
    ["1.234.567,89", 123456789],
    ["1,234,567.89", 123456789],
    ["  € 1.500 ", 150000],
    ["1500", 150000],
    ["007", 700],
    ["10.500", 1050000],
    ["1.000.000.000", MAX_CENTS],
    ["19,99", 1999],
    ["0,29", 29],
    ["1.005,10", 100510],
    [",50", 50],
    [".5", 50],
    ["0000000000001", 100],
  ])("%s -> %d cents", (input, cents) => {
    expect(ok(input)).toBe(cents);
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["-1", "negative"],
    ["−5", "negative"],
    ["abc", "invalid"],
    ["12abc", "invalid"],
    ["12,345", "too-many-decimals"],
    ["1.234,567", "too-many-decimals"],
    ["1.5000", "invalid"],
    ["0.500", "invalid"],
    ["1.234.56", "invalid"],
    ["1,5,5", "invalid"],
    ["12,", "invalid"],
    ["1,5.5", "invalid"],
    ["1.000.000.001", "too-large"],
    ["1000000000,01", "too-large"],
    ["99999999999999999999", "too-large"],
  ])("%j is rejected as %s with the exact inline message", (input, reason) => {
    expect(parseEuroToCents(input)).toEqual({ ok: false, reason, message: MONEY_ERROR_MESSAGE });
  });

  it("uses the exact AC38 text", () => {
    expect(MONEY_ERROR_MESSAGE).toBe("Inserisci un importo in euro, ad esempio 1.500,00");
  });

  it("is exact where floats are not (19,99 and 0,29 never go through multiplication)", () => {
    expect(ok("0,29")).toBe(29);
    expect(ok("1.005,10")).toBe(100510);
  });
});

describe("formatting", () => {
  it("groups thousands even for 4 digits (it-IT would not) and keeps 2 decimals", () => {
    expect(formatCents(123456)).toBe("1.234,56");
    expect(formatCents(150000)).toBe("1.500,00");
    expect(formatCents(5)).toBe("0,05");
    expect(formatCents(0)).toBe("0,00");
    expect(formatCents(100_000_000_000)).toBe("1.000.000.000,00");
  });

  it("formats euros compactly for messages", () => {
    expect(formatEuro(120000)).toBe("€ 1.200");
    expect(formatEuro(120050)).toBe("€ 1.200,50");
  });

  it("formats plain decimals for CSV", () => {
    expect(formatCentsPlain(123456)).toBe("1234,56");
    expect(formatCentsPlain(5)).toBe("0,05");
  });

  it("round-trips through the parser", () => {
    for (const cents of [0, 1, 99, 100, 123456, 100_000_000_000]) {
      expect(ok(formatCents(cents))).toBe(cents);
    }
  });

  it("rejects non-integer cents", () => {
    expect(() => formatCents(1.5)).toThrow(RangeError);
  });
});
