import { CATEGORY_LABELS } from "@/content/milestones/categories";
import { MILESTONE_CATEGORIES, type MilestoneCategory } from "@/content/milestones/types";

/** Budget category keys = the task categories minus the task-only `organizzazione` (AC34). */
export type BudgetCategoryKey = Exclude<MilestoneCategory, "organizzazione">;

export const BUDGET_CATEGORY_KEYS: readonly BudgetCategoryKey[] = MILESTONE_CATEGORIES.filter(
  (key): key is BudgetCategoryKey => key !== "organizzazione",
);

export interface DefaultBudgetCategory {
  readonly key: BudgetCategoryKey;
  /** Initial Italian name (renamable by the couple). Labels come from the single source of truth. */
  readonly name: string;
  readonly sortOrder: number;
}

/** The 11 predefined categories of AC34, in display order. */
export const DEFAULT_BUDGET_CATEGORIES: readonly DefaultBudgetCategory[] = BUDGET_CATEGORY_KEYS.map(
  (key, index) => ({ key, name: CATEGORY_LABELS[key], sortOrder: index }),
);
