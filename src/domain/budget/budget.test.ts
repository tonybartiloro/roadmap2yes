import { describe, expect, it } from "vitest";
import {
  barModel,
  budgetTotals,
  budgetWarnings,
  currentTotal,
  totalReducedWarning,
  upcomingPayments,
  type BudgetCategory,
  type BudgetInput,
  type BudgetItem,
  type Payment,
} from ".";
import { BUDGET_CATEGORY_KEYS, DEFAULT_BUDGET_CATEGORIES } from "@/content/budget-categories";
import { CATEGORY_LABELS } from "@/content/milestones/categories";

const cat = (
  id: string,
  name: string,
  assignedCents: number | null,
  extra = {},
): BudgetCategory => ({
  id,
  name,
  assignedCents,
  ...extra,
});
const item = (id: string, categoryId: string, extra: Partial<BudgetItem> = {}): BudgetItem => ({
  id,
  categoryId,
  description: `Voce ${id}`,
  status: "planned",
  plannedCents: 0,
  agreedCents: null,
  ...extra,
});
const pay = (id: string, itemId: string, extra: Partial<Payment> = {}): Payment => ({
  id,
  itemId,
  kind: "other",
  amountCents: 0,
  dueDate: null,
  paid: false,
  ...extra,
});

const base: BudgetInput = {
  versions: [
    { id: "v1", totalCents: 2_000_000, createdAt: "2026-11-01T10:00:00Z" },
    { id: "v2", totalCents: 3_000_000, createdAt: "2026-11-10T10:00:00Z" },
  ],
  categories: [
    cat("c1", "Catering", 1_000_000, { sortOrder: 1 }),
    cat("c2", "Fiori", 500_000, { sortOrder: 0 }),
  ],
  items: [
    item("i1", "c1", { status: "agreed", plannedCents: 900_000, agreedCents: 1_120_000 }),
    item("i2", "c1", { status: "planned", plannedCents: 100_000 }),
    item("i3", "c1", { status: "cancelled", plannedCents: 777_000 }),
    item("i4", "c2", { status: "agreed", plannedCents: 300_000, agreedCents: 350_000 }),
    item("i5", "c2", { status: "planned", plannedCents: 50_000, deleted: true }),
  ],
  payments: [
    pay("p1", "i1", { amountCents: 300_000, paid: true, dueDate: "2026-12-01" }),
    pay("p2", "i1", { amountCents: 820_000, dueDate: "2027-05-01" }),
    pay("p3", "i4", { amountCents: 100_000, paid: true }),
    pay("p4", "i4", { amountCents: 250_000, dueDate: "2026-12-10" }),
    pay("p5", "i4", { amountCents: 1, paid: true, deleted: true }),
  ],
};

describe("totals (AC33, AC35, AC36, AC37)", () => {
  it("takes the latest version as the total", () => {
    expect(currentTotal(base.versions)).toBe(3_000_000);
    expect(currentTotal([])).toBeNull();
  });

  it("aggregates per category and overall, in sort order", () => {
    const t = budgetTotals(base);
    expect(t.categories.map((c) => c.categoryId)).toEqual(["c2", "c1"]);
    const c1 = t.categories.find((c) => c.categoryId === "c1")!;
    expect(c1).toMatchObject({
      assigned: 1_000_000,
      planned: 1_000_000, // cancelled and deleted excluded
      agreed: 1_120_000,
      paid: 300_000,
      remaining: 820_000,
    });
    expect(t).toMatchObject({
      total: 3_000_000,
      assigned: 1_500_000,
      unassigned: 1_500_000,
      overAssigned: 0,
      planned: 1_300_000,
      agreed: 1_470_000,
      paid: 400_000,
      remaining: 1_070_000,
    });
  });

  it("ignores deleted categories and never shows a negative unassigned", () => {
    const t = budgetTotals({
      ...base,
      versions: [{ id: "v", totalCents: 1_000_000, createdAt: "2026-11-01T10:00:00Z" }],
      categories: [...base.categories, cat("c3", "Vecchia", 99, { deleted: true })],
    });
    expect(t.categories).toHaveLength(2);
    expect(t.unassigned).toBe(0);
    expect(t.overAssigned).toBe(500_000);
  });

  it("has no unassigned figure without a total", () => {
    expect(budgetTotals({ ...base, versions: [] })).toMatchObject({
      total: null,
      unassigned: null,
    });
  });

  it("counts an agreed item without agreed amount as 0 and never goes below zero remaining", () => {
    const t = budgetTotals({
      ...base,
      items: [item("x", "c1", { status: "agreed", plannedCents: 5 })],
      payments: [pay("px", "x", { amountCents: 10, paid: true })],
    });
    expect(t.categories.find((c) => c.categoryId === "c1")).toMatchObject({
      agreed: 0,
      remaining: 0,
    });
  });
});

describe("warnings (AC37, PO-7)", () => {
  it("warns warmly when a category is over its assigned amount", () => {
    const w = budgetWarnings(base);
    expect(w).toContainEqual({
      kind: "category-over",
      categoryId: "c1",
      overCents: 120_000,
      message: "Sei oltre di € 1.200 su Catering.",
    });
    expect(w.filter((x) => x.kind === "category-over")).toHaveLength(1);
  });

  it("warns when Concordato exceeds the total", () => {
    const w = budgetWarnings({
      ...base,
      versions: [{ id: "v", totalCents: 1_000_000, createdAt: "2026-11-01T10:00:00Z" }],
    });
    expect(w).toContainEqual({
      kind: "total-over",
      overCents: 470_000,
      message: "Hai concordato € 4.700 oltre il totale.",
    });
  });

  it("warns when Assegnato exceeds the total, never as a negative number", () => {
    const w = budgetWarnings({
      ...base,
      items: [],
      payments: [],
      versions: [{ id: "v", totalCents: 1_000_000, createdAt: "2026-11-01T10:00:00Z" }],
    });
    expect(w).toEqual([
      {
        kind: "assigned-over-total",
        overCents: 500_000,
        message: "Hai assegnato € 5.000 oltre il totale.",
      },
    ]);
    expect(w[0]!.message).not.toContain("-");
  });

  it("does not warn for categories with nothing assigned, or without a total", () => {
    const w = budgetWarnings({
      ...base,
      versions: [],
      categories: [cat("c1", "Catering", null), cat("c2", "Fiori", 500_000)],
    });
    expect(w).toEqual([]);
  });

  it("flags payments above the agreed amount of an item", () => {
    const w = budgetWarnings({
      ...base,
      payments: [pay("p", "i4", { amountCents: 400_000, paid: true })],
    });
    expect(w).toContainEqual({
      kind: "item-overpaid",
      itemId: "i4",
      overCents: 50_000,
      message: "Hai pagato € 500 più di quanto concordato per «Voce i4».",
    });
  });

  it("gives an informative notice when the total is lowered below Concordato", () => {
    expect(totalReducedWarning(1_000_000, 1_470_000)).toMatchObject({
      kind: "total-over",
      overCents: 470_000,
    });
    expect(totalReducedWarning(1_470_000, 1_470_000)).toBeNull();
  });

  it("is quiet for a healthy budget", () => {
    expect(
      budgetWarnings({
        ...base,
        categories: [cat("c1", "Catering", 2_000_000), cat("c2", "Fiori", 500_000)],
      }),
    ).toEqual([]);
  });
});

describe("bars (AC37)", () => {
  it("gives rounded percentages and the text equivalent", () => {
    expect(barModel(620, 0, 1000)).toMatchObject({
      agreedPercent: 62,
      agreedWidth: 62,
      overflow: false,
      text: "62% concordato",
    });
    expect(barModel(620, 300, 1000).text).toBe("62% concordato, 30% pagato");
  });

  it("clamps the fill but keeps the real percentage when over", () => {
    expect(barModel(1200, 0, 1000)).toMatchObject({
      agreedPercent: 120,
      agreedWidth: 100,
      overflow: true,
      text: "120% concordato",
    });
  });

  it("handles no assigned amount", () => {
    expect(barModel(0, 0, null).text).toBe("Niente di concordato");
    expect(barModel(500, 0, 0)).toMatchObject({
      agreedPercent: null,
      overflow: true,
      text: "Nessun importo assegnato",
    });
  });
});

describe("upcoming payments (AC36)", () => {
  it("lists unpaid, dated payments of agreed items in due order, overdue first", () => {
    const rows = upcomingPayments(base, "2026-12-05");
    expect(rows.map((r) => r.paymentId)).toEqual(["p4", "p2"]);
    expect(rows[0]).toMatchObject({
      categoryName: "Fiori",
      daysUntil: 5,
      overdue: false,
      itemDescription: "Voce i4",
    });
    const late = upcomingPayments(base, "2026-12-20");
    expect(late[0]).toMatchObject({ paymentId: "p4", overdue: true, daysUntil: -10 });
  });

  it("supports a window and a limit, and skips undated, paid, deleted and cancelled-item payments", () => {
    expect(
      upcomingPayments(base, "2026-12-05", { withinDays: 14 }).map((r) => r.paymentId),
    ).toEqual(["p4"]);
    expect(upcomingPayments(base, "2026-12-05", { limit: 1 })).toHaveLength(1);
    const rows = upcomingPayments(
      {
        ...base,
        payments: [
          pay("a", "i4", { dueDate: null }),
          pay("b", "i4", { dueDate: "2026-12-06", paid: true }),
          pay("c", "i4", { dueDate: "2026-12-06", deleted: true }),
          pay("d", "i3", { dueDate: "2026-12-06" }),
        ],
      },
      "2026-12-05",
    );
    expect(rows).toEqual([]);
  });

  it("breaks ties by id for a stable order", () => {
    const rows = upcomingPayments(
      {
        ...base,
        payments: [
          pay("z", "i4", { dueDate: "2026-12-06" }),
          pay("b", "i4", { dueDate: "2026-12-06" }),
        ],
      },
      "2026-12-05",
    );
    expect(rows.map((r) => r.paymentId)).toEqual(["b", "z"]);
  });
});

describe("default categories (AC34)", () => {
  it("are the 11 budget categories, labelled from the single source of truth", () => {
    expect(BUDGET_CATEGORY_KEYS).toHaveLength(11);
    expect(BUDGET_CATEGORY_KEYS).not.toContain("organizzazione");
    expect(DEFAULT_BUDGET_CATEGORIES.map((c) => c.name)).toEqual(
      BUDGET_CATEGORY_KEYS.map((k) => CATEGORY_LABELS[k]),
    );
    expect(DEFAULT_BUDGET_CATEGORIES.map((c) => c.sortOrder)).toEqual([...Array(11).keys()]);
  });
});
