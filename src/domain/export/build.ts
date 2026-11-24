import { CATEGORY_LABELS } from "@/content/milestones/categories";
import { budgetTotals } from "@/domain/budget/totals";
import { todayInRome, type PlainDate } from "@/lib/dates/plain-date";
import { formatCentsPlain } from "@/lib/money";
import { toCsv } from "./csv";
import type { ExportInput } from "./types";

export const EXPORT_SCHEMA_VERSION = 1;

/** Keys that must never appear in an export, at any depth (birth dates, tokens, codes). */
const FORBIDDEN_KEYS = new Set(
  [
    "token_hash",
    "tokenHash",
    "birth_date",
    "birthDate",
    "date_of_birth",
    "dateOfBirth",
    "birthday",
    "password",
    "access_code",
    "accessCode",
    "temp_code",
    "tempCode",
    "code",
  ].map((k) => k.toLowerCase()),
);

/** Deep copy without forbidden keys. */
export function sanitize<T>(value: T): T {
  if (Array.isArray(value)) return value.map(sanitize) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !FORBIDDEN_KEYS.has(key.toLowerCase()))
        .map(([key, v]) => [key, sanitize(v)]),
    ) as T;
  }
  return value;
}

export interface ExportFileNames {
  readonly json: string;
  readonly tasksCsv: string;
  readonly budgetCsv: string;
}

/** Three separate downloads, each with the date in its name (AC42). */
export function exportFileNames(today: PlainDate): ExportFileNames {
  return {
    json: `roadmap2yes-${today}.json`,
    tasksCsv: `roadmap2yes-compiti-${today}.csv`,
    budgetCsv: `roadmap2yes-budget-${today}.csv`,
  };
}

export interface ExportBundle {
  readonly fileNames: ExportFileNames;
  readonly json: string;
  readonly tasksCsv: string;
  readonly budgetCsv: string;
}

const ITEM_STATUS_LABEL = { planned: "Previsto", agreed: "Concordato", cancelled: "Annullata" };
const TASK_STATUS_LABEL = { todo: "Da fare", done: "Fatto" };

function tasksCsv(input: ExportInput): string {
  const rows = input.tasks
    .filter((t) => !t.deleted)
    .map((t) => [
      t.title,
      t.category ? ((CATEGORY_LABELS as Record<string, string>)[t.category] ?? t.category) : "",
      t.dueDate ?? "",
      TASK_STATUS_LABEL[t.status],
      t.assigneeLabel ?? "",
      t.notes ?? "",
    ]);
  return toCsv(["Titolo", "Categoria", "Scadenza", "Stato", "Chi se ne occupa", "Note"], rows);
}

function budgetCsv(input: ExportInput): string {
  const totals = budgetTotals({
    versions: input.budgetVersions,
    categories: input.budgetCategories,
    items: input.budgetItems,
    payments: input.payments,
  });
  const categoryName = new Map(input.budgetCategories.map((c) => [c.id, c.name]));
  const rows = input.budgetItems
    .filter((i) => !i.deleted && categoryName.has(i.categoryId))
    .map((item) => {
      const itemPayments = input.payments.filter((p) => p.itemId === item.id && !p.deleted);
      const paid = itemPayments.filter((p) => p.paid).reduce((s, p) => s + p.amountCents, 0);
      const agreed = item.status === "agreed" ? (item.agreedCents ?? 0) : null;
      return [
        categoryName.get(item.categoryId),
        item.description,
        ITEM_STATUS_LABEL[item.status],
        formatCentsPlain(item.plannedCents),
        agreed === null ? "" : formatCentsPlain(agreed),
        formatCentsPlain(paid),
        agreed === null ? "" : formatCentsPlain(Math.max(0, agreed - paid)),
      ];
    });
  // Assigned amounts per category close the file, after the items.
  const assigned = totals.categories.map((c) => [
    c.name,
    "(assegnato)",
    "",
    "",
    "",
    "",
    c.assigned === null ? "" : formatCentsPlain(c.assigned),
  ]);
  return toCsv(
    ["Categoria", "Voce", "Stato", "Previsto", "Concordato", "Pagato", "Ancora da pagare"],
    [...rows, ...assigned],
  );
}

/** JSON document with every wedding datum (plan §10). `now` only stamps `exportedAt`. */
export function buildExportJson(input: ExportInput, now: Date): string {
  const optionById = new Map(input.decisionOptions.map((o) => [o.id, o]));
  const dateScenarios = input.dateScenarios.map((s) => {
    const location = s.locationOptionId ? optionById.get(s.locationOptionId) : undefined;
    return {
      ...s,
      locationOption: s.locationOptionId
        ? {
            id: s.locationOptionId,
            title: location?.title ?? null,
            status: location?.status ?? null,
            deleted: location?.deleted ?? false,
          }
        : null,
    };
  });
  const doc = {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    wedding: input.wedding,
    partners: input.partners,
    decisions: input.decisions,
    decisionOptions: input.decisionOptions,
    decisionEvents: input.decisionEvents,
    dateScenarios,
    tasks: input.tasks,
    budget: {
      versions: input.budgetVersions,
      categories: input.budgetCategories,
      items: input.budgetItems,
      payments: input.payments,
    },
  };
  return JSON.stringify(sanitize(doc), null, 2);
}

/** The three files of the export, from plain inputs. Pure: `now` comes from the caller. */
export function buildExport(input: ExportInput, now: Date): ExportBundle {
  return {
    fileNames: exportFileNames(todayInRome(now)),
    json: buildExportJson(input, now),
    tasksCsv: tasksCsv(input),
    budgetCsv: budgetCsv(input),
  };
}
