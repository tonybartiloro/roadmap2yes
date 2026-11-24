import type { PlainDate } from "@/lib/dates/plain-date";

/** Pure inputs of the reminder planner (plan §7). No clock, no database: `today` is a parameter. */

export type Slot = "A" | "B";
export type Assignee = "both" | Slot;

export interface PlanTask {
  readonly id: string;
  readonly title: string;
  readonly dueDate: PlainDate | null;
  readonly status: "todo" | "done";
  readonly assignee: Assignee;
  /** AC61: the per-task "Ricordamelo per email" switch. */
  readonly remindersEnabled: boolean;
  /** ISO instant, or null when the task is alive. */
  readonly deletedAt: string | null;
}

/** A partner who may receive email: only members (for B this means after the first login, D44). */
export interface PlanRecipient {
  readonly userId: string;
  readonly slot: Slot;
  readonly firstName?: string | null;
  readonly label?: string | null;
  readonly remindersEnabled: boolean;
  readonly digestEnabled: boolean;
  /**
   * Rome date of the membership (for B: the first login). "Tra 7 giorni" reminders whose window
   * opened BEFORE this day are not made up (D44: no catch-up at entry).
   */
  readonly joinedOn?: PlainDate;
}

export interface PlanPayment {
  readonly id: string;
  readonly description: string;
  readonly amountCents: number;
  readonly dueDate: PlainDate | null;
  readonly paid: boolean;
  readonly deletedAt: string | null;
  /** The payment belongs to a deleted budget item: it is excluded (REV-5a). */
  readonly itemDeleted: boolean;
}

/** A task as it appears in an email block. */
export interface PlannedTask {
  readonly id: string;
  readonly title: string;
  readonly dueDate: PlainDate;
  readonly provisional: boolean;
}
