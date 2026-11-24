import { describe, expect, it } from "vitest";
import { MONEY_ERROR_MESSAGE } from "@/lib/money";
import { formatConflictValue } from "./field-labels";
import {
  dueText,
  GENERIC_ERROR,
  mapDbError,
  parseAssignedForm,
  parseCategoryNameForm,
  parseItemForm,
  parsePaymentForm,
  parseTotalForm,
} from "./model";

describe("parseTotalForm (AC33, AC38)", () => {
  it("parses to cents with the D40 rules and trims the reason", () => {
    expect(parseTotalForm({ totalText: "25.000", reason: "  Partenza " })).toEqual({
      ok: true,
      input: { totalCents: 2_500_000, reason: "Partenza" },
    });
    expect(parseTotalForm({ totalText: "1,234.56", reason: "" })).toEqual({
      ok: true,
      input: { totalCents: 123_456, reason: null },
    });
  });

  it("refuses an empty, malformed, negative or too large amount with the exact message", () => {
    expect(parseTotalForm({ totalText: "", reason: "" })).toMatchObject({ ok: false });
    for (const text of ["12,345", "abc", "-1", "1.000.000.001"]) {
      expect(parseTotalForm({ totalText: text, reason: "" })).toEqual({
        ok: false,
        errors: { totalText: MONEY_ERROR_MESSAGE },
      });
    }
  });

  it("limits the reason to 300 characters", () => {
    expect(parseTotalForm({ totalText: "10", reason: "x".repeat(301) })).toMatchObject({
      ok: false,
      errors: { reason: expect.stringContaining("300") },
    });
  });
});

describe("categories", () => {
  it("names are trimmed, collapsed and bounded", () => {
    expect(parseCategoryNameForm("  Bomboniere   e regali ")).toEqual({
      ok: true,
      input: { name: "Bomboniere e regali" },
    });
    expect(parseCategoryNameForm("   ")).toMatchObject({ ok: false });
    expect(parseCategoryNameForm("x".repeat(61))).toMatchObject({ ok: false });
  });

  it("Assegnato: empty means 'non assegnato', zero is a real amount", () => {
    expect(parseAssignedForm("")).toEqual({ ok: true, input: { assignedCents: null } });
    expect(parseAssignedForm("0")).toEqual({ ok: true, input: { assignedCents: 0 } });
    expect(parseAssignedForm("1.500")).toEqual({ ok: true, input: { assignedCents: 150_000 } });
    expect(parseAssignedForm("-3")).toMatchObject({ ok: false });
  });
});

describe("parseItemForm (AC35)", () => {
  it("a planned item needs only a description; an empty amount is zero", () => {
    expect(
      parseItemForm({ description: " Torta ", status: "planned", plannedText: "", agreedText: "" }),
    ).toEqual({
      ok: true,
      input: { description: "Torta", status: "planned", plannedCents: 0, agreedCents: null },
    });
  });

  it("the agreed amount counts only for 'Concordato'", () => {
    const base = { description: "Menu", plannedText: "1.000", agreedText: "1.200,50" };
    expect(parseItemForm({ ...base, status: "agreed" })).toMatchObject({
      ok: true,
      input: { plannedCents: 100_000, agreedCents: 120_050 },
    });
    expect(parseItemForm({ ...base, status: "cancelled" })).toMatchObject({
      ok: true,
      input: { agreedCents: null },
    });
  });

  it("reports every wrong field", () => {
    expect(
      parseItemForm({ description: "", status: "agreed", plannedText: "x", agreedText: "12,345" }),
    ).toMatchObject({
      ok: false,
      errors: {
        description: "Scrivi cos'è questa voce.",
        plannedText: MONEY_ERROR_MESSAGE,
        agreedText: MONEY_ERROR_MESSAGE,
      },
    });
  });
});

describe("parsePaymentForm (AC36)", () => {
  const base = {
    kind: "deposit",
    amountText: "500",
    dueDate: "2027-01-15",
    paid: false,
    paidOn: "2026-11-24",
  } as const;

  it("a payment still to pay never carries a payment date", () => {
    expect(parsePaymentForm(base)).toEqual({
      ok: true,
      input: {
        kind: "deposit",
        amountCents: 50_000,
        dueDate: "2027-01-15",
        paid: false,
        paidOn: null,
      },
    });
  });

  it("a paid payment keeps its date, which is optional", () => {
    expect(parsePaymentForm({ ...base, paid: true })).toMatchObject({
      ok: true,
      input: { paid: true, paidOn: "2026-11-24" },
    });
    expect(parsePaymentForm({ ...base, paid: true, paidOn: "", dueDate: "" })).toMatchObject({
      ok: true,
      input: { paid: true, paidOn: null, dueDate: null },
    });
  });

  it("the amount is required and must be a valid euro amount", () => {
    expect(parsePaymentForm({ ...base, amountText: "" })).toMatchObject({
      ok: false,
      errors: { amountText: MONEY_ERROR_MESSAGE },
    });
    expect(parsePaymentForm({ ...base, amountText: "1,5,5" })).toMatchObject({ ok: false });
  });
});

describe("mapDbError (allowlist)", () => {
  it("maps our business codes and the usual database refusals", () => {
    expect(mapDbError({ message: "category_not_empty" })).toMatchObject({
      code: "category_not_empty",
      message: expect.stringContaining("spostale"),
    });
    expect(mapDbError({ code: "42501", message: "permission denied" }).code).toBe("forbidden");
    expect(mapDbError({ code: "23514", message: "violates check" })).toEqual({
      code: "invalid_amount",
      message: MONEY_ERROR_MESSAGE,
    });
  });

  it("never lets a raw database message through", () => {
    const raw = 'new row violates row-level security policy for table "budget_items"';
    expect(mapDbError({ message: raw })).toEqual({ code: "unknown", message: GENERIC_ERROR });
    expect(mapDbError(null)).toEqual({ code: "unknown", message: GENERIC_ERROR });
  });
});

describe("dueText", () => {
  it("is calm and exact", () => {
    expect(dueText(0)).toBe("Scade oggi");
    expect(dueText(1)).toBe("Scade domani");
    expect(dueText(10)).toBe("Scade tra 10 giorni");
    expect(dueText(-1)).toBe("Scaduto ieri");
    expect(dueText(-4)).toBe("Scaduto da 4 giorni");
  });
});

describe("conflict values", () => {
  it("renders euros, statuses, kinds, dates and the empty Assegnato", () => {
    expect(formatConflictValue("plannedCents", 120_000)).toBe("€ 1.200");
    expect(formatConflictValue("assignedCents", null)).toBe("Non assegnato");
    expect(formatConflictValue("agreedCents", null)).toBe("—");
    expect(formatConflictValue("status", "agreed")).toBe("Concordato");
    expect(formatConflictValue("kind", "balance")).toBe("Saldo");
    expect(formatConflictValue("dueDate", "2027-01-15")).toBe("15 gen 2027");
    expect(formatConflictValue("paid", true)).toBe("Sì");
  });
});
