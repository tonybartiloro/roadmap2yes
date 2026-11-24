import type { GeneratedTask } from "./generate";
import { generateTasks } from "./generate";
import type { Rite } from "@/content/milestones/types";
import type { TimelineTask } from "./types";

/** Test helper: turns generated rows into tasks (id = template key). Not exported by the index. */
export function asTasks(
  generated: readonly GeneratedTask[],
  overrides: Partial<Record<string, Partial<TimelineTask>>> = {},
): TimelineTask[] {
  return generated.map((g) => ({
    id: g.templateKey,
    title: g.title,
    status: "todo",
    dueDate: g.dueDate,
    dueOverridden: false,
    source: "template",
    templateKey: g.templateKey,
    templateVersion: g.templateVersion,
    category: g.category,
    deleted: false,
    ...overrides[g.templateKey],
  }));
}

export function tasksFor(rite: Rite, reference: string | null, overrides = {}): TimelineTask[] {
  return asTasks(generateTasks(rite, reference), overrides);
}

export function userTask(id: string, dueDate: string | null, extra: Partial<TimelineTask> = {}): TimelineTask {
  return {
    id,
    title: id,
    status: "todo",
    dueDate,
    dueOverridden: false,
    source: "user",
    templateKey: null,
    templateVersion: null,
    category: null,
    deleted: false,
    ...extra,
  };
}
