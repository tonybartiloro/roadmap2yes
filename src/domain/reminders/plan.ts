import { addDays, comparePlainDates, diffDays, type PlainDate } from "@/lib/dates/plain-date";
import type { PlanRecipient, PlanTask, PlannedTask, Slot } from "./types";

/** Number of days ahead in the "tra 7 giorni" block. */
export const REMINDER_WINDOW_DAYS = 7;
/** The ledger accepts at most 200 item keys per batch. */
export const MAX_ITEM_KEYS = 200;

export const sevenDayKey = (taskId: string, due: PlainDate): string => `task_7d:${taskId}:${due}`;
export const dueTodayKey = (taskId: string, due: PlainDate): string => `task_due:${taskId}:${due}`;

/** "Entrambi" goes to both partners, "A"/"B" only to that partner (AC50). */
export function audienceIncludes(assignee: PlanTask["assignee"], slot: Slot): boolean {
  return assignee === "both" || assignee === slot;
}

export interface PlanRemindersInput {
  /** Calendar date in Europe/Rome. */
  readonly today: PlainDate;
  /** Recipients of ONE wedding: only members (D44). */
  readonly recipients: readonly PlanRecipient[];
  readonly tasks: readonly PlanTask[];
  /** Per user: item keys already delivered (or claimed) by OTHER batches. */
  readonly doneKeys?: ReadonlyMap<string, ReadonlySet<string>>;
  /** Per task: Rome date on which `due_date` was last set or changed (from the audit log). */
  readonly dueChangedOn?: ReadonlyMap<string, PlainDate>;
  /** The reference date is not decided yet: emails carry the "data provvisoria" note. */
  readonly provisional: boolean;
}

export interface UserReminderPlan {
  readonly userId: string;
  /** Block "tra 7 giorni" (due in 1..7 days). */
  readonly sevenDays: readonly PlannedTask[];
  /** Block "oggi". */
  readonly today: readonly PlannedTask[];
  /** Ledger item keys of everything in the two blocks. */
  readonly itemKeys: readonly string[];
}

function byDueThenTitle(a: PlannedTask, b: PlannedTask): number {
  return (
    comparePlainDates(a.dueDate, b.dueDate) ||
    a.title.localeCompare(b.title, "it") ||
    (a.id < b.id ? -1 : 1)
  );
}

/**
 * Which reminders each user gets today (plan §7, AC50). Pure.
 *
 * - Only active tasks (not done, not deleted) with a due date and the per-task switch on (AC61).
 * - "Tra 7 giorni": the due date is 1..7 days away. The window (not the exact day) makes a skipped
 *   cron run recoverable the next day. Not for dates set or changed inside the window (D38), and
 *   never twice (item keys in `doneKeys`).
 * - "Oggi": the due date is today. A missed day is NOT recovered (the Monday digest lists it as
 *   "da recuperare").
 * - Audience by assignee; users with the reminder switch off are skipped (AC52). A partner only
 *   gets "tra 7 giorni" reminders whose window opened on or after the day they joined (D44).
 * - Users without anything to remind are left out.
 */
export function planReminders(input: PlanRemindersInput): UserReminderPlan[] {
  const { today, provisional } = input;
  const plans: UserReminderPlan[] = [];
  const active = input.tasks.filter(
    (t) => t.status === "todo" && t.deletedAt === null && t.dueDate !== null && t.remindersEnabled,
  );

  for (const recipient of input.recipients) {
    if (!recipient.remindersEnabled) continue;
    const done = input.doneKeys?.get(recipient.userId);
    const sevenDays: PlannedTask[] = [];
    const dueToday: PlannedTask[] = [];

    for (const task of active) {
      if (!audienceIncludes(task.assignee, recipient.slot)) continue;
      const due = task.dueDate!;
      const planned: PlannedTask = { id: task.id, title: task.title, dueDate: due, provisional };
      const distance = diffDays(today, due);
      if (distance === 0) {
        if (!done?.has(dueTodayKey(task.id, due))) dueToday.push(planned);
      } else if (distance >= 1 && distance <= REMINDER_WINDOW_DAYS) {
        const windowOpened = addDays(due, -REMINDER_WINDOW_DAYS);
        const changedOn = input.dueChangedOn?.get(task.id);
        const changedInsideWindow =
          changedOn !== undefined && comparePlainDates(changedOn, windowOpened) >= 0;
        // D44: a window that opened before the user joined is not made up at entry.
        const beforeJoining =
          recipient.joinedOn !== undefined &&
          comparePlainDates(windowOpened, recipient.joinedOn) < 0;
        if (!changedInsideWindow && !beforeJoining && !done?.has(sevenDayKey(task.id, due))) {
          sevenDays.push(planned);
        }
      }
    }

    if (sevenDays.length + dueToday.length === 0) continue;
    sevenDays.sort(byDueThenTitle);
    dueToday.sort(byDueThenTitle);
    const itemKeys = [
      ...sevenDays.map((t) => sevenDayKey(t.id, t.dueDate)),
      ...dueToday.map((t) => dueTodayKey(t.id, t.dueDate)),
    ].slice(0, MAX_ITEM_KEYS);
    plans.push({ userId: recipient.userId, sevenDays, today: dueToday, itemKeys });
  }
  return plans;
}
