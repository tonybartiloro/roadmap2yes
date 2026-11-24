import { applyOffset, type PlainDate } from "@/lib/dates/plain-date";
import { getMilestone, milestonesForRite } from "@/content/milestones";
import type { Milestone, Rite } from "@/content/milestones/types";
import type { TimelineTask } from "./types";

/** Date of a milestone for a reference: null when independent of the date or without reference. */
export function dueDateFor(milestone: Milestone, reference: PlainDate | null): PlainDate | null {
  if (!milestone.offset || !reference) return null;
  return applyOffset(reference, milestone.offset);
}

/** `dependsOn: date` of the spec: every milestone with an offset. */
export function dependsOnDate(milestone: Milestone): boolean {
  return milestone.offset !== null;
}

/** Row to insert (`insert_template_tasks`, T8): a copy of the milestone (BR5). */
export interface GeneratedTask {
  readonly templateKey: string;
  readonly templateVersion: number;
  readonly title: string;
  readonly advice: string;
  readonly category: Milestone["category"];
  readonly dueDate: PlainDate | null;
}

export function toGeneratedTask(m: Milestone, reference: PlainDate | null): GeneratedTask {
  return {
    templateKey: m.key,
    templateVersion: m.version,
    title: m.title,
    advice: m.advice,
    category: m.category,
    dueDate: dueDateFor(m, reference),
  };
}

/**
 * Initial Percorso for a rite (AC24, AC25, AC63). Date-dependent tasks get `dueDate: null` when
 * there is no reference (they are then hidden by `groupTasks`, AC15). Rite `unknown` gives the
 * common milestones plus "Scegli il rito".
 */
export function generateTasks(rite: Rite, reference: PlainDate | null): GeneratedTask[] {
  return milestonesForRite(rite).map((m) => toGeneratedTask(m, reference));
}

/** Generated task whose due date follows the reference (AC28): offset, todo, not touched, not deleted. */
export function isRecalculable(task: TimelineTask): boolean {
  if (task.source !== "template" || !task.templateKey) return false;
  if (task.status !== "todo" || task.dueOverridden || task.deleted) return false;
  const m = getMilestone(task.templateKey);
  return m !== undefined && dependsOnDate(m);
}

export interface DueChange {
  readonly taskId: string;
  readonly from: PlainDate | null;
  readonly to: PlainDate | null;
}

/**
 * Recalculation after a reference change (AC28): only generated tasks with an offset, `todo`,
 * not manually overridden and not deleted. Returns just the tasks whose date actually changes.
 * With a null reference the dependent tasks lose their date.
 */
export function recalculateDueDates(
  tasks: readonly TimelineTask[],
  reference: PlainDate | null,
): DueChange[] {
  const changes: DueChange[] = [];
  for (const task of tasks) {
    if (!isRecalculable(task)) continue;
    const to = dueDateFor(getMilestone(task.templateKey!)!, reference);
    if (to !== task.dueDate) changes.push({ taskId: task.id, from: task.dueDate, to });
  }
  return changes;
}

export interface PreviewRow {
  readonly taskId: string;
  /** Date shown in the normal view. */
  readonly current: PlainDate | null;
  /** Date in preview; equal to `current` for tasks the recalculation would not touch. */
  readonly preview: PlainDate | null;
  readonly changed: boolean;
}

export interface PreviewResult {
  readonly rows: PreviewRow[];
  /** "{N} scadenze cambiano rispetto al riferimento" (AC32). */
  readonly changedCount: number;
}

/**
 * Pure preview of another scenario (AC32, DES-28): no writes, nothing persisted. Same eligibility
 * as `recalculateDueDates`; deleted tasks are left out.
 */
export function previewDueDates(
  tasks: readonly TimelineTask[],
  previewReference: PlainDate | null,
): PreviewResult {
  const rows: PreviewRow[] = [];
  for (const task of tasks) {
    if (task.deleted) continue;
    const preview = isRecalculable(task)
      ? dueDateFor(getMilestone(task.templateKey!)!, previewReference)
      : task.dueDate;
    rows.push({
      taskId: task.id,
      current: task.dueDate,
      preview,
      changed: preview !== task.dueDate,
    });
  }
  return { rows, changedCount: rows.filter((r) => r.changed).length };
}
