import { getMilestone, milestonesForRite } from "@/content/milestones";
import type { Milestone, Rite } from "@/content/milestones/types";
import type { TimelineTask } from "./types";

/**
 * A suggestion the couple dismissed ("Ignora"): never shown again (AC16, AC48). Deliberately NOT
 * scoped to a rite: it survives rite round-trips (civile → simbolico → civile), following the
 * PO's intent "never re-suggest what the couple dismissed".
 */
export interface SuggestionDismissal {
  readonly templateKey: string;
  readonly kind: "add" | "remove";
}

export interface SuggestionDiff {
  /** New milestones that apply to the rite: "accetta nuova" → `insert_template_tasks`. */
  readonly additions: readonly Milestone[];
  /** Tasks no longer relevant: "accetta" → logical deletion. */
  readonly removals: readonly TimelineTask[];
}

/**
 * "Suggerimenti da rivedere" after the rite changes (AC16, AC48, AC63). Nothing is applied here.
 * - additions: milestones of the rite with no task at all (deleted ones included: BR6, a task the
 *   user deleted is never re-suggested) and not dismissed;
 * - removals: generated, open (not completed), not deleted tasks whose milestone is not part of the
 *   rite, not dismissed. Completed tasks are never touched.
 */
export function diffSuggestions(
  rite: Rite,
  tasks: readonly TimelineTask[],
  dismissals: readonly SuggestionDismissal[],
): SuggestionDiff {
  const existing = new Set(
    tasks.filter((t) => t.source === "template" && t.templateKey).map((t) => t.templateKey!),
  );
  const dismissed = (kind: "add" | "remove") =>
    new Set(dismissals.filter((d) => d.kind === kind).map((d) => d.templateKey));
  const dismissedAdd = dismissed("add");
  const dismissedRemove = dismissed("remove");

  const wanted = milestonesForRite(rite);
  const wantedKeys = new Set(wanted.map((m) => m.key));

  const additions = wanted.filter((m) => !existing.has(m.key) && !dismissedAdd.has(m.key));
  const removals = tasks.filter(
    (t) =>
      t.source === "template" &&
      t.templateKey !== null &&
      !t.deleted &&
      t.status === "todo" &&
      getMilestone(t.templateKey) !== undefined &&
      !wantedKeys.has(t.templateKey) &&
      !dismissedRemove.has(t.templateKey),
  );
  return { additions, removals };
}
