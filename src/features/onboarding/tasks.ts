import { getMilestone, type Rite } from "@/content/milestones";
import { generateTasks } from "@/domain/timeline";

/** Element of the `complete_onboarding(p_tasks)` / `insert_template_tasks` payload. */
export type TaskPayload = {
  template_key: string;
  template_version: number;
  title: string;
  advice: string;
  category: string;
  offset: { months?: number; weeks?: number; days?: number } | null;
};

/**
 * The initial Percorso for a rite (AC14, AC63). The database computes the due dates from its own
 * reference, so only the milestone and its offset go over the wire (never a date computed here).
 * Kept apart from `model.ts` so the milestone catalogue stays out of the browser bundle.
 */
export function buildTaskPayload(rite: Rite | null): TaskPayload[] {
  return generateTasks(rite ?? "unknown", null).map((task) => {
    const offset = getMilestone(task.templateKey)?.offset ?? null;
    return {
      template_key: task.templateKey,
      template_version: task.templateVersion,
      title: task.title,
      advice: task.advice,
      category: task.category,
      offset: offset ? { ...offset } : null,
    };
  });
}
