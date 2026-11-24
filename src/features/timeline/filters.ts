import { diffDays, type PlainDate } from "@/lib/dates/plain-date";
import { ADESSO_WINDOW_DAYS } from "@/domain/timeline";
import type { Slot, TaskView } from "./model";

/**
 * Percorso filters (AC30): status, category, assignee, due date. The assignee has a one-tap
 * shortcut ("Miei / di {partner} / Tutti"): the same field. "Miei" = mine + Entrambi, "di
 * {partner}" = theirs + Entrambi, like Home (design §3.3).
 */
export type StatusFilter = "all" | "todo" | "done";
export type AssigneeFilter = "all" | "mine" | "partner";
export type DueFilter = "all" | "overdue" | "next30" | "later" | "none";

export interface Filters {
  readonly status: StatusFilter;
  readonly category: string; // "all" or a category id
  readonly assignee: AssigneeFilter;
  readonly due: DueFilter;
}

export const DEFAULT_FILTERS: Filters = {
  status: "all",
  category: "all",
  assignee: "all",
  due: "all",
};

/** Number shown on the "Filtri" button: filters that differ from the default. */
export function countActiveFilters(filters: Filters): number {
  return (
    Number(filters.status !== "all") +
    Number(filters.category !== "all") +
    Number(filters.assignee !== "all") +
    Number(filters.due !== "all")
  );
}

function matchesAssignee(task: TaskView, filter: AssigneeFilter, mySlot: Slot | null): boolean {
  if (filter === "all" || task.assignee === "both") return true;
  if (!mySlot) return true;
  return filter === "mine" ? task.assignee === mySlot : task.assignee !== mySlot;
}

function matchesDue(due: PlainDate | null, filter: DueFilter, today: PlainDate): boolean {
  if (filter === "all") return true;
  if (filter === "none") return due === null;
  if (due === null) return false;
  const days = diffDays(today, due);
  if (filter === "overdue") return days < 0;
  if (filter === "next30") return days >= 0 && days <= ADESSO_WINDOW_DAYS;
  return days > ADESSO_WINDOW_DAYS;
}

/** Applies the filters to the tasks as they are displayed (`dueDate` = date shown, preview included). */
export function applyFilters(
  tasks: readonly TaskView[],
  filters: Filters,
  context: { mySlot: Slot | null; today: PlainDate },
): TaskView[] {
  return tasks.filter(
    (task) =>
      (filters.status === "all" || task.status === filters.status) &&
      (filters.category === "all" || task.category === filters.category) &&
      matchesAssignee(task, filters.assignee, context.mySlot) &&
      matchesDue(task.dueDate, filters.due, context.today),
  );
}
