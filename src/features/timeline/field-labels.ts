import type { FieldLabels } from "@/components/ConflictDialog";
import { formatShortDate } from "@/components/format";
import { CATEGORY_LABELS } from "@/content/milestones/categories";
import type { MilestoneCategory } from "@/content/milestones/types";
import { isPlainDate } from "@/lib/dates/plain-date";
import { assigneeName, type Assignee, type PartnerView, type TaskView } from "./model";

/** Fields of a task as the form and the conflict dialog know them (design §4.1, DES-29). */
export type TaskFields = {
  readonly title: string;
  readonly dueDate: string | null;
  readonly category: string | null;
  readonly notes: string | null;
  readonly assignee: Assignee;
  readonly remindersEnabled: boolean;
  readonly status: "todo" | "done";
};

/** Field name to Italian label; the order is the order of the rows in the conflict table. */
export const TASK_FIELD_LABELS: FieldLabels = {
  title: "Titolo",
  dueDate: "Scadenza",
  assignee: "Chi se ne occupa",
  category: "Categoria",
  notes: "Note",
  remindersEnabled: "Promemoria per email",
  status: "Stato",
};

export function taskToFields(task: TaskView): TaskFields {
  return {
    title: task.title,
    dueDate: task.dueDate,
    category: task.category,
    notes: task.notes,
    assignee: task.assignee,
    remindersEnabled: task.remindersEnabled,
    status: task.status,
  };
}

/** Value formatter for `ConflictDialog` (dates, partner names, category labels). */
export function taskFieldFormatter(partners: readonly PartnerView[]) {
  return (field: string, value: unknown): string => {
    if (value === null || value === undefined || value === "") return "—";
    switch (field) {
      case "dueDate":
        return typeof value === "string" && isPlainDate(value) ? formatShortDate(value) : "—";
      case "assignee":
        return assigneeName(partners, value as Assignee);
      case "category":
        return CATEGORY_LABELS[value as MilestoneCategory] ?? String(value);
      case "remindersEnabled":
        return value ? "Sì" : "No";
      case "status":
        return value === "done" ? "Fatto" : "Da fare";
      default:
        return String(value);
    }
  };
}
