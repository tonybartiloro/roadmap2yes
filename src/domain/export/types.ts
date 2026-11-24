import type { PlainDate } from "@/lib/dates/plain-date";
import type { BudgetCategory, BudgetItem, BudgetVersion, Payment } from "@/domain/budget/types";

type Row = Readonly<Record<string, unknown>>;

export interface ExportTask {
  readonly id: string;
  readonly title: string;
  readonly notes?: string | null;
  readonly category?: string | null;
  readonly dueDate: PlainDate | null;
  readonly status: "todo" | "done";
  /** Display name of the assignee, or "Entrambi". */
  readonly assigneeLabel?: string | null;
  readonly source?: "template" | "user";
  readonly deleted?: boolean;
}

export interface ExportDateScenario {
  readonly id: string;
  readonly optionId: string;
  readonly kind: "fixed" | "period";
  readonly dateFrom: PlainDate;
  readonly dateTo: PlainDate | null;
  /** The location option this date is linked to (Q7, AC60). */
  readonly locationOptionId: string | null;
}

export interface ExportOption {
  readonly id: string;
  readonly title: string;
  readonly deleted?: boolean;
  readonly status?: string;
}

/**
 * Everything the export needs, already read through RLS by the client (plan §10). Rows that are
 * exported as they are (`Row`) are sanitised: secrets and birth dates never get out.
 */
export interface ExportInput {
  readonly wedding: Row;
  readonly partners: readonly Row[];
  readonly decisions: readonly Row[];
  readonly decisionOptions: readonly ExportOption[];
  readonly decisionEvents: readonly Row[];
  readonly dateScenarios: readonly ExportDateScenario[];
  readonly tasks: readonly ExportTask[];
  readonly budgetVersions: readonly BudgetVersion[];
  readonly budgetCategories: readonly BudgetCategory[];
  readonly budgetItems: readonly BudgetItem[];
  readonly payments: readonly Payment[];
}
