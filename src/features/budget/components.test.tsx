// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  push: vi.fn(),
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
  actions: {
    addCategoryAction: vi.fn(),
    addItemAction: vi.fn(),
    addPaymentAction: vi.fn(),
    moveAndDeleteCategoryAction: vi.fn(),
    removeCategoryAction: vi.fn(),
    removeItemAction: vi.fn(),
    removePaymentAction: vi.fn(),
    restoreCategoryAction: vi.fn(),
    restoreItemAction: vi.fn(),
    restorePaymentAction: vi.fn(),
    setTotalAction: vi.fn(),
    updateCategoryAction: vi.fn(),
    updateItemAction: vi.fn(),
    updatePaymentAction: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }),
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("./actions", () => mocks.actions);
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
// Radix radio items measure themselves; jsdom has no ResizeObserver.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

import { BudgetOverview } from "./BudgetOverview";
import { CategoryDetail } from "./CategoryDetail";
import { ItemSheet } from "./ItemSheet";
import { UNDO_MS } from "./model";
import { PaymentSheet } from "./PaymentSheet";
import { TotalSheet } from "./TotalSheet";
import type { BudgetSnapshot, ItemView, PaymentView } from "./types";

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => cleanup());

const TODAY = "2026-11-24";

function snapshot(overrides: Partial<BudgetSnapshot> = {}): BudgetSnapshot {
  return {
    weddingId: "w",
    partnerName: "Jessica",
    versions: [],
    categories: [
      {
        id: "cat",
        name: "Catering",
        assignedCents: 400_000,
        sortOrder: 0,
        version: 3,
        defaultKey: "catering",
      },
      {
        id: "loc",
        name: "Location",
        assignedCents: null,
        sortOrder: 1,
        version: 1,
        defaultKey: "location",
      },
    ],
    items: [],
    payments: [],
    ...overrides,
  };
}

const menu: ItemView = {
  id: "item-menu",
  categoryId: "cat",
  description: "Menu per 80 persone",
  status: "agreed",
  plannedCents: 500_000,
  agreedCents: 520_000,
  version: 2,
};

function pay(overrides: Partial<PaymentView> = {}): PaymentView {
  return {
    id: "pay-1",
    itemId: "item-menu",
    kind: "deposit",
    amountCents: 100_000,
    dueDate: "2026-12-01",
    paid: false,
    paidOn: null,
    version: 1,
    ...overrides,
  };
}

const withTotal = (totalCents: number) => ({
  versions: [
    {
      id: "v1",
      totalCents,
      createdAt: "2026-11-20T10:00:00.000Z",
      reason: null,
      authorName: "Tony",
    },
  ],
});

describe("BudgetOverview (AC33, AC37)", () => {
  it("without a total: 'Budget da definire' and one action to set it", () => {
    render(<BudgetOverview snapshot={snapshot()} today={TODAY} />);
    expect(screen.getByText("Budget da definire")).toBeTruthy();
    expect(screen.getByText("Parti da una cifra indicativa: potrai cambiarla.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Imposta il budget" })).toBeTruthy();
    expect(screen.queryByTestId("budget-total")).toBeNull();
  });

  it("with data: total, Assegnato/Previsto/Concordato/Pagato/Ancora da pagare and Non assegnato", () => {
    render(
      <BudgetOverview
        snapshot={snapshot({
          ...withTotal(2_500_000),
          items: [menu],
          payments: [pay({ paid: true, paidOn: "2026-11-01", amountCents: 100_000 })],
        })}
        today={TODAY}
      />,
    );
    expect(screen.getByTestId("budget-total").textContent).toBe("€ 25.000");
    expect(screen.getByTestId("sum-assigned").textContent).toBe("€ 4.000");
    expect(screen.getByTestId("sum-planned").textContent).toBe("€ 5.000");
    expect(screen.getByTestId("sum-agreed").textContent).toBe("€ 5.200");
    expect(screen.getByTestId("sum-paid").textContent).toBe("€ 1.000");
    expect(screen.getByTestId("sum-remaining").textContent).toBe("€ 4.200");
    expect(within(screen.getByTestId("budget-unassigned")).getByText("€ 21.000")).toBeTruthy();
  });

  it("a category over its Assegnato gets a warm notice with icon and text, and the bar a text equivalent", () => {
    render(
      <BudgetOverview
        snapshot={snapshot({
          ...withTotal(2_500_000),
          items: [{ ...menu, agreedCents: 520_000 }],
        })}
        today={TODAY}
      />,
    );
    const warnings = screen.getByTestId("budget-warnings");
    expect(within(warnings).getByText("Sei oltre di € 1.200 su Catering.")).toBeTruthy();
    // Not full red: the notice carries colour on the border only, text stays foreground.
    expect(warnings.innerHTML).not.toMatch(/text-destructive|bg-destructive/);
    expect(warnings.querySelector("svg")).not.toBeNull();
    const card = screen.getByTestId("category-catering");
    expect(within(card).getByTestId("bar-text").textContent).toContain("130% concordato");
    expect(within(card).getByRole("progressbar").getAttribute("aria-valuetext")).toBe(
      "130% concordato",
    );
    expect(card.getAttribute("href")).toBe("/budget/cat");
  });

  it("a plain '62% concordato' for a category within budget", () => {
    render(
      <BudgetOverview
        snapshot={snapshot({
          ...withTotal(2_500_000),
          items: [{ ...menu, agreedCents: 248_000 }],
        })}
        today={TODAY}
      />,
    );
    expect(screen.getByText("62% concordato")).toBeTruthy();
    expect(screen.queryByTestId("budget-warnings")).toBeNull();
  });

  it("Assegnato above the total is a warm notice, never a negative number", () => {
    render(
      <BudgetOverview
        snapshot={snapshot({
          ...withTotal(300_000),
          categories: [
            {
              id: "cat",
              name: "Catering",
              assignedCents: 400_000,
              sortOrder: 0,
              version: 1,
              defaultKey: "catering",
            },
          ],
        })}
        today={TODAY}
      />,
    );
    expect(screen.getByText("Hai assegnato € 1.000 oltre il totale.")).toBeTruthy();
    expect(within(screen.getByTestId("budget-unassigned")).getByText("€ 0")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/-\s?€|€\s?-/);
  });

  it("'Prossimi pagamenti' are in due-date order, overdue first, with a calm label", () => {
    render(
      <BudgetOverview
        snapshot={snapshot({
          ...withTotal(2_500_000),
          items: [menu],
          payments: [
            pay({ id: "late", amountCents: 300_000, dueDate: "2027-03-01", kind: "balance" }),
            pay({ id: "soon", amountCents: 100_000, dueDate: "2026-12-01" }),
            pay({ id: "over", amountCents: 50_000, dueDate: "2026-11-20", kind: "other" }),
            pay({ id: "done", amountCents: 70_000, dueDate: "2026-11-01", paid: true }),
          ],
        })}
        today={TODAY}
      />,
    );
    const rows = within(screen.getByTestId("upcoming-payments")).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Scaduto da 4 giorni"),
      expect.stringContaining("Scade tra 7 giorni"),
      expect.stringContaining("Scade tra 97 giorni"),
    ]);
  });

  it("'Segna pagato' sends the payment as paid today", async () => {
    mocks.actions.updatePaymentAction.mockResolvedValue({ ok: true, data: { version: 2 } });
    render(
      <BudgetOverview
        snapshot={snapshot({ ...withTotal(2_500_000), items: [menu], payments: [pay()] })}
        today={TODAY}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Segna pagato" }));
    expect(mocks.actions.updatePaymentAction).toHaveBeenCalledWith({
      paymentId: "pay-1",
      version: 1,
      payment: {
        kind: "deposit",
        amountCents: 100_000,
        dueDate: "2026-12-01",
        paid: true,
        paidOn: TODAY,
      },
    });
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith("Pagamento segnato come pagato."));
  });

  it("the history sheet lists every version with author and reason", async () => {
    render(
      <BudgetOverview
        snapshot={snapshot({
          versions: [
            {
              id: "v2",
              totalCents: 3_000_000,
              createdAt: "2026-11-22T10:00:00.000Z",
              reason: "Regalo dei nonni",
              authorName: "Jessica",
            },
            {
              id: "v1",
              totalCents: 2_500_000,
              createdAt: "2026-11-20T10:00:00.000Z",
              reason: null,
              authorName: "Tony",
            },
          ],
        })}
        today={TODAY}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Storico/ }));
    const history = screen.getByTestId("budget-history");
    expect(within(history).getAllByRole("listitem")).toHaveLength(2);
    expect(within(history).getByText("Regalo dei nonni")).toBeTruthy();
    expect(history.textContent).toContain("Jessica");
  });
});

describe("TotalSheet (AC33, AC38)", () => {
  it("the amount field has a numeric keypad and the exact error text", async () => {
    render(<TotalSheet open onOpenChange={() => {}} currentTotal={null} agreed={0} />);
    const field = screen.getByLabelText("Budget totale");
    expect(field.getAttribute("inputmode")).toBe("decimal");
    await userEvent.type(field, "12,345");
    fireEvent.blur(field);
    expect(screen.getByText("Inserisci un importo in euro, ad esempio 1.500,00")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Salva" }));
    expect(mocks.actions.setTotalAction).not.toHaveBeenCalled();
  });

  it("saves cents and the optional reason", async () => {
    mocks.actions.setTotalAction.mockResolvedValue({ ok: true, data: undefined });
    const onOpenChange = vi.fn();
    render(<TotalSheet open onOpenChange={onOpenChange} currentTotal={null} agreed={0} />);
    await userEvent.type(screen.getByLabelText("Budget totale"), "25.000");
    await userEvent.type(screen.getByLabelText("Motivo (facoltativo)"), "  Partenza ");
    await userEvent.click(screen.getByRole("button", { name: "Salva" }));
    expect(mocks.actions.setTotalAction).toHaveBeenCalledWith({
      totalCents: 2_500_000,
      reason: "Partenza",
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("lowering the total below the Concordato warns but never blocks", async () => {
    mocks.actions.setTotalAction.mockResolvedValue({ ok: true, data: undefined });
    render(<TotalSheet open onOpenChange={() => {}} currentTotal={2_500_000} agreed={520_000} />);
    const field = screen.getByLabelText("Budget totale");
    await userEvent.clear(field);
    await userEvent.type(field, "4000");
    const warning = screen.getByTestId("total-reduced-warning");
    expect(warning.textContent).toContain("Hai concordato € 1.200 oltre il totale.");
    await userEvent.click(screen.getByRole("button", { name: "Salva" }));
    expect(mocks.actions.setTotalAction).toHaveBeenCalledWith({
      totalCents: 400_000,
      reason: null,
    });
  });
});

describe("ItemSheet (AC35, AC40)", () => {
  it("adds an item with planned amount and status", async () => {
    mocks.actions.addItemAction.mockResolvedValue({ ok: true, data: { itemId: "x" } });
    render(
      <ItemSheet
        open
        onOpenChange={() => {}}
        categoryId="cat"
        item={null}
        partnerName="Jessica"
        onStale={() => {}}
      />,
    );
    await userEvent.type(screen.getByLabelText("Descrizione"), "Torta");
    await userEvent.type(screen.getByLabelText("Importo previsto"), "350");
    await userEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    expect(mocks.actions.addItemAction).toHaveBeenCalledWith({
      categoryId: "cat",
      item: { description: "Torta", status: "planned", plannedCents: 35_000, agreedCents: null },
    });
  });

  it("the agreed amount appears only for 'Concordato'", async () => {
    render(
      <ItemSheet
        open
        onOpenChange={() => {}}
        categoryId="cat"
        item={null}
        partnerName="Jessica"
        onStale={() => {}}
      />,
    );
    expect(screen.queryByLabelText("Importo concordato")).toBeNull();
    await userEvent.click(screen.getByRole("radio", { name: "Concordato" }));
    expect(screen.getByLabelText("Importo concordato")).toBeTruthy();
  });

  it("requires a description, inline", async () => {
    render(
      <ItemSheet
        open
        onOpenChange={() => {}}
        categoryId="cat"
        item={null}
        partnerName="Jessica"
        onStale={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    expect(screen.getByText("Scrivi cos'è questa voce.")).toBeTruthy();
    expect(mocks.actions.addItemAction).not.toHaveBeenCalled();
  });

  it("a conflict opens the dialog with Italian labels; 'Salva comunque' retries with the current version", async () => {
    mocks.actions.updateItemAction
      .mockResolvedValueOnce({
        ok: false,
        code: "conflict",
        message: "Qualcuno ha modificato questo elemento mentre lo guardavi.",
        conflict: {
          current: {
            description: "Menu per 80 persone",
            status: "agreed",
            plannedCents: 500_000,
            agreedCents: 600_000,
            version: 5,
          },
          changedByName: "Jessica",
          changedAt: new Date().toISOString(),
        },
      })
      .mockResolvedValueOnce({ ok: true, data: { version: 6 } });
    const onOpenChange = vi.fn();
    render(
      <ItemSheet
        open
        onOpenChange={onOpenChange}
        categoryId="cat"
        item={menu}
        partnerName="Jessica"
        onStale={() => {}}
      />,
    );
    const field = screen.getByLabelText("Importo concordato");
    await userEvent.clear(field);
    await userEvent.type(field, "5300");
    await userEvent.click(screen.getByRole("button", { name: "Salva" }));
    await screen.findByText(/Jessica ha modificato questo elemento/);
    await userEvent.click(screen.getByRole("button", { name: "Vedi cosa è cambiato" }));
    expect(screen.getByRole("rowheader", { name: "Importo concordato" })).toBeTruthy();
    expect(screen.getByText("€ 6.000")).toBeTruthy();
    expect(screen.getByText("€ 5.300")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Salva comunque" }));
    await waitFor(() =>
      expect(mocks.actions.updateItemAction).toHaveBeenLastCalledWith({
        itemId: "item-menu",
        version: 5,
        item: expect.objectContaining({ agreedCents: 530_000 }),
      }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});

describe("PaymentSheet (AC36)", () => {
  const sheet = (payment: PaymentView | null, siblings: PaymentView[] = []) => (
    <PaymentSheet
      open
      onOpenChange={() => {}}
      item={menu}
      payment={payment}
      siblings={siblings}
      today={TODAY}
      partnerName="Jessica"
      onStale={() => {}}
    />
  );

  it("registers a payment still to pay", async () => {
    mocks.actions.addPaymentAction.mockResolvedValue({ ok: true, data: { paymentId: "p" } });
    render(sheet(null));
    await userEvent.click(screen.getByRole("radio", { name: "Saldo" }));
    await userEvent.type(screen.getByLabelText("Importo"), "1.500,50");
    fireEvent.change(screen.getByLabelText("Scadenza (facoltativa)"), {
      target: { value: "2027-08-01" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Registra" }));
    expect(mocks.actions.addPaymentAction).toHaveBeenCalledWith({
      itemId: "item-menu",
      payment: {
        kind: "balance",
        amountCents: 150_050,
        dueDate: "2027-08-01",
        paid: false,
        paidOn: null,
      },
    });
  });

  it("paying more than the Concordato asks for a confirmation but never blocks", async () => {
    mocks.actions.addPaymentAction.mockResolvedValue({ ok: true, data: { paymentId: "p" } });
    render(sheet(null, [pay({ id: "a", paid: true, paidOn: "2026-11-01", amountCents: 500_000 })]));
    await userEvent.type(screen.getByLabelText("Importo"), "300");
    await userEvent.click(screen.getByLabelText("Già pagato"));
    expect(screen.getByTestId("overpaid-warning").textContent).toContain(
      "Hai pagato € 100 più di quanto concordato per «Menu per 80 persone».",
    );
    await userEvent.click(screen.getByRole("button", { name: "Registra comunque" }));
    expect(mocks.actions.addPaymentAction).toHaveBeenCalledWith({
      itemId: "item-menu",
      payment: expect.objectContaining({ amountCents: 30_000, paid: true, paidOn: TODAY }),
    });
  });

  it("a payment still to pay never carries a payment date", async () => {
    mocks.actions.updatePaymentAction.mockResolvedValue({ ok: true, data: { version: 2 } });
    render(sheet(pay({ paid: true, paidOn: "2026-11-01" })));
    await userEvent.click(screen.getByLabelText("Già pagato"));
    await userEvent.click(screen.getByRole("button", { name: "Salva" }));
    expect(mocks.actions.updatePaymentAction).toHaveBeenCalledWith({
      paymentId: "pay-1",
      version: 1,
      payment: expect.objectContaining({ paid: false, paidOn: null }),
    });
  });
});

describe("CategoryDetail (AC34, AC35)", () => {
  const detail = (s: BudgetSnapshot, categoryId = "cat") => (
    <CategoryDetail snapshot={s} categoryId={categoryId} today={TODAY} />
  );

  it("shows the totals, items and payments of the category", () => {
    render(
      detail(
        snapshot({
          ...withTotal(2_500_000),
          items: [menu],
          payments: [
            pay({ paid: true, paidOn: "2026-11-01" }),
            pay({ id: "p2", amountCents: 200_000 }),
          ],
        }),
      ),
    );
    expect(screen.getByTestId("cat-assigned").textContent).toBe("€ 4.000");
    expect(screen.getByTestId("cat-agreed").textContent).toBe("€ 5.200");
    expect(screen.getByTestId("cat-paid").textContent).toBe("€ 1.000");
    expect(screen.getByTestId("cat-remaining").textContent).toBe("€ 4.200");
    expect(screen.getByText("Menu per 80 persone")).toBeTruthy();
    expect(screen.getByText(/Pagato il 1 nov 2026/)).toBeTruthy();
    expect(screen.getByText(/Da pagare entro il 1 dic 2026/)).toBeTruthy();
  });

  it("a category with items asks 'Sposta in…' first and never deletes directly", async () => {
    mocks.actions.moveAndDeleteCategoryAction.mockResolvedValue({
      ok: true,
      data: { moved: 1, version: 9 },
    });
    render(detail(snapshot({ items: [menu] })));
    await userEvent.click(screen.getByTestId("category-delete"));
    expect(mocks.actions.removeCategoryAction).not.toHaveBeenCalled();
    expect(screen.getByText("Sposta le voci prima di eliminare")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Sposta ed elimina" }));
    expect(screen.getByText("Scegli dove spostare le voci.")).toBeTruthy();
    expect(mocks.actions.moveAndDeleteCategoryAction).not.toHaveBeenCalled();

    await userEvent.selectOptions(screen.getByLabelText("Sposta in…"), "loc");
    await userEvent.click(screen.getByRole("button", { name: "Sposta ed elimina" }));
    expect(mocks.actions.moveAndDeleteCategoryAction).toHaveBeenCalledWith({
      fromId: "cat",
      toId: "loc",
    });
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/budget"));
    const [, options] = mocks.toast.mock.calls.at(-1)!;
    expect(options.duration).toBeGreaterThanOrEqual(8000);
    expect(options.action.label).toBe("Annulla");
  });

  it("an empty category is deleted with an Annulla toast of at least 8 s that restores it", async () => {
    mocks.actions.removeCategoryAction.mockResolvedValue({ ok: true, data: { version: 4 } });
    mocks.actions.restoreCategoryAction.mockResolvedValue({ ok: true, data: { version: 5 } });
    render(detail(snapshot()));
    await userEvent.click(screen.getByTestId("category-delete"));
    expect(mocks.actions.removeCategoryAction).toHaveBeenCalledWith({
      categoryId: "cat",
      version: 3,
    });
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/budget"));
    const [message, options] = mocks.toast.mock.calls.at(-1)!;
    expect(message).toBe("«Catering» è stata eliminata.");
    expect(options.duration).toBe(UNDO_MS);
    expect(UNDO_MS).toBeGreaterThanOrEqual(8000);
    await options.action.onClick();
    expect(mocks.actions.restoreCategoryAction).toHaveBeenCalledWith({
      categoryId: "cat",
      version: 4,
    });
  });

  it("deleting an item shows Annulla (at least 8 s) and restores it with the new version", async () => {
    mocks.actions.removeItemAction.mockResolvedValue({ ok: true, data: { version: 3 } });
    mocks.actions.restoreItemAction.mockResolvedValue({ ok: true, data: { version: 4 } });
    render(detail(snapshot({ items: [menu] })));
    await userEvent.click(screen.getByRole("button", { name: "Elimina «Menu per 80 persone»" }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
    const [, options] = mocks.toast.mock.calls.at(-1)!;
    expect(options.duration).toBeGreaterThanOrEqual(8000);
    await options.action.onClick();
    expect(mocks.actions.restoreItemAction).toHaveBeenCalledWith({
      itemId: "item-menu",
      version: 3,
    });
  });

  it("a failed delete says why and keeps the screen", async () => {
    mocks.actions.removeCategoryAction.mockResolvedValue({
      ok: false,
      code: "category_not_empty",
      message: "Questa categoria ha ancora delle voci: spostale prima in un'altra.",
    });
    render(detail(snapshot()));
    await userEvent.click(screen.getByTestId("category-delete"));
    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith(
        "Questa categoria ha ancora delle voci: spostale prima in un'altra.",
      ),
    );
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
