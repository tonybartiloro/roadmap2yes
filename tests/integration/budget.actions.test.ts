import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadBudget, seedDefaultCategories } from "@/features/budget/data";
import type { BudgetSnapshot } from "@/features/budget/types";
import { anonClient, createWedding, type TestClient, type TestWedding } from "../support/supabase";

/**
 * T13: the server actions are the trust boundary. They run for real (zod, session, data layer,
 * RLS) against the local stack; only the cookie client and `revalidatePath` are replaced.
 */
const state = vi.hoisted(() => ({ client: null as unknown, revalidate: [] as unknown[][] }));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.client }));
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => {
    state.revalidate.push(args);
  },
}));

import {
  addCategoryAction,
  addItemAction,
  addPaymentAction,
  moveAndDeleteCategoryAction,
  removeCategoryAction,
  setTotalAction,
  updateCategoryAction,
  updateItemAction,
} from "@/features/budget/actions";
import { schemas } from "@/features/budget/schemas";

const UUID = "00000000-0000-4000-8000-000000000000";
const BUDGET_ONLY = [["/budget"], ["/budget/[id]", "page"]];
const WIDE = [...BUDGET_ONLY, ["/"]];

describe("budget server actions", () => {
  let wedding: TestWedding;
  let snapshot: BudgetSnapshot;
  let categoryId: string;

  const reload = async () => {
    snapshot = await loadBudget(wedding.founderClient, { userId: wedding.founder.id });
  };

  beforeAll(async () => {
    wedding = await createWedding();
    await seedDefaultCategories(wedding.founderClient);
    await reload();
    categoryId = snapshot.categories.find((c) => c.defaultKey === "catering")!.id;
  });

  beforeEach(() => {
    state.client = wedding.founderClient as TestClient;
    state.revalidate = [];
  });

  it("rejects malformed input before touching the database", async () => {
    const item = { description: "Menu", status: "planned", plannedCents: 1, agreedCents: null };
    const bad = [
      await setTotalAction({ totalCents: -5, reason: null }),
      await setTotalAction({ totalCents: 1.5, reason: null }),
      await setTotalAction({ totalCents: 100_000_000_001, reason: null }),
      await setTotalAction({ totalCents: 100, reason: "x".repeat(301) }),
      await addCategoryAction({ name: "   " }),
      await addCategoryAction({ name: "x".repeat(61) }),
      await updateCategoryAction({ categoryId: "not-a-uuid", version: 1 }),
      await updateCategoryAction({ categoryId, version: 0 }),
      await addItemAction({ categoryId, item: { ...item, status: "done" } }),
      await addItemAction({ categoryId, item: { ...item, description: "" } }),
      await updateItemAction({ itemId: UUID, version: 1, item: { ...item, plannedCents: -1 } }),
      await addPaymentAction({
        itemId: UUID,
        payment: {
          kind: "deposit",
          amountCents: 100,
          dueDate: "2027-13-45",
          paid: false,
          paidOn: null,
        },
      }),
      await addPaymentAction({
        itemId: UUID,
        payment: { kind: "gift", amountCents: 100, dueDate: null, paid: false, paidOn: null },
      }),
      // A payment date without a payment is not a state the table allows.
      await addPaymentAction({
        itemId: UUID,
        payment: {
          kind: "deposit",
          amountCents: 100,
          dueDate: null,
          paid: false,
          paidOn: "2027-01-01",
        },
      }),
      await moveAndDeleteCategoryAction({ fromId: UUID }),
    ];
    for (const result of bad) expect(result).toMatchObject({ ok: false, code: "invalid" });
    expect(state.revalidate).toEqual([]);
    expect(schemas.setTotal.safeParse({ totalCents: 0, reason: null }).success).toBe(true);
  });

  it("without a session nothing is written and nothing is revalidated", async () => {
    state.client = anonClient();
    const result = await setTotalAction({ totalCents: 100_000, reason: null });
    expect(result).toMatchObject({ ok: false, code: "session" });
    expect(state.revalidate).toEqual([]);
    await reload();
    expect(snapshot.versions).toEqual([]);
  });

  it("a total revalidates the budget pages and Home", async () => {
    expect(await setTotalAction({ totalCents: 2_000_000, reason: "Partenza" })).toMatchObject({
      ok: true,
    });
    expect(state.revalidate).toEqual(WIDE);
  });

  it("a category name or Assegnato revalidates only Budget", async () => {
    const result = await updateCategoryAction({
      categoryId,
      version: snapshot.categories.find((c) => c.id === categoryId)!.version,
      assignedCents: 500_000,
    });
    expect(result).toMatchObject({ ok: true });
    expect(state.revalidate).toEqual(BUDGET_ONLY);
  });

  it("items and payments revalidate Home too; a failed write revalidates nothing", async () => {
    const added = await addItemAction({
      categoryId,
      item: { description: "Menu", status: "agreed", plannedCents: 100_000, agreedCents: 120_000 },
    });
    if (!added.ok) throw new Error(added.message);
    expect(state.revalidate).toEqual(WIDE);

    state.revalidate = [];
    const payment = await addPaymentAction({
      itemId: added.data.itemId,
      payment: {
        kind: "deposit",
        amountCents: 30_000,
        dueDate: "2027-02-01",
        paid: false,
        paidOn: null,
      },
    });
    expect(payment).toMatchObject({ ok: true });
    expect(state.revalidate).toEqual(WIDE);

    state.revalidate = [];
    const missing = await addPaymentAction({
      itemId: UUID,
      payment: { kind: "deposit", amountCents: 1, dueDate: null, paid: false, paidOn: null },
    });
    expect(missing).toMatchObject({ ok: false });
    expect(state.revalidate).toEqual([]);
  });

  it("a stale version is a conflict and revalidates nothing", async () => {
    await reload();
    const category = snapshot.categories.find((c) => c.id === categoryId)!;
    const stale = await updateCategoryAction({
      categoryId,
      version: category.version + 5,
      name: "Altro",
    });
    expect(stale).toMatchObject({ ok: false, code: "conflict" });
    expect(state.revalidate).toEqual([]);
  });

  it("deleting a category with items says so; 'Sposta in…' then deletes it", async () => {
    await reload();
    const from = snapshot.categories.find((c) => c.id === categoryId)!;
    const to = snapshot.categories.find((c) => c.defaultKey === "location")!;
    const refused = await removeCategoryAction({ categoryId, version: from.version });
    expect(refused).toMatchObject({ ok: false, code: "category_not_empty" });
    expect(state.revalidate).toEqual([]);

    const moved = await moveAndDeleteCategoryAction({ fromId: from.id, toId: to.id });
    expect(moved).toMatchObject({ ok: true, data: { moved: 1 } });
    expect(state.revalidate).toEqual(BUDGET_ONLY);
    await reload();
    expect(snapshot.categories.some((c) => c.id === from.id)).toBe(false);
    expect(snapshot.items.some((i) => i.categoryId === to.id)).toBe(true);
  });

  it("no raw database text reaches the user", async () => {
    await reload();
    const to = snapshot.categories.find((c) => c.defaultKey === "location")!;
    const result = await addItemAction({
      categoryId: to.id,
      item: { description: "Menu", status: "planned", plannedCents: 1, agreedCents: null },
    });
    expect(result.ok).toBe(true);
    const failed = await addItemAction({
      categoryId: UUID,
      item: { description: "Menu", status: "planned", plannedCents: 1, agreedCents: null },
    });
    expect(failed).toMatchObject({ ok: false });
    if (!failed.ok) expect(failed.message).not.toMatch(/violates|constraint|policy|postgres|sql/i);
  });
});
