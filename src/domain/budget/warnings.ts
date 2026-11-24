import { formatEuro, type Cents } from "@/lib/money";
import { budgetTotals, itemPaidCents, type BudgetInput, type BudgetTotals } from "./totals";

export type BudgetWarning =
  | {
      readonly kind: "category-over";
      readonly categoryId: string;
      readonly overCents: Cents;
      readonly message: string;
    }
  | { readonly kind: "total-over"; readonly overCents: Cents; readonly message: string }
  | { readonly kind: "assigned-over-total"; readonly overCents: Cents; readonly message: string }
  | {
      readonly kind: "item-overpaid";
      readonly itemId: string;
      readonly overCents: Cents;
      readonly message: string;
    };

/** Concordato > Assegnato of a category: "Sei oltre di € 1.200 su Catering." (AC37). */
export function categoryOverMessage(name: string, overCents: Cents): string {
  return `Sei oltre di ${formatEuro(overCents)} su ${name}.`;
}

export function totalOverMessage(overCents: Cents): string {
  return `Hai concordato ${formatEuro(overCents)} oltre il totale.`;
}

/** PO-7: same warm tone, never a negative number. */
export function assignedOverTotalMessage(overCents: Cents): string {
  return `Hai assegnato ${formatEuro(overCents)} oltre il totale.`;
}

export function itemOverpaidMessage(description: string, overCents: Cents): string {
  return `Hai pagato ${formatEuro(overCents)} più di quanto concordato per «${description}».`;
}

/**
 * Informative, non-blocking notice shown when the user lowers the total below the Concordato
 * (AC33). Returns `null` when the new total is not below it.
 */
export function totalReducedWarning(
  newTotalCents: Cents,
  agreedCents: Cents,
): BudgetWarning | null {
  const over = agreedCents - newTotalCents;
  return over > 0 ? { kind: "total-over", overCents: over, message: totalOverMessage(over) } : null;
}

/** All warnings of a budget, in a stable order: categories, total, assigned, payments. */
export function budgetWarnings(
  input: BudgetInput,
  totals: BudgetTotals = budgetTotals(input),
): BudgetWarning[] {
  const warnings: BudgetWarning[] = [];

  for (const c of totals.categories) {
    if (c.assigned !== null && c.agreed > c.assigned) {
      const overCents = c.agreed - c.assigned;
      warnings.push({
        kind: "category-over",
        categoryId: c.categoryId,
        overCents,
        message: categoryOverMessage(c.name, overCents),
      });
    }
  }
  if (totals.total !== null && totals.agreed > totals.total) {
    const overCents = totals.agreed - totals.total;
    warnings.push({ kind: "total-over", overCents, message: totalOverMessage(overCents) });
  }
  if (totals.overAssigned > 0) {
    warnings.push({
      kind: "assigned-over-total",
      overCents: totals.overAssigned,
      message: assignedOverTotalMessage(totals.overAssigned),
    });
  }
  const liveCategoryIds = new Set(totals.categories.map((c) => c.categoryId));
  for (const item of input.items) {
    if (item.deleted || !liveCategoryIds.has(item.categoryId) || item.status !== "agreed") continue;
    const overCents = itemPaidCents(item, input.payments) - (item.agreedCents ?? 0);
    if (overCents > 0) {
      warnings.push({
        kind: "item-overpaid",
        itemId: item.id,
        overCents,
        message: itemOverpaidMessage(item.description, overCents),
      });
    }
  }
  return warnings;
}
