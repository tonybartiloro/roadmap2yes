import type { Tables } from "@/lib/supabase/database.types";
import type { PlainDate } from "@/lib/dates/plain-date";
import { isPlainDate } from "@/lib/dates/plain-date";
import type { Rite } from "@/content/milestones/types";
import { isRite } from "@/content/milestones";
import type { SuggestionDismissal, TimelineTask } from "@/domain/timeline";
import { displayName } from "@/lib/display-name";

/**
 * Serializable shapes shared by the server loader, the pure view builder and the client screen.
 * Nothing here talks to the database: `queries.ts` maps rows to these, `view.ts` derives the
 * screen from them (so the optimistic client state and the server render use the same code).
 */

export type Assignee = "both" | "A" | "B";
export type Slot = "A" | "B";

export interface TaskView extends TimelineTask {
  readonly notes: string | null;
  readonly advice: string | null;
  readonly assignee: Assignee;
  readonly remindersEnabled: boolean;
  readonly needsReview: boolean;
  readonly version: number;
  readonly updatedAt: string;
  readonly updatedBy: string | null;
  readonly deletedAt: string | null;
  readonly completedAt: string | null;
}

export interface PartnerView {
  readonly slot: Slot;
  /** `displayName`: first name, else label, else "il tuo partner". */
  readonly name: string;
  readonly userId: string | null;
}

/** Option statuses as stored by the DB. T4 calls a `candidate` "open". */
export type OptionStatus = "candidate" | "chosen" | "discarded";

export interface ScenarioRow {
  readonly optionId: string;
  /** Free label of the option ("Mamma Rosa"), may be empty. */
  readonly label: string;
  readonly kind: "fixed" | "period";
  readonly dateFrom: PlainDate;
  readonly dateTo: PlainDate | null;
  readonly locationOptionId: string | null;
  readonly status: OptionStatus;
}

export interface LocationRow {
  readonly id: string;
  readonly title: string;
  readonly status: OptionStatus;
}

export interface DecisionEventRow {
  readonly kind: string;
  readonly optionId: string | null;
  readonly actorId: string | null;
  readonly at: string;
}

export interface PercorsoData {
  readonly weddingId: string;
  readonly userId: string;
  readonly mySlot: Slot | null;
  readonly rite: Rite | null;
  readonly manualReferenceId: string | null;
  readonly partners: readonly PartnerView[];
  /** The 'date' decision, or null while onboarding has not created it. */
  readonly dateDecision: { readonly id: string; readonly status: "open" | "taken" } | null;
  /** Non deleted options of the date decision, with their date. */
  readonly scenarios: readonly ScenarioRow[];
  /** Non deleted options of the location decision (to show the linked location). */
  readonly locations: readonly LocationRow[];
  /** Every task, deleted ones included. */
  readonly tasks: readonly TaskView[];
  readonly dismissals: readonly SuggestionDismissal[];
  /** Latest events of the date decision, newest first. */
  readonly events: readonly DecisionEventRow[];
  /** `user_wedding_state.previous_seen_at` of the current user: start of "the previous session". */
  readonly previousSeenAt: string | null;
}

function asAssignee(value: string): Assignee {
  return value === "A" || value === "B" ? value : "both";
}

export function rowToTask(row: Tables<"tasks">): TaskView {
  return {
    id: row.id,
    title: row.title,
    status: row.status === "done" ? "done" : "todo",
    dueDate: row.due_date && isPlainDate(row.due_date) ? row.due_date : null,
    dueOverridden: row.due_overridden,
    source: row.source === "template" ? "template" : "user",
    templateKey: row.template_key,
    templateVersion: row.template_version,
    category: row.category,
    deleted: row.deleted_at !== null,
    notes: row.notes,
    advice: row.advice,
    assignee: asAssignee(row.assignee),
    remindersEnabled: row.reminders_enabled,
    needsReview: row.needs_review,
    version: row.version,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    deletedAt: row.deleted_at,
    completedAt: row.completed_at,
  };
}

export function rowToPartner(row: Tables<"wedding_partners">): PartnerView {
  return {
    slot: row.slot === "B" ? "B" : "A",
    name: displayName({ firstName: row.first_name, label: row.label }),
    userId: row.user_id,
  };
}

export function parseRite(value: string | null): Rite | null {
  return isRite(value) ? value : null;
}

/** Name of the person behind a user id (null when it is not one of the two partners). */
export function nameOfUser(partners: readonly PartnerView[], userId: string | null): string | null {
  if (!userId) return null;
  return partners.find((p) => p.userId === userId)?.name ?? null;
}

/** "Entrambi", or the partner name for the slot (never the role label alone, design §7.1). */
export function assigneeName(partners: readonly PartnerView[], assignee: Assignee): string {
  if (assignee === "both") return "Entrambi";
  return partners.find((p) => p.slot === assignee)?.name ?? displayName(null);
}

/** Up to two initials of a name, for the assignee chip (text always accompanies it). */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
}
