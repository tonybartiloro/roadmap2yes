"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Clock, History, Pencil, Plus, Wallet } from "lucide-react";
import { BudgetBar } from "@/components/BudgetBar";
import { EmptyState } from "@/components/EmptyState";
import { formatShortDate, plural } from "@/components/format";
import { Button } from "@/components/ui/button";
import { budgetTotals, budgetWarnings, upcomingPayments } from "@/domain/budget";
import type { PlainDate } from "@/lib/dates/plain-date";
import { formatEuro } from "@/lib/money";
import { CategorySheet } from "./CategorySheet";
import { HistorySheet } from "./HistorySheet";
import { budgetInput, dueText } from "./model";
import { AmountList, CategoryBar, UnassignedLine, WarningList } from "./parts";
import { TotalSheet } from "./TotalSheet";
import type { BudgetSnapshot } from "./types";
import { usePaymentActions } from "./use-payment-actions";

type Sheet = "total" | "history" | "category" | null;

/**
 * Budget summary (design §3.6): the total with "Modifica" and "Storico", what is still not
 * assigned (sticky), warm notices, one bar per category with its text equivalent, and the next
 * payments in due-date order.
 */
export function BudgetOverview({
  snapshot,
  today,
}: {
  snapshot: BudgetSnapshot;
  today: PlainDate;
}) {
  const router = useRouter();
  const [sheet, setSheet] = useState<Sheet>(null);
  const close = (next: boolean) => {
    if (!next) setSheet(null);
  };
  const payments = usePaymentActions({ partnerName: snapshot.partnerName, today });

  const input = budgetInput(snapshot);
  const totals = budgetTotals(input);
  const warnings = budgetWarnings(input, totals);
  const upcoming = upcomingPayments(input, today);
  const hasTotal = totals.total !== null;

  return (
    <div className="flex flex-col gap-6" data-testid="budget-overview">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl leading-8 font-semibold">Budget</h1>
        <p className="text-muted-foreground">
          Quanto spendere, dove e quando pagare: tutto in un posto, con lo storico delle modifiche.
        </p>
      </div>

      {hasTotal ? (
        <section
          aria-labelledby="total-heading"
          className="border-border bg-card flex flex-col gap-4 rounded-lg border p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col">
              <h2 id="total-heading" className="text-muted-foreground text-base font-normal">
                Budget totale
              </h2>
              <p className="text-3xl font-semibold tabular-nums" data-testid="budget-total">
                {formatEuro(totals.total ?? 0)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setSheet("total")}>
                <Pencil aria-hidden className="size-4" />
                Modifica
              </Button>
              <Button type="button" variant="outline" onClick={() => setSheet("history")}>
                <History aria-hidden className="size-4" />
                Storico
              </Button>
            </div>
          </div>
          <AmountList
            rows={[
              { label: "Assegnato", value: formatEuro(totals.assigned), testId: "sum-assigned" },
              { label: "Previsto", value: formatEuro(totals.planned), testId: "sum-planned" },
              { label: "Concordato", value: formatEuro(totals.agreed), testId: "sum-agreed" },
              { label: "Pagato", value: formatEuro(totals.paid), testId: "sum-paid" },
              {
                label: "Ancora da pagare",
                value: formatEuro(totals.remaining),
                testId: "sum-remaining",
              },
            ]}
          />
          <BudgetBar
            label="Concordato sul totale"
            value={totals.agreed}
            total={totals.total ?? 0}
          />
        </section>
      ) : (
        <EmptyState
          icon={<Wallet className="size-8" />}
          title="Budget da definire"
          description="Parti da una cifra indicativa: potrai cambiarla."
          action={
            <Button type="button" onClick={() => setSheet("total")} data-testid="total-set">
              Imposta il budget
            </Button>
          }
        />
      )}

      <UnassignedLine total={totals.total} unassigned={totals.unassigned} />
      <WarningList warnings={warnings} />

      <section aria-labelledby="categories-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="categories-heading" className="text-xl leading-7 font-semibold">
            Categorie
          </h2>
          <Button type="button" variant="outline" onClick={() => setSheet("category")}>
            <Plus aria-hidden className="size-4" />
            Aggiungi categoria
          </Button>
        </div>
        {totals.categories.length === 0 ? (
          <p className="text-muted-foreground">Nessuna categoria: aggiungi la prima.</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {totals.categories.map((category) => {
              const view = snapshot.categories.find((c) => c.id === category.categoryId);
              return (
                <li key={category.categoryId}>
                  <Link
                    href={`/budget/${category.categoryId}`}
                    data-testid={`category-${view?.defaultKey ?? category.categoryId}`}
                    className="border-border bg-card focus-visible:ring-ring hover:border-primary flex min-h-11 flex-col gap-2 rounded-lg border p-4 focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{category.name}</span>
                      <ChevronRight aria-hidden className="text-muted-foreground size-5" />
                    </span>
                    <span className="tabular-nums" data-testid="category-key-number">
                      {category.assigned === null
                        ? `Non assegnato · concordato ${formatEuro(category.agreed)}`
                        : `Concordato ${formatEuro(category.agreed)} su ${formatEuro(category.assigned)}`}
                    </span>
                    <CategoryBar
                      label={category.name}
                      agreed={category.agreed}
                      paid={category.paid}
                      assigned={category.assigned}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="upcoming-heading" className="flex flex-col gap-3">
        <h2 id="upcoming-heading" className="text-xl leading-7 font-semibold">
          Prossimi pagamenti
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-muted-foreground" data-testid="upcoming-empty">
            Nessun pagamento in programma.
          </p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="upcoming-payments">
            {upcoming.map((payment) => {
              const row = snapshot.payments.find((p) => p.id === payment.paymentId);
              return (
                <li
                  key={payment.paymentId}
                  className="border-border bg-card flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="flex min-w-0 flex-col">
                    <Link
                      href={`/budget/${payment.categoryId}`}
                      className="text-primary inline-flex min-h-11 items-center truncate underline underline-offset-4"
                    >
                      {payment.itemDescription}
                    </Link>
                    <span className="text-muted-foreground text-sm">{payment.categoryName}</span>
                    <span className="flex items-center gap-1.5 text-sm tabular-nums">
                      {payment.overdue ? <Clock aria-hidden className="size-4" /> : null}
                      {dueText(payment.daysUntil)} · {formatShortDate(payment.dueDate)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold tabular-nums">
                      {formatEuro(payment.amountCents)}
                    </span>
                    {row ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void payments.markPaid(row)}
                      >
                        Segna pagato
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {upcoming.length > 0 ? (
          <p className="text-muted-foreground text-sm">
            {plural(upcoming.length, "pagamento", "pagamenti")} da fare, in ordine di scadenza.
          </p>
        ) : null}
      </section>

      <Button
        type="button"
        size="icon"
        aria-label="Aggiungi una categoria"
        data-testid="category-add"
        onClick={() => setSheet("category")}
        className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 size-14 rounded-full shadow-lg md:right-8 md:bottom-8"
      >
        <Plus aria-hidden className="size-6!" />
      </Button>

      {sheet === "total" ? (
        <TotalSheet open onOpenChange={close} currentTotal={totals.total} agreed={totals.agreed} />
      ) : null}
      {sheet === "history" ? (
        <HistorySheet open onOpenChange={close} versions={snapshot.versions} />
      ) : null}
      {sheet === "category" ? (
        <CategorySheet
          open
          onOpenChange={close}
          category={null}
          partnerName={snapshot.partnerName}
          onStale={() => router.refresh()}
        />
      ) : null}
      {payments.dialog}
    </div>
  );
}
