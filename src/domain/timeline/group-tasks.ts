import { addDays, comparePlainDates, diffDays, type PlainDate } from "@/lib/dates/plain-date";
import { getMilestone } from "@/content/milestones";
import type { TimelineTask } from "./types";

/** Design §3.4: first rows shown in "Adesso", then "Mostra tutte (N)". */
export const ADESSO_VISIBLE_ROWS = 5;
/** At most this many overdue "highlight first" milestones go to "Adesso" (AC29). */
export const MAX_OVERDUE_HIGHLIGHTED = 3;
export const ADESSO_WINDOW_DAYS = 30;
export const PROSSIMI_WINDOW_DAYS = 90;

const USER_TASK_PRIORITY = 1000;

export interface GroupedTasks {
  /** (a) up to 3 overdue highlighted + (b) due today..+30 + (c) highlighted without date. */
  readonly adesso: readonly TimelineTask[];
  /** Other overdue open tasks, by model priority. Neutral tone, never hidden. */
  readonly daRecuperare: readonly TimelineTask[];
  /** Due between +31 and +90 days. */
  readonly prossimi3Mesi: readonly TimelineTask[];
  /** Due beyond +90 days or without date (user tasks without date first). */
  readonly piuAvanti: readonly TimelineTask[];
  /** Completed. */
  readonly fatti: readonly TimelineTask[];
  /** Date-dependent generated tasks without a date (no reference, AC15) and deleted ones. */
  readonly hidden: readonly TimelineTask[];
}

function info(task: TimelineTask): {
  priority: number;
  highlight: boolean;
  dateDependent: boolean;
} {
  const m = task.templateKey ? getMilestone(task.templateKey) : undefined;
  return {
    priority: m?.priority ?? USER_TASK_PRIORITY,
    highlight: m?.highlightFirst ?? false,
    dateDependent: m?.offset != null,
  };
}

const byId = (a: TimelineTask, b: TimelineTask) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const byKey = (a: TimelineTask, b: TimelineTask) => {
  const ka = a.templateKey ?? a.id;
  const kb = b.templateKey ?? b.id;
  return ka < kb ? -1 : ka > kb ? 1 : byId(a, b);
};

/** Due ascending, then model priority, then key (stable, deterministic). */
function byDueThenPriority(a: TimelineTask, b: TimelineTask): number {
  return (
    comparePlainDates(a.dueDate ?? "9999-12-31", b.dueDate ?? "9999-12-31") ||
    info(a).priority - info(b).priority ||
    byKey(a, b)
  );
}

/** Priority, then the oldest due date first, then key (spec §1 `priority`). */
function byPriorityThenOldest(a: TimelineTask, b: TimelineTask): number {
  return (
    info(a).priority - info(b).priority ||
    comparePlainDates(a.dueDate ?? "9999-12-31", b.dueDate ?? "9999-12-31") ||
    byKey(a, b)
  );
}

/**
 * Groups the Percorso into phases (AC29, AC30; design §3.4; plan §5). `today` is a calendar date
 * in Europe/Rome; "overdue" means `due < today`. Thresholds: Adesso 0..+30, Prossimi 3 mesi
 * +31..+90, Più avanti beyond.
 */
export function groupTasks(tasks: readonly TimelineTask[], today: PlainDate): GroupedTasks {
  const adessoUndated: TimelineTask[] = [];
  const adessoDated: TimelineTask[] = [];
  const overdueHighlighted: TimelineTask[] = [];
  const daRecuperare: TimelineTask[] = [];
  const prossimi: TimelineTask[] = [];
  const avantiUndated: TimelineTask[] = [];
  const avantiDated: TimelineTask[] = [];
  const fatti: TimelineTask[] = [];
  const hidden: TimelineTask[] = [];

  for (const task of tasks) {
    if (task.deleted) {
      hidden.push(task);
      continue;
    }
    if (task.status === "done") {
      fatti.push(task);
      continue;
    }
    const { highlight, dateDependent } = info(task);
    if (task.dueDate === null) {
      if (dateDependent && task.source === "template") hidden.push(task);
      else if (highlight) adessoUndated.push(task);
      else avantiUndated.push(task);
      continue;
    }
    const days = diffDays(today, task.dueDate);
    if (days < 0) {
      if (highlight) overdueHighlighted.push(task);
      else daRecuperare.push(task);
    } else if (days <= ADESSO_WINDOW_DAYS) adessoDated.push(task);
    else if (days <= PROSSIMI_WINDOW_DAYS) prossimi.push(task);
    else avantiDated.push(task);
  }

  overdueHighlighted.sort(byPriorityThenOldest);
  const promoted = overdueHighlighted.slice(0, MAX_OVERDUE_HIGHLIGHTED);
  daRecuperare.push(...overdueHighlighted.slice(MAX_OVERDUE_HIGHLIGHTED));
  adessoDated.push(...promoted);

  fatti.sort(byKey);
  return {
    // Spec U8: highlighted-without-date first (by priority), then dated by due and priority.
    adesso: [...adessoUndated.sort(byPriorityThenOldest), ...adessoDated.sort(byDueThenPriority)],
    daRecuperare: daRecuperare.sort(byPriorityThenOldest),
    prossimi3Mesi: prossimi.sort(byDueThenPriority),
    piuAvanti: [
      ...avantiUndated.sort(byPriorityThenOldest),
      ...avantiDated.sort(byDueThenPriority),
    ],
    fatti,
    hidden,
  };
}

/** Last day of the "Adesso" window, handy for UI copy and tests. */
export function adessoWindowEnd(today: PlainDate): PlainDate {
  return addDays(today, ADESSO_WINDOW_DAYS);
}
