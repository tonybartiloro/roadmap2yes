"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Check, Pencil, Plus, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { formatShortDate, plural } from "@/components/format";
import { Button } from "@/components/ui/button";
import { budgetTotals, budgetWarnings, categoryTotals, itemPaidCents } from "@/domain/budget";
import type { PlainDate } from "@/lib/dates/plain-date";
import { formatEuro } from "@/lib/money";
import {
  moveAndDeleteCategoryAction,
  removeCategoryAction,
  removeItemAction,
  restoreCategoryAction,
  restoreItemAction,
} from "./actions";
import { CategorySheet } from "./CategorySheet";
import { ItemSheet } from "./ItemSheet";
import { KIND_LABELS, budgetInput, STATUS_LABELS, UNDO_MS } from "./model";
import { MoveSheet } from "./MoveSheet";
import { AmountList, CategoryBar, UnassignedLine, WarningList } from "./parts";
import { PaymentSheet } from "./PaymentSheet";
import type { BudgetSnapshot, ItemView, PaymentView } from "./types";
import { usePaymentActions } from "./use-payment-actions";

type Sheet =
  | { kind: "category" }
  | { kind: "item"; item: ItemView | null }
  | { kind: "payment"; item: ItemView; payment: PaymentView | null }
  | { kind: "move" };

/**
 * One category (design §3.6): Assegnato and the totals, the warm notices, its items (Previsto /
 * Concordato / Annullata) and, under each agreed item, its payments. Deleting an empty category
 * has "Annulla"; one with items asks "Sposta in…" first.
 */
export function CategoryDetail({
  snapshot,
  categoryId,
  today,
}: {
  snapshot: BudgetSnapshot;
  categoryId: string;
  today: PlainDate;
}) {
  const router = useRouter();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const close = (next: boolean) => {
    if (!next) setSheet(null);
  };
  const refresh = () => router.refresh();
  const payments = usePaymentActions({ partnerName: snapshot.partnerName, today });

  const category = snapshot.categories.find((c) => c.id === categoryId);
  if (!category) return null;

  const input = budgetInput(snapshot);
  const all = budgetTotals(input);
  const totals = categoryTotals(category, snapshot.items, snapshot.payments);
  const items = snapshot.items.filter((i) => i.categoryId === category.id);
  const itemIds = new Set(items.map((i) => i.id));
  const warnings = budgetWarnings(input, all).filter(
    (w) =>
      (w.kind === "category-over" && w.categoryId === category.id) ||
      (w.kind === "item-overpaid" && itemIds.has(w.itemId)),
  );

  async function removeItem(item: ItemView) {
    const result = await removeItemAction({ itemId: item.id, version: item.version });
    if (!result.ok) {
      toast.error(result.message);
      if (result.code === "conflict") refresh();
      return;
    }
    toast(`«${item.description}» è stata tolta, con i suoi pagamenti.`, {
      duration: UNDO_MS,
      action: {
        label: "Annulla",
        onClick: async () => {
          const restored = await restoreItemAction({
            itemId: item.id,
            version: result.data.version,
          });
          if (restored.ok) toast("Voce rimessa al suo posto.");
          else toast.error(restored.message);
        },
      },
    });
  }

  async function undoCategory(version: number, name: string, movedTo?: string) {
    const restored = await restoreCategoryAction({ categoryId: category!.id, version });
    if (!restored.ok) toast.error(restored.message);
    else if (movedTo) toast(`«${name}» è tornata, vuota. Le voci restano in «${movedTo}».`);
    else toast(`«${name}» è tornata.`);
  }

  async function deleteCategory() {
    if (!category) return;
    if (items.length > 0) {
      setSheet({ kind: "move" });
      return;
    }
    const result = await removeCategoryAction({
      categoryId: category.id,
      version: category.version,
    });
    if (!result.ok) {
      toast.error(result.message);
      if (result.code === "conflict" || result.code === "category_not_empty") refresh();
      return;
    }
    const { name } = category;
    toast(`«${name}» è stata eliminata.`, {
      duration: UNDO_MS,
      action: { label: "Annulla", onClick: () => undoCategory(result.data.version, name) },
    });
    router.push("/budget");
  }

  async function moveAndDelete(toId: string) {
    if (!category) return { ok: false, code: "unknown", message: "" } as const;
    const { name } = category;
    const target = snapshot.categories.find((c) => c.id === toId)?.name ?? "l'altra categoria";
    const result = await moveAndDeleteCategoryAction({ fromId: category.id, toId });
    if (!result.ok) {
      // After a partial success the page must show the items where they are now.
      if (
        result.code === "moved_not_deleted" ||
        result.code === "category_deleted" ||
        result.code === "category_not_found"
      ) {
        refresh();
      }
      return result;
    }
    toast(
      `${plural(result.data.moved, "voce spostata", "voci spostate")} in «${target}». «${name}» è stata eliminata.`,
      {
        duration: UNDO_MS,
        action: {
          label: "Annulla",
          onClick: () => undoCategory(result.data.version, name, target),
        },
      },
    );
    router.push("/budget");
    return result;
  }

  const sheetItem = sheet?.kind === "item" ? sheet.item : null;
  const paymentsOf = (item: ItemView) => snapshot.payments.filter((p) => p.itemId === item.id);

  return (
    <div className="flex flex-col gap-6" data-testid={`budget-category-${category.id}`}>
      <div className="flex flex-col gap-2">
        <Link
          href="/budget"
          className="text-primary inline-flex min-h-11 items-center gap-1 underline underline-offset-4"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Tutto il budget
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl leading-8 font-semibold">{category.name}</h1>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setSheet({ kind: "category" })}>
              <Pencil aria-hidden className="size-4" />
              Modifica
            </Button>
            <Button
              type="button"
              variant="outline"
              data-testid="category-delete"
              onClick={() => void deleteCategory()}
            >
              <Trash2 aria-hidden className="size-4" />
              Elimina
            </Button>
          </div>
        </div>
      </div>

      <UnassignedLine total={all.total} unassigned={all.unassigned} />

      <section
        aria-label="Totali della categoria"
        className="border-border bg-card flex flex-col gap-4 rounded-lg border p-4"
      >
        <AmountList
          rows={[
            {
              label: "Assegnato",
              value: totals.assigned === null ? "Non assegnato" : formatEuro(totals.assigned),
              testId: "cat-assigned",
            },
            { label: "Previsto", value: formatEuro(totals.planned), testId: "cat-planned" },
            { label: "Concordato", value: formatEuro(totals.agreed), testId: "cat-agreed" },
            { label: "Pagato", value: formatEuro(totals.paid), testId: "cat-paid" },
            {
              label: "Ancora da pagare",
              value: formatEuro(totals.remaining),
              testId: "cat-remaining",
            },
          ]}
        />
        <CategoryBar
          label={category.name}
          agreed={totals.agreed}
          paid={totals.paid}
          assigned={totals.assigned}
        />
      </section>

      <WarningList warnings={warnings} />

      <section aria-labelledby="items-heading" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="items-heading" className="text-xl leading-7 font-semibold">
            Voci
          </h2>
          <Button
            type="button"
            variant="outline"
            data-testid="item-add"
            onClick={() => setSheet({ kind: "item", item: null })}
          >
            <Plus aria-hidden className="size-4" />
            Aggiungi voce
          </Button>
        </div>

        {items.length === 0 ? (
          <EmptyState
            title="Nessuna voce: aggiungi la prima"
            description="Una voce è una spesa di questa categoria, ad esempio «Menu per 80 persone»."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => {
              const itemPayments = paymentsOf(item);
              const paid = itemPaidCents(item, snapshot.payments);
              return (
                <li
                  key={item.id}
                  data-testid={`item-${item.id}`}
                  className="border-border bg-card flex flex-col gap-3 rounded-lg border p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <h3 className="font-semibold break-words">{item.description}</h3>
                      <p className="text-muted-foreground text-sm">{STATUS_LABELS[item.status]}</p>
                    </div>
                    <div className="flex flex-col items-end tabular-nums">
                      <span>Previsto {formatEuro(item.plannedCents)}</span>
                      {item.status === "agreed" ? (
                        <span className="font-semibold">
                          Concordato {formatEuro(item.agreedCents ?? 0)}
                        </span>
                      ) : null}
                      {item.status === "agreed" ? (
                        <span className="text-muted-foreground text-sm">
                          Pagato {formatEuro(paid)}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {itemPayments.length > 0 ? (
                    <ul className="border-border flex flex-col border-t" aria-label="Pagamenti">
                      {itemPayments.map((payment) => (
                        <li
                          key={payment.id}
                          data-testid={`payment-${payment.id}`}
                          className="border-border flex flex-wrap items-center justify-between gap-2 border-b py-2 last:border-b-0"
                        >
                          <div className="flex flex-col">
                            <span className="tabular-nums">
                              {KIND_LABELS[payment.kind]} · {formatEuro(payment.amountCents)}
                            </span>
                            <span className="text-muted-foreground text-sm">
                              {payment.paid ? (
                                <>
                                  <Check aria-hidden className="mr-1 inline size-4" />
                                  Pagato
                                  {payment.paidOn ? ` il ${formatShortDate(payment.paidOn)}` : ""}
                                </>
                              ) : payment.dueDate ? (
                                `Da pagare entro il ${formatShortDate(payment.dueDate)}`
                              ) : (
                                "Da pagare, senza scadenza"
                              )}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {!payment.paid ? (
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => void payments.markPaid(payment)}
                              >
                                Segna pagato
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => setSheet({ kind: "payment", item, payment })}
                              aria-label={`Modifica il pagamento di ${formatEuro(payment.amountCents)}`}
                            >
                              <Pencil aria-hidden className="size-4" />
                              Modifica
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() =>
                                void payments.remove(
                                  payment,
                                  `Il pagamento di ${formatEuro(payment.amountCents)}`,
                                )
                              }
                              aria-label={`Elimina il pagamento di ${formatEuro(payment.amountCents)}`}
                            >
                              <Trash2 aria-hidden className="size-4" />
                              Elimina
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    {item.status === "agreed" ? (
                      <Button
                        type="button"
                        variant="outline"
                        data-testid="payment-add"
                        onClick={() => setSheet({ kind: "payment", item, payment: null })}
                      >
                        <Plus aria-hidden className="size-4" />
                        Registra un pagamento
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setSheet({ kind: "item", item })}
                      aria-label={`Modifica «${item.description}»`}
                    >
                      <Pencil aria-hidden className="size-4" />
                      Modifica
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => void removeItem(item)}
                      aria-label={`Elimina «${item.description}»`}
                    >
                      <Trash2 aria-hidden className="size-4" />
                      Elimina
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Button
        type="button"
        size="icon"
        aria-label="Aggiungi una voce"
        data-testid="item-add-fab"
        onClick={() => setSheet({ kind: "item", item: null })}
        className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 size-14 rounded-full shadow-lg md:right-8 md:bottom-8"
      >
        <Plus aria-hidden className="size-6!" />
      </Button>

      {sheet?.kind === "category" ? (
        <CategorySheet
          key={category.id}
          open
          onOpenChange={close}
          category={category}
          partnerName={snapshot.partnerName}
          onStale={refresh}
        />
      ) : null}
      {sheet?.kind === "item" ? (
        <ItemSheet
          key={sheetItem?.id ?? "new"}
          open
          onOpenChange={close}
          categoryId={category.id}
          item={sheetItem}
          partnerName={snapshot.partnerName}
          onStale={refresh}
        />
      ) : null}
      {sheet?.kind === "payment" ? (
        <PaymentSheet
          key={sheet.payment?.id ?? `new-${sheet.item.id}`}
          open
          onOpenChange={close}
          item={sheet.item}
          payment={sheet.payment}
          siblings={paymentsOf(sheet.item)}
          today={today}
          partnerName={snapshot.partnerName}
          onStale={refresh}
        />
      ) : null}
      {sheet?.kind === "move" ? (
        <MoveSheet
          open
          onOpenChange={close}
          category={category}
          itemCount={items.length}
          destinations={snapshot.categories.filter((c) => c.id !== category.id)}
          onConfirm={moveAndDelete}
        />
      ) : null}
      {payments.dialog}
    </div>
  );
}
