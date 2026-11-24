import type { PlainDate } from "@/lib/dates/plain-date";
import type { MilestoneCategory } from "@/content/milestones/types";

export type TaskStatus = "todo" | "done";

/**
 * Minimal task shape the Percorso engine needs. Callers map DB rows (T8) to it; the engine never
 * touches the DB. Priority and "highlight first" of generated tasks come from the catalogue via
 * `templateKey`.
 */
export interface TimelineTask {
  readonly id: string;
  readonly title: string;
  readonly status: TaskStatus;
  readonly dueDate: PlainDate | null;
  /** The user changed `due_date` by hand: recalculation must leave it alone (AC28). */
  readonly dueOverridden: boolean;
  readonly source: "template" | "user";
  readonly templateKey: string | null;
  readonly templateVersion: number | null;
  readonly category: MilestoneCategory | string | null;
  /** Logical deletion: the task is hidden everywhere but still counts for "never re-suggest". */
  readonly deleted: boolean;
}
