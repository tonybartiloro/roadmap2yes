import { addDays, comparePlainDates, type PlainDate } from "@/lib/dates/plain-date";
import { audienceIncludes, REMINDER_WINDOW_DAYS } from "./plan";
import type { PlanPayment, PlanRecipient, PlanTask } from "./types";

export interface DigestTodoItem {
  title: string;
  dueDate: PlainDate;
  provisional: boolean;
  /** Past due: "da recuperare". */
  overdue: boolean;
}

export interface DigestPaymentItem {
  description: string;
  amountCents: number;
  dueDate: PlainDate;
}

export interface DigestPlan {
  readonly todo: readonly DigestTodoItem[];
  readonly payments: readonly DigestPaymentItem[];
  /** Full sentences about the OTHER partner's changes (already filtered by the news domain). */
  readonly news: readonly string[];
}

export interface PlanDigestInput {
  readonly today: PlainDate;
  readonly recipient: PlanRecipient;
  readonly tasks: readonly PlanTask[];
  readonly payments: readonly PlanPayment[];
  readonly news: readonly string[];
  readonly provisional: boolean;
}

/**
 * Content of the Monday digest for one user (plan §7, AC51). Pure.
 *
 * - To do: the user's active tasks (assignee rules of AC50, per-task switch AC61) that are overdue
 *   or due within 7 days.
 * - Payments: unpaid, not deleted, of a live budget item, due within 7 days or already late.
 * - News: passed in. Returns `null` when the three sections are empty (nothing to report).
 */
export function planDigest(input: PlanDigestInput): DigestPlan | null {
  const { today, recipient } = input;
  const horizon = addDays(today, REMINDER_WINDOW_DAYS);

  const todo: DigestTodoItem[] = input.tasks
    .filter(
      (t) =>
        t.status === "todo" &&
        t.deletedAt === null &&
        t.remindersEnabled &&
        t.dueDate !== null &&
        comparePlainDates(t.dueDate, horizon) <= 0 &&
        audienceIncludes(t.assignee, recipient.slot),
    )
    .map((t) => ({
      title: t.title,
      dueDate: t.dueDate!,
      provisional: input.provisional,
      overdue: comparePlainDates(t.dueDate!, today) < 0,
    }))
    .sort(
      (a, b) => comparePlainDates(a.dueDate, b.dueDate) || a.title.localeCompare(b.title, "it"),
    );

  const payments: DigestPaymentItem[] = input.payments
    .filter(
      (p) =>
        !p.paid &&
        p.deletedAt === null &&
        !p.itemDeleted &&
        p.dueDate !== null &&
        comparePlainDates(p.dueDate, horizon) <= 0,
    )
    .map((p) => ({ description: p.description, amountCents: p.amountCents, dueDate: p.dueDate! }))
    .sort(
      (a, b) =>
        comparePlainDates(a.dueDate, b.dueDate) || a.description.localeCompare(b.description, "it"),
    );

  if (todo.length + payments.length + input.news.length === 0) return null;
  return { todo, payments, news: input.news };
}
