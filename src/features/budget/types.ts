import type { BudgetCategory, BudgetItem, ItemStatus, Payment, PaymentKind } from "@/domain/budget";
import type { PlainDate } from "@/lib/dates/plain-date";
import type { Cents } from "@/lib/money";

export type {
  ActionFailure,
  ActionResult,
  ConflictInfo,
  VersionedResult,
} from "@/features/decisions/types";

/**
 * View models of the Budget screens (T13). Plain JSON only (no `Date`, no class): the server
 * components hand them to the client components as props. They extend the pure domain shapes, so
 * the totals, warnings and bars are computed with `@/domain/budget` straight on them.
 */

export interface CategoryView extends BudgetCategory {
  readonly version: number;
  /** Key of a predefined category, `null` for one the couple added. */
  readonly defaultKey: string | null;
}

export interface ItemView extends BudgetItem {
  readonly version: number;
}

export interface PaymentView extends Payment {
  readonly version: number;
}

export interface VersionView {
  readonly id: string;
  readonly totalCents: Cents;
  readonly createdAt: string;
  readonly reason: string | null;
  /** Already resolved: first name or "Il sistema"; never an id. */
  readonly authorName: string;
}

export interface BudgetSnapshot {
  readonly weddingId: string;
  /** Newest first (the first one is the current total). */
  readonly versions: readonly VersionView[];
  /** Live categories only, in display order. */
  readonly categories: readonly CategoryView[];
  /** Live items of live categories. */
  readonly items: readonly ItemView[];
  /** Live payments of live items. */
  readonly payments: readonly PaymentView[];
  readonly partnerName: string;
}

export type { ItemStatus, PaymentKind, PlainDate };

export interface ItemInput {
  description: string;
  status: ItemStatus;
  plannedCents: Cents;
  agreedCents: Cents | null;
}

export interface PaymentInput {
  kind: PaymentKind;
  amountCents: Cents;
  dueDate: PlainDate | null;
  paid: boolean;
  paidOn: PlainDate | null;
}
