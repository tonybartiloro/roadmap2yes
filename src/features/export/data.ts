import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildExport,
  lastExport,
  type LastExport,
  type ExportBundle,
  type ExportDateScenario,
  type ExportInput,
  type ExportOption,
  type ExportTask,
} from "@/domain/export";
import type {
  BudgetCategory,
  BudgetItem,
  BudgetVersion,
  ItemStatus,
  Payment,
  PaymentKind,
} from "@/domain/budget";
import { isPlainDate, type PlainDate } from "@/lib/dates/plain-date";
import { displayName } from "@/lib/display-name";
import type { Database } from "@/lib/supabase/database.types";
import { classifyDbError } from "@/lib/supabase/errors";

/**
 * Reads everything the wedding has, as the signed-in user sees it (RLS is the only authorization),
 * and hands it to the pure `buildExport`. Columns are listed on purpose: nothing secret is ever
 * selected (no `invitations`, no user ids of accounts), and `buildExport` strips forbidden keys
 * again. Nothing here imports Next.js, so the integration tests drive it directly.
 */
export type Db = SupabaseClient<Database>;

/** A failed read of the export. `infra` is set for a paused/unreachable service. */
export class ExportLoadError extends Error {
  readonly infra: "paused" | "unreachable" | null;
  constructor(what: string, cause: unknown) {
    super(`Esportazione: ${what}`, { cause });
    this.name = "ExportLoadError";
    this.infra = classifyDbError(cause);
  }
}

type Page<T> = { data: T[] | null; error: { message: string; code?: string } | null };

const PAGE_SIZE = 500; // below the API's `max_rows` (1000)

/** Reads a table page by page (ordered by a unique key in `page`), so no row is cut by the API cap. */
async function allRows<T>(
  what: string,
  page: (from: number, to: number) => PromiseLike<Page<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const result = await page(from, from + PAGE_SIZE - 1);
    if (result.error) throw new ExportLoadError(what, result.error);
    const batch = result.data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }
}

const ITEM_STATUSES: readonly string[] = ["planned", "agreed", "cancelled"];
const PAYMENT_KINDS: readonly string[] = ["deposit", "balance", "other"];

const WEDDING_COLUMNS =
  "id, rite, guest_band, style_label, style_note, region, comune, theme_id, onboarding_answers, onboarding_unknown, onboarding_completed_at, manual_reference_option_id, applied_reference_date, created_at, updated_at";

/** Everything of the wedding, mapped to the plain shapes of `domain/export`. */
export async function gatherExportInput(db: Db): Promise<ExportInput> {
  const weddingResult = await db.from("weddings").select(WEDDING_COLUMNS).limit(1).maybeSingle();
  if (weddingResult.error) throw new ExportLoadError("nozze", weddingResult.error);
  if (!weddingResult.data) throw new ExportLoadError("nozze", { message: "wedding not visible" });
  const wedding = weddingResult.data;

  const [
    partners,
    decisions,
    options,
    events,
    scenarios,
    tasks,
    versions,
    categories,
    items,
    payments,
  ] = await Promise.all([
    allRows("partner", (from, to) =>
      db
        .from("wedding_partners")
        .select("id, slot, label, first_name, last_name, email, created_at")
        .order("slot")
        .range(from, to),
    ),
    allRows("scelte", (from, to) =>
      db
        .from("decisions")
        .select("id, key, type, question, status, chosen_option_id, chosen_at, created_at")
        .order("key")
        .range(from, to),
    ),
    allRows("opzioni", (from, to) =>
      db
        .from("decision_options")
        .select(
          "id, decision_id, title, comune, link, notes, pros, cons, cost_cents, status, deleted_at, created_at, updated_at",
        )
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
    allRows("storico delle scelte", (from, to) =>
      db
        .from("decision_events")
        .select("id, decision_id, kind, option_id, reason, payload, actor_id, at")
        .order("id")
        .range(from, to),
    ),
    allRows("date", (from, to) =>
      db
        .from("date_scenarios")
        .select("id, option_id, kind, date_from, date_to, location_option_id")
        .order("id")
        .range(from, to),
    ),
    allRows("compiti", (from, to) =>
      db
        .from("tasks")
        .select(
          "id, title, notes, advice, category, due_date, status, assignee, reminders_enabled, source, template_key, completed_at, deleted_at, created_at, updated_at",
        )
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
    allRows("storico del budget", (from, to) =>
      db
        .from("budget_versions")
        .select("id, total_cents, reason, created_at")
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
    allRows("categorie", (from, to) =>
      db
        .from("budget_categories")
        .select("id, name, assigned_cents, sort_order, deleted_at")
        .order("sort_order")
        .order("id")
        .range(from, to),
    ),
    allRows("voci", (from, to) =>
      db
        .from("budget_items")
        .select("id, category_id, description, status, planned_cents, agreed_cents, deleted_at")
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
    allRows("pagamenti", (from, to) =>
      db
        .from("payments")
        .select("id, item_id, kind, amount_cents, due_date, paid, paid_on, deleted_at")
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
  ]);

  const nameOfSlot = new Map(
    partners.map((p) => [
      p.slot,
      displayName({ firstName: p.first_name, label: p.label }, `Partner ${p.slot}`),
    ]),
  );
  const assigneeLabel = (assignee: string): string =>
    assignee === "A" || assignee === "B" ? (nameOfSlot.get(assignee) ?? assignee) : "Entrambi";

  const exportTasks: ExportTask[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    notes: t.notes,
    category: t.category,
    dueDate: t.due_date && isPlainDate(t.due_date) ? t.due_date : null,
    status: t.status === "done" ? "done" : "todo",
    assigneeLabel: assigneeLabel(t.assignee),
    source: t.source === "template" ? "template" : "user",
    deleted: t.deleted_at !== null,
    // Extra facts that only the JSON carries.
    ...{
      advice: t.advice,
      remindersEnabled: t.reminders_enabled,
      templateKey: t.template_key,
      completedAt: t.completed_at,
      deletedAt: t.deleted_at,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    },
  }));

  const exportOptions: ExportOption[] = options.map((o) => ({
    id: o.id,
    title: o.title,
    deleted: o.deleted_at !== null,
    status: o.status,
    ...{
      decisionId: o.decision_id,
      comune: o.comune,
      link: o.link,
      notes: o.notes,
      pros: o.pros,
      cons: o.cons,
      costCents: o.cost_cents,
      createdAt: o.created_at,
      updatedAt: o.updated_at,
    },
  }));

  const dateScenarios: ExportDateScenario[] = scenarios.flatMap((s) =>
    isPlainDate(s.date_from)
      ? [
          {
            id: s.id,
            optionId: s.option_id,
            kind: s.kind === "period" ? ("period" as const) : ("fixed" as const),
            dateFrom: s.date_from,
            dateTo: s.date_to && isPlainDate(s.date_to) ? s.date_to : null,
            locationOptionId: s.location_option_id,
          },
        ]
      : [],
  );

  const budgetVersions: BudgetVersion[] = versions.map((v) => ({
    id: v.id,
    totalCents: v.total_cents,
    createdAt: v.created_at,
    reason: v.reason,
  }));
  const budgetCategories: BudgetCategory[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    assignedCents: c.assigned_cents,
    deleted: c.deleted_at !== null,
    sortOrder: c.sort_order,
  }));
  const budgetItems: BudgetItem[] = items.map((i) => ({
    id: i.id,
    categoryId: i.category_id,
    description: i.description,
    status: (ITEM_STATUSES.includes(i.status) ? i.status : "planned") as ItemStatus,
    plannedCents: i.planned_cents,
    agreedCents: i.agreed_cents,
    deleted: i.deleted_at !== null,
  }));
  const budgetPayments: Payment[] = payments.map((p) => ({
    id: p.id,
    itemId: p.item_id,
    kind: (PAYMENT_KINDS.includes(p.kind) ? p.kind : "other") as PaymentKind,
    amountCents: p.amount_cents,
    dueDate: p.due_date && isPlainDate(p.due_date) ? p.due_date : null,
    paid: p.paid,
    paidOn: p.paid_on && isPlainDate(p.paid_on) ? p.paid_on : null,
    deleted: p.deleted_at !== null,
  }));

  return {
    wedding,
    partners,
    decisions,
    decisionOptions: exportOptions,
    decisionEvents: events,
    dateScenarios,
    tasks: exportTasks,
    budgetVersions,
    budgetCategories,
    budgetItems,
    payments: budgetPayments,
  };
}

/** "ultimo export: N giorni fa" for the page, from the caller's own `user_wedding_state`. */
export async function loadLastExport(
  db: Db,
  userId: string,
  today: PlainDate,
): Promise<LastExport> {
  const row = await db
    .from("user_wedding_state")
    .select("last_export_at")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (row.error) throw new ExportLoadError("ultimo export", row.error);
  return lastExport(row.data?.last_export_at ?? null, today);
}

export type PrepareExportResult =
  | { readonly ok: true; readonly bundle: ExportBundle }
  | { readonly ok: false; readonly code: "unreachable" | "unknown"; readonly message: string };

const UNREACHABLE = "Non riesco a raggiungere il servizio. Controlla la connessione e riprova.";
const PAUSED = "L'app è in pausa: riprova più tardi.";
const GENERIC = "Non riesco a preparare il file. Riprova.";

/**
 * Reads, builds the files and records the export (`record_export()`, the date behind "ultimo
 * export"). The date is recorded only once the files exist, so a failed read never counts. `now`
 * stamps `exportedAt` and the file names (Europe/Rome day). Only fixed messages leave here.
 */
export async function prepareExport(db: Db, now: Date): Promise<PrepareExportResult> {
  let bundle: ExportBundle;
  try {
    bundle = buildExport(await gatherExportInput(db), now);
  } catch (error) {
    return failure(error);
  }
  const recorded = await db.rpc("record_export");
  if (recorded.error) {
    // The files are fine and the person asked for them: not recording is only a missing date.
    console.error("export.prepare: record_export failed", { code: recorded.error.code });
  }
  return { ok: true, bundle };
}

function failure(error: unknown): PrepareExportResult {
  const infra = classifyDbError(error instanceof ExportLoadError ? error.cause : error);
  if (infra === "paused") return { ok: false, code: "unreachable", message: PAUSED };
  if (infra === "unreachable") return { ok: false, code: "unreachable", message: UNREACHABLE };
  return { ok: false, code: "unknown", message: GENERIC };
}
