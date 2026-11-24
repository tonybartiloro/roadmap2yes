import type { PlainDate } from "@/lib/dates/plain-date";
import type { Cents } from "@/lib/money";

export type ItemStatus = "planned" | "agreed" | "cancelled";
export type PaymentKind = "deposit" | "balance" | "other";

/** Plain shapes the pure budget code needs; callers map DB rows to them (T9/T13). */
export interface BudgetVersion {
  readonly id: string;
  readonly totalCents: Cents;
  /** ISO timestamp. */
  readonly createdAt: string;
  readonly reason?: string | null;
}

export interface BudgetCategory {
  readonly id: string;
  readonly name: string;
  /** `null` = nothing assigned yet ("non assegnato", D37). */
  readonly assignedCents: Cents | null;
  readonly deleted?: boolean;
  readonly sortOrder?: number;
}

export interface BudgetItem {
  readonly id: string;
  readonly categoryId: string;
  readonly description: string;
  readonly status: ItemStatus;
  readonly plannedCents: Cents;
  /** Set when the price is fixed. */
  readonly agreedCents: Cents | null;
  readonly deleted?: boolean;
}

export interface Payment {
  readonly id: string;
  readonly itemId: string;
  readonly kind: PaymentKind;
  readonly amountCents: Cents;
  readonly dueDate: PlainDate | null;
  readonly paid: boolean;
  readonly paidOn?: PlainDate | null;
  readonly deleted?: boolean;
}
