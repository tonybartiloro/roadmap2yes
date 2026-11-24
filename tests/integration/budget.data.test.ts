import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_BUDGET_CATEGORIES } from "@/content/budget-categories";
import { budgetTotals, budgetWarnings, upcomingPayments } from "@/domain/budget";
import {
  addCategory,
  addItem,
  addPayment,
  ensureDefaultCategories,
  loadBudget,
  moveAndDeleteCategory,
  removeCategory,
  removeItem,
  removePayment,
  restoreCategory,
  restoreItem,
  setTotal,
  updateCategory,
  updateItem,
  updatePayment,
} from "@/features/budget/data";
import { budgetInput } from "@/features/budget/model";
import type { ItemInput, PaymentInput } from "@/features/budget/types";
import {
  addPartnerB,
  createWedding,
  type TestPartnerB,
  type TestWedding,
} from "../support/supabase";

/**
 * T13: the Budget data layer against the local stack, with the users' own clients (RLS is the only
 * authorization). Nothing here imports Next.js.
 */
describe("budget data", () => {
  let wedding: TestWedding;
  let partnerB: TestPartnerB;
  const db = () => wedding.founderClient;
  const me = () => ({ userId: wedding.founder.id });

  const item = (overrides: Partial<ItemInput> = {}): ItemInput => ({
    description: "Menu",
    status: "planned",
    plannedCents: 100_000,
    agreedCents: null,
    ...overrides,
  });
  const payment = (overrides: Partial<PaymentInput> = {}): PaymentInput => ({
    kind: "deposit",
    amountCents: 20_000,
    dueDate: "2027-01-15",
    paid: false,
    paidOn: null,
    ...overrides,
  });

  async function category(key: string) {
    const snapshot = await loadBudget(db(), me());
    const found = snapshot.categories.find((c) => c.defaultKey === key);
    if (!found) throw new Error(`missing category ${key}`);
    return found;
  }

  beforeAll(async () => {
    wedding = await createWedding();
    partnerB = await addPartnerB(wedding);
  });

  it("seeds the 11 defaults once, even when two people open the page together", async () => {
    const [a, b] = await Promise.all([
      loadBudget(db(), me()),
      loadBudget(partnerB.client, { userId: partnerB.user.id }),
    ]);
    expect(a.categories.length).toBeGreaterThanOrEqual(DEFAULT_BUDGET_CATEGORIES.length);
    expect(b.categories.length).toBeGreaterThanOrEqual(DEFAULT_BUDGET_CATEGORIES.length);
    await ensureDefaultCategories(db(), a.weddingId);
    const rows = await db()
      .from("budget_categories")
      .select("default_key")
      .eq("wedding_id", a.weddingId);
    const keys = (rows.data ?? []).map((r) => r.default_key);
    expect(keys).toHaveLength(DEFAULT_BUDGET_CATEGORIES.length);
    expect(new Set(keys).size).toBe(keys.length);
    expect(a.categories.map((c) => c.name)).toContain("Catering");
  });

  it("a total is a new version: nothing is overwritten, newest first, author and reason kept", async () => {
    expect((await loadBudget(db(), me())).versions).toEqual([]);
    expect(await setTotal(db(), { totalCents: 2_500_000, reason: null })).toMatchObject({
      ok: true,
    });
    expect(
      await setTotal(partnerB.client, { totalCents: 3_000_000, reason: "Regalo dei nonni" }),
    ).toMatchObject({ ok: true });
    const { versions } = await loadBudget(db(), me());
    expect(versions.map((v) => v.totalCents)).toEqual([3_000_000, 2_500_000]);
    expect(versions[0]).toMatchObject({ reason: "Regalo dei nonni" });
    expect(versions[0]!.authorName).not.toBe("Il sistema");
    expect(versions[0]!.authorName).not.toBe(versions[1]!.authorName);
  });

  it("refuses a negative or too large total with a clean message", async () => {
    const negative = await setTotal(db(), { totalCents: -1, reason: null });
    expect(negative).toMatchObject({ ok: false, code: "invalid_amount" });
    const huge = await setTotal(db(), { totalCents: 100_000_000_001, reason: null });
    expect(huge).toMatchObject({ ok: false, code: "invalid_amount" });
    if (!negative.ok) expect(negative.message).toContain("1.500,00");
  });

  it("lowering the total below the Concordato is allowed and warns", async () => {
    const cat = await category("catering");
    const added = await addItem(db(), {
      categoryId: cat.id,
      item: item({ status: "agreed", plannedCents: 100_000, agreedCents: 400_000 }),
    });
    expect(added.ok).toBe(true);
    expect(await setTotal(db(), { totalCents: 300_000, reason: "Ridotto" })).toMatchObject({
      ok: true,
    });
    const snapshot = await loadBudget(db(), me());
    const warnings = budgetWarnings(budgetInput(snapshot));
    expect(warnings.map((w) => w.kind)).toContain("total-over");
    // Back to a comfortable total for the next tests.
    await setTotal(db(), { totalCents: 3_000_000, reason: null });
  });

  it("adds a custom category after the defaults, renames it and sets Assegnato", async () => {
    const added = await addCategory(db(), { name: "Bomboniere", assignedCents: 50_000 });
    if (!added.ok) throw new Error(added.message);
    let snapshot = await loadBudget(db(), me());
    const custom = snapshot.categories.find((c) => c.id === added.data.categoryId)!;
    expect(custom).toMatchObject({ name: "Bomboniere", assignedCents: 50_000, defaultKey: null });
    expect(snapshot.categories.at(-1)!.id).toBe(custom.id);

    const renamed = await updateCategory(db(), wedding.founder.id, {
      categoryId: custom.id,
      version: custom.version,
      name: "Bomboniere e regali",
      assignedCents: null,
    });
    expect(renamed).toMatchObject({ ok: true });
    snapshot = await loadBudget(db(), me());
    expect(snapshot.categories.find((c) => c.id === custom.id)).toMatchObject({
      name: "Bomboniere e regali",
      assignedCents: null,
    });
  });

  it("a stale category version is a conflict with the other partner's name, never an overwrite", async () => {
    const cat = await category("fiori-allestimento");
    const first = await updateCategory(partnerB.client, partnerB.user.id, {
      categoryId: cat.id,
      version: cat.version,
      assignedCents: 200_000,
    });
    expect(first).toMatchObject({ ok: true });
    const stale = await updateCategory(db(), wedding.founder.id, {
      categoryId: cat.id,
      version: cat.version,
      assignedCents: 999_900,
    });
    expect(stale).toMatchObject({ ok: false, code: "conflict" });
    if (stale.ok || !("conflict" in stale)) throw new Error("expected a conflict");
    expect(stale.conflict.current).toMatchObject({ assignedCents: 200_000 });
    expect(stale.conflict.changedByName).toBeTruthy();
    expect((await category("fiori-allestimento")).assignedCents).toBe(200_000);
  });

  it("totals: planned, agreed, paid, remaining; payments exclude deleted items; upcoming in due order", async () => {
    const cat = await category("musica");
    const dj = await addItem(db(), {
      categoryId: cat.id,
      item: item({
        description: "DJ",
        status: "agreed",
        plannedCents: 80_000,
        agreedCents: 90_000,
      }),
    });
    const cancelled = await addItem(db(), {
      categoryId: cat.id,
      item: item({ description: "Band", status: "cancelled", plannedCents: 500_000 }),
    });
    if (!dj.ok || !cancelled.ok) throw new Error("items");
    const late = await addPayment(db(), {
      itemId: dj.data.itemId,
      payment: payment({ kind: "balance", amountCents: 50_000, dueDate: "2027-08-01" }),
    });
    const early = await addPayment(db(), {
      itemId: dj.data.itemId,
      payment: payment({ amountCents: 30_000, dueDate: "2027-02-01" }),
    });
    const paid = await addPayment(db(), {
      itemId: dj.data.itemId,
      payment: payment({
        kind: "other",
        amountCents: 10_000,
        paid: true,
        paidOn: "2026-11-20",
        dueDate: null,
      }),
    });
    if (!late.ok || !early.ok || !paid.ok) throw new Error("payments");

    const snapshot = await loadBudget(db(), me());
    const input = budgetInput(snapshot);
    const totals = budgetTotals(input).categories.find((c) => c.categoryId === cat.id)!;
    expect(totals).toMatchObject({
      planned: 80_000,
      agreed: 90_000,
      paid: 10_000,
      remaining: 80_000,
    });
    expect(
      upcomingPayments(input, "2026-11-24")
        .filter((p) => p.categoryId === cat.id)
        .map((p) => p.paymentId),
    ).toEqual([early.data.paymentId, late.data.paymentId]);

    // Deleting the item hides it and its payments from every aggregate; Annulla brings them back.
    const removed = await removeItem(db(), wedding.founder.id, {
      itemId: dj.data.itemId,
      version: snapshot.items.find((i) => i.id === dj.data.itemId)!.version,
    });
    if (!removed.ok) throw new Error(removed.message);
    let after = await loadBudget(db(), me());
    expect(after.items.some((i) => i.id === dj.data.itemId)).toBe(false);
    expect(after.payments.some((p) => p.itemId === dj.data.itemId)).toBe(false);
    expect(
      upcomingPayments(budgetInput(after), "2026-11-24").some((p) => p.itemId === dj.data.itemId),
    ).toBe(false);

    const restored = await restoreItem(db(), wedding.founder.id, {
      itemId: dj.data.itemId,
      version: removed.data.version,
    });
    expect(restored).toMatchObject({ ok: true });
    after = await loadBudget(db(), me());
    expect(after.payments.filter((p) => p.itemId === dj.data.itemId)).toHaveLength(3);
  });

  it("edits an item and a payment with versions; a stale payment is a conflict", async () => {
    const cat = await category("fedi");
    const added = await addItem(db(), { categoryId: cat.id, item: item({ description: "Fedi" }) });
    if (!added.ok) throw new Error(added.message);
    let snapshot = await loadBudget(db(), me());
    const row = snapshot.items.find((i) => i.id === added.data.itemId)!;
    const agreed = await updateItem(db(), wedding.founder.id, {
      itemId: row.id,
      version: row.version,
      item: item({
        description: "Fedi",
        status: "agreed",
        plannedCents: 100_000,
        agreedCents: 120_000,
      }),
    });
    expect(agreed).toMatchObject({ ok: true });

    const pay = await addPayment(db(), { itemId: row.id, payment: payment() });
    if (!pay.ok) throw new Error(pay.message);
    snapshot = await loadBudget(db(), me());
    const p = snapshot.payments.find((x) => x.id === pay.data.paymentId)!;
    expect(
      await updatePayment(partnerB.client, partnerB.user.id, {
        paymentId: p.id,
        version: p.version,
        payment: payment({ paid: true, paidOn: "2026-11-24" }),
      }),
    ).toMatchObject({ ok: true });
    const stale = await updatePayment(db(), wedding.founder.id, {
      paymentId: p.id,
      version: p.version,
      payment: payment({ amountCents: 1 }),
    });
    expect(stale).toMatchObject({ ok: false, code: "conflict" });
    if (stale.ok || !("conflict" in stale)) throw new Error("expected a conflict");
    expect(stale.conflict.current).toMatchObject({ paid: true, paidOn: "2026-11-24" });

    // Soft delete and Annulla of a payment.
    const current = (await loadBudget(db(), me())).payments.find((x) => x.id === p.id)!;
    const removed = await removePayment(db(), wedding.founder.id, {
      paymentId: p.id,
      version: current.version,
    });
    expect(removed).toMatchObject({ ok: true });
    expect((await loadBudget(db(), me())).payments.some((x) => x.id === p.id)).toBe(false);
  });

  it("an empty category is deleted and restored; one with items is refused with a clear message", async () => {
    const added = await addCategory(db(), { name: "Da tenere" });
    if (!added.ok) throw new Error(added.message);
    const target = await category("viaggio-nozze");
    const withItem = await addItem(db(), {
      categoryId: target.id,
      item: item({ description: "Hotel" }),
    });
    expect(withItem.ok).toBe(true);

    const refused = await removeCategory(db(), wedding.founder.id, {
      categoryId: target.id,
      version: (await loadBudget(db(), me())).categories.find((c) => c.id === target.id)!.version,
    });
    expect(refused).toMatchObject({ ok: false, code: "category_not_empty" });
    if (!refused.ok) expect(refused.message).toMatch(/spostale/i);

    const fresh = (await loadBudget(db(), me())).categories.find(
      (c) => c.id === added.data.categoryId,
    )!;
    const removed = await removeCategory(db(), wedding.founder.id, {
      categoryId: fresh.id,
      version: fresh.version,
    });
    if (!removed.ok) throw new Error(removed.message);
    expect(
      (await loadBudget(db(), me())).categories.some((c) => c.id === added.data.categoryId),
    ).toBe(false);
    const restored = await restoreCategory(db(), wedding.founder.id, {
      categoryId: fresh.id,
      version: removed.data.version,
    });
    expect(restored).toMatchObject({ ok: true });
    expect(
      (await loadBudget(db(), me())).categories.some((c) => c.id === added.data.categoryId),
    ).toBe(true);
  });

  it("'Sposta in…' moves the items, resets Assegnato of the source and deletes it; Annulla restores it empty", async () => {
    const from = await addCategory(db(), { name: "Da svuotare", assignedCents: 700_000 });
    const to = await addCategory(db(), { name: "Destinazione", assignedCents: 100_000 });
    if (!from.ok || !to.ok) throw new Error("categories");
    for (const description of ["Uno", "Due"]) {
      const added = await addItem(db(), {
        categoryId: from.data.categoryId,
        item: item({ description }),
      });
      if (!added.ok) throw new Error(added.message);
    }

    const moved = await moveAndDeleteCategory(db(), wedding.founder.id, {
      fromId: from.data.categoryId,
      toId: to.data.categoryId,
    });
    if (!moved.ok) throw new Error(moved.message);
    expect(moved.data.moved).toBe(2);

    const snapshot = await loadBudget(db(), me());
    expect(snapshot.categories.some((c) => c.id === from.data.categoryId)).toBe(false);
    expect(snapshot.items.filter((i) => i.categoryId === to.data.categoryId)).toHaveLength(2);
    // The destination keeps its own Assegnato.
    expect(snapshot.categories.find((c) => c.id === to.data.categoryId)!.assignedCents).toBe(
      100_000,
    );

    const restored = await restoreCategory(db(), wedding.founder.id, {
      categoryId: from.data.categoryId,
      version: moved.data.version,
    });
    expect(restored).toMatchObject({ ok: true });
    const again = await loadBudget(db(), me());
    const back = again.categories.find((c) => c.id === from.data.categoryId)!;
    expect(back.assignedCents).toBeNull();
    expect(again.items.filter((i) => i.categoryId === from.data.categoryId)).toHaveLength(0);
  });

  it("moving into the same or a missing category fails with an allowlisted message", async () => {
    const cat = await category("catering");
    const same = await moveAndDeleteCategory(db(), wedding.founder.id, {
      fromId: cat.id,
      toId: cat.id,
    });
    expect(same).toMatchObject({ ok: false, code: "same_category" });
    const missing = await moveAndDeleteCategory(db(), wedding.founder.id, {
      fromId: cat.id,
      toId: "00000000-0000-4000-8000-000000000000",
    });
    expect(missing).toMatchObject({ ok: false, code: "category_not_found" });
  });

  it("another wedding sees and writes nothing of this one", async () => {
    const other = await createWedding();
    const theirs = await loadBudget(other.founderClient, { userId: other.founder.id });
    expect(theirs.weddingId).not.toBe((await loadBudget(db(), me())).weddingId);
    expect(theirs.versions).toEqual([]);
    expect(theirs.items).toEqual([]);
    const cat = await category("catering");
    const attempt = await addItem(other.founderClient, {
      categoryId: cat.id,
      item: item({ description: "Intruso" }),
    });
    expect(attempt).toMatchObject({ ok: false });
    const rename = await updateCategory(other.founderClient, other.founder.id, {
      categoryId: cat.id,
      version: cat.version,
      name: "Hackerata",
    });
    expect(rename).toMatchObject({ ok: false });
    expect((await category("catering")).name).toBe("Catering");
  });
});
