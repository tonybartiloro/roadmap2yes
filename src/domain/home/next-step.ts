import { comparePlainDates, diffDays, type PlainDate } from "@/lib/dates/plain-date";
import { getMilestone } from "@/content/milestones";
import type { TimelineTask } from "@/domain/timeline/types";

export const NEXT_STEP_MAX_SECONDARY = 2;
export const PAYMENT_WINDOW_DAYS = 14;
export const TASK_WINDOW_DAYS = 30;

const USER_TASK_PRIORITY = 1000;

/** Open blocking decision (AC27 (1)): data first, then location. */
export interface OpenDecision {
  readonly id: string;
  readonly kind: "date" | "location";
  readonly title: string;
}

/** A payment that is not settled yet (the caller filters `paid`). */
export interface PendingPayment {
  readonly id: string;
  readonly title: string;
  readonly dueDate: PlainDate;
}

export type NextStep =
  | {
      readonly kind: "decision";
      readonly id: string;
      readonly title: string;
      readonly decisionKind: "date" | "location";
    }
  | {
      readonly kind: "overdue-task";
      readonly id: string;
      readonly title: string;
      readonly dueDate: PlainDate;
    }
  | {
      readonly kind: "payment";
      readonly id: string;
      readonly title: string;
      readonly dueDate: PlainDate;
      readonly overdue: boolean;
    }
  | {
      readonly kind: "upcoming-task";
      readonly id: string;
      readonly title: string;
      readonly dueDate: PlainDate;
    };

export interface NextSteps {
  readonly primary: NextStep | null;
  /** At most 2. */
  readonly secondary: readonly NextStep[];
}

export interface NextStepInput {
  readonly openDecisions: readonly OpenDecision[];
  /** Tasks already filtered for the viewer (theirs + shared, per the Home toggle). */
  readonly tasks: readonly TimelineTask[];
  readonly payments: readonly PendingPayment[];
  readonly today: PlainDate;
}

const priorityOf = (t: TimelineTask) =>
  (t.templateKey ? getMilestone(t.templateKey)?.priority : undefined) ?? USER_TASK_PRIORITY;

const idOrder = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * "Prossimo passo" (AC27): 1 primary + max 2 secondary, in this order:
 * (1) open blocking decision (date, then location); (2) overdue tasks by priority; (3) payments
 * due within 14 days or overdue; (4) tasks due within 30 days.
 * Generated tasks that depend on the date and have no date are not considered (AC15).
 */
export function nextSteps(input: NextStepInput): NextSteps {
  const { openDecisions, tasks, payments, today } = input;
  const steps: NextStep[] = [];

  const decisionRank = (k: OpenDecision["kind"]) => (k === "date" ? 0 : 1);
  for (const d of [...openDecisions].sort((a, b) => decisionRank(a.kind) - decisionRank(b.kind))) {
    steps.push({ kind: "decision", id: d.id, title: d.title, decisionKind: d.kind });
  }

  const open = tasks.filter((t) => !t.deleted && t.status === "todo" && t.dueDate !== null);

  open
    .filter((t) => comparePlainDates(t.dueDate!, today) < 0)
    .sort(
      (a, b) =>
        priorityOf(a) - priorityOf(b) ||
        comparePlainDates(a.dueDate!, b.dueDate!) ||
        idOrder(a.id, b.id),
    )
    .forEach((t) =>
      steps.push({ kind: "overdue-task", id: t.id, title: t.title, dueDate: t.dueDate! }),
    );

  [...payments]
    .filter((p) => diffDays(today, p.dueDate) <= PAYMENT_WINDOW_DAYS)
    .sort((a, b) => comparePlainDates(a.dueDate, b.dueDate) || idOrder(a.id, b.id))
    .forEach((p) =>
      steps.push({
        kind: "payment",
        id: p.id,
        title: p.title,
        dueDate: p.dueDate,
        overdue: comparePlainDates(p.dueDate, today) < 0,
      }),
    );

  open
    .filter((t) => {
      const days = diffDays(today, t.dueDate!);
      return days >= 0 && days <= TASK_WINDOW_DAYS;
    })
    .sort(
      (a, b) =>
        comparePlainDates(a.dueDate!, b.dueDate!) ||
        priorityOf(a) - priorityOf(b) ||
        idOrder(a.id, b.id),
    )
    .forEach((t) =>
      steps.push({ kind: "upcoming-task", id: t.id, title: t.title, dueDate: t.dueDate! }),
    );

  return {
    primary: steps[0] ?? null,
    secondary: steps.slice(1, 1 + NEXT_STEP_MAX_SECONDARY),
  };
}
