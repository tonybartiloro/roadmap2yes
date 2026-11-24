import { comparePlainDates, diffDays, type PlainDate } from "@/lib/dates/plain-date";
import type { Cents } from "@/lib/money";
import type { BudgetCategory, BudgetItem, BudgetVersion, Payment } from "./types";

/** Amounts of one scope (a category or the whole budget). All integer cents. */
export interface Amounts {
  /** Planned (Previsto): every item that is not cancelled. */
  readonly planned: Cents;
  /** Agreed (Concordato): agreed items, at their agreed amount (0 while it is not set). */
  readonly agreed: Cents;
  /** Paid (Pagato): paid payments of agreed items. */
  readonly paid: Cents;
  /** Still to pay (Ancora da pagare) = agreed - paid, never negative. */
  readonly remaining: Cents;
}

export interface CategoryTotals extends Amounts {
  readonly categoryId: string;
  readonly name: string;
  /** Assigned (Assegnato); `null` = not assigned yet. */
  readonly assigned: Cents | null;
}

export interface BudgetTotals extends Amounts {
  /** Current total (latest version), `null` when none was ever set. */
  readonly total: Cents | null;
  /** Sum of the assigned amounts of the categories. */
  readonly assigned: Cents;
  /** Total - assigned, never negative; `null` without a total. */
  readonly unassigned: Cents | null;
  /** Assigned beyond the total, 0 when within (PO-7: shown warmly, never as a negative number). */
  readonly overAssigned: Cents;
  readonly categories: readonly CategoryTotals[];
}

/** Current total = the latest version (AC33); `null` when there is none. */
export function currentTotal(versions: readonly BudgetVersion[]): Cents | null {
  let latest: BudgetVersion | null = null;
  for (const v of versions) {
    if (
      !latest ||
      v.createdAt > latest.createdAt ||
      (v.createdAt === latest.createdAt && v.id > latest.id)
    ) {
      latest = v;
    }
  }
  return latest ? latest.totalCents : null;
}

const sum = (values: Iterable<number>): number => {
  let total = 0;
  for (const v of values) total += v;
  return total;
};

export function itemAgreedCents(item: BudgetItem): Cents {
  return item.status === "agreed" ? (item.agreedCents ?? 0) : 0;
}

/** Paid amount of one item (paid, not deleted payments). */
export function itemPaidCents(item: BudgetItem, payments: readonly Payment[]): Cents {
  if (item.status !== "agreed") return 0;
  return sum(
    payments.filter((p) => p.itemId === item.id && p.paid && !p.deleted).map((p) => p.amountCents),
  );
}

function amountsOf(items: readonly BudgetItem[], payments: readonly Payment[]): Amounts {
  const live = items.filter((i) => !i.deleted);
  const planned = sum(live.filter((i) => i.status !== "cancelled").map((i) => i.plannedCents));
  const agreed = sum(live.map(itemAgreedCents));
  const paid = sum(live.map((i) => itemPaidCents(i, payments)));
  return { planned, agreed, paid, remaining: Math.max(0, agreed - paid) };
}

export function categoryTotals(
  category: BudgetCategory,
  items: readonly BudgetItem[],
  payments: readonly Payment[],
): CategoryTotals {
  return {
    categoryId: category.id,
    name: category.name,
    assigned: category.assignedCents,
    ...amountsOf(
      items.filter((i) => i.categoryId === category.id),
      payments,
    ),
  };
}

export interface BudgetInput {
  readonly versions: readonly BudgetVersion[];
  readonly categories: readonly BudgetCategory[];
  readonly items: readonly BudgetItem[];
  readonly payments: readonly Payment[];
}

export function budgetTotals({ versions, categories, items, payments }: BudgetInput): BudgetTotals {
  const live = categories
    .filter((c) => !c.deleted)
    .toSorted((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const perCategory = live.map((c) => categoryTotals(c, items, payments));
  const total = currentTotal(versions);
  const assigned = sum(perCategory.map((c) => c.assigned ?? 0));
  return {
    total,
    assigned,
    unassigned: total === null ? null : Math.max(0, total - assigned),
    overAssigned: total === null ? 0 : Math.max(0, assigned - total),
    categories: perCategory,
    planned: sum(perCategory.map((c) => c.planned)),
    agreed: sum(perCategory.map((c) => c.agreed)),
    paid: sum(perCategory.map((c) => c.paid)),
    remaining: sum(perCategory.map((c) => c.remaining)),
  };
}

export interface UpcomingPayment {
  readonly paymentId: string;
  readonly itemId: string;
  readonly itemDescription: string;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly amountCents: Cents;
  readonly dueDate: PlainDate;
  /** Negative when overdue. */
  readonly daysUntil: number;
  readonly overdue: boolean;
}

export interface UpcomingOptions {
  /** Only payments due within this many days from `today` (overdue ones are always kept). */
  readonly withinDays?: number;
  readonly limit?: number;
}

/**
 * "Prossimi pagamenti" (AC36): unpaid payments of agreed items that have a due date, soonest
 * first (overdue ones lead). Payments without a due date are not listed.
 */
export function upcomingPayments(
  { categories, items, payments }: Pick<BudgetInput, "categories" | "items" | "payments">,
  today: PlainDate,
  options: UpcomingOptions = {},
): UpcomingPayment[] {
  const liveCategories = new Map(categories.filter((c) => !c.deleted).map((c) => [c.id, c]));
  const liveItems = new Map(
    items.filter((i) => !i.deleted && i.status === "agreed").map((i) => [i.id, i]),
  );
  const rows: UpcomingPayment[] = [];
  for (const p of payments) {
    if (p.paid || p.deleted || p.dueDate === null) continue;
    const item = liveItems.get(p.itemId);
    const category = item && liveCategories.get(item.categoryId);
    if (!item || !category) continue;
    const daysUntil = diffDays(today, p.dueDate);
    if (options.withinDays !== undefined && daysUntil > options.withinDays) continue;
    rows.push({
      paymentId: p.id,
      itemId: item.id,
      itemDescription: item.description,
      categoryId: category.id,
      categoryName: category.name,
      amountCents: p.amountCents,
      dueDate: p.dueDate,
      daysUntil,
      overdue: daysUntil < 0,
    });
  }
  rows.sort(
    (a, b) => comparePlainDates(a.dueDate, b.dueDate) || (a.paymentId < b.paymentId ? -1 : 1),
  );
  return options.limit === undefined ? rows : rows.slice(0, options.limit);
}
