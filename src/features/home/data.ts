import type { SupabaseClient } from "@supabase/supabase-js";
import {
  upcomingPayments,
  type BudgetCategory,
  type BudgetItem,
  type ItemStatus,
  type Payment,
  type PaymentKind,
} from "@/domain/budget";
import { lastExport } from "@/domain/export";
import { countdown, type OpenDecision, type PendingPayment } from "@/domain/home";
import {
  buildNews,
  type AccountEventEntry,
  type AccountEventKind,
  type AuditEntry,
  type DecisionEventEntry,
  type DecisionEventKind,
  type NewsItem,
  type NewsPerson,
} from "@/domain/news";
import { resolveReference, type ScenarioInput } from "@/domain/timeline";
import { isPlainDate, type PlainDate } from "@/lib/dates/plain-date";
import { displayName } from "@/lib/display-name";
import type { Database } from "@/lib/supabase/database.types";
import { classifyDbError } from "@/lib/supabase/errors";
import { rowToTask } from "@/features/timeline/model";
import {
  buildSteps,
  needsRegister,
  reconcileVisit,
  visitFromRow,
  type HomeTask,
  type StateRow,
} from "./model";
import type {
  ActionResult,
  HomeData,
  PaymentsData,
  Person,
  ReferenceData,
  Section,
  Slot,
  StepsData,
  VisitState,
} from "./types";

/**
 * Reads of the Home. Everything runs with the USER'S client (RLS is the only authorization); this
 * file imports nothing from Next.js, so the integration tests drive it directly. The only write is
 * `record_seen()` (once per session, see `SESSION_GAP_MS`) and `dismiss_welcome()`.
 */
export type Db = SupabaseClient<Database>;

/** A failed read. `infra` is set for a paused/unreachable service (the root boundary handles it). */
export class HomeLoadError extends Error {
  readonly infra: "paused" | "unreachable" | null;
  constructor(what: string, cause: unknown) {
    super(`Home: ${what}`, { cause });
    this.name = "HomeLoadError";
    this.infra = classifyDbError(cause);
  }
}

type Loaded<D> = { data: D; error: { message: string; code?: string } | null };

function must<D>(result: Loaded<D>, what: string): NonNullable<D> {
  if (result.error) throw new HomeLoadError(what, result.error);
  return (result.data ?? ([] as unknown)) as NonNullable<D>;
}

/** One block of the page: its failure is contained, except an outage that concerns everything. */
async function section<T>(load: () => Promise<T>): Promise<Section<T>> {
  try {
    return { ok: true, data: await load() };
  } catch (error) {
    if (classifyDbError(error)) throw error;
    return { ok: false };
  }
}

const NEWS_LIMIT = 5;
const PAYMENT_WINDOW_DAYS = 14;
const PAYMENT_LIMIT = 5;
const STATE_COLUMNS = "last_seen_at, previous_seen_at, last_export_at, welcome_dismissed_at";

// ---------------------------------------------------------------------------------------------
// Visit
// ---------------------------------------------------------------------------------------------

function strOrNull(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}

/** The `record_seen()` answer, validated (it is `jsonb`). */
function parseStateRow(value: unknown): StateRow | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const last = strOrNull(v["last_seen_at"]);
  const previous = strOrNull(v["previous_seen_at"]);
  const exported = strOrNull(v["last_export_at"]);
  const welcome = strOrNull(v["welcome_dismissed_at"]);
  if (
    last === undefined ||
    previous === undefined ||
    exported === undefined ||
    welcome === undefined
  )
    return null;
  return {
    last_seen_at: last,
    previous_seen_at: previous,
    last_export_at: exported,
    welcome_dismissed_at: welcome,
  };
}

/**
 * Registers this visit and returns the state to show. "Novità" are the changes after
 * `previous_seen_at`, so a reload (same session) must not call `record_seen()` again: that would
 * move the news out of reach before they were read. `nowMs` is the REAL time (the database stamps
 * real time, the injectable clock only drives calendar dates).
 */
export async function registerVisit(db: Db, userId: string, nowMs: number): Promise<VisitState> {
  const read = await db
    .from("user_wedding_state")
    .select(STATE_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();
  if (read.error) throw new HomeLoadError("stato", read.error);
  const before = read.data;
  if (!needsRegister(before, nowMs)) return visitFromRow(before);

  const seen = await db.rpc("record_seen");
  if (seen.error) {
    if (classifyDbError(seen.error)) throw new HomeLoadError("record_seen", seen.error);
    // Not being able to register must not take the Home down: show it with what is stored.
    console.error("home.registerVisit: record_seen failed", { code: seen.error.code });
    return visitFromRow(before);
  }
  const after = parseStateRow(seen.data);
  return after ? reconcileVisit(before, after) : visitFromRow(before);
}

const UNREACHABLE = "Non riesco a raggiungere il servizio. Controlla la connessione e riprova.";
const PAUSED = "L'app è in pausa: riprova più tardi.";
const GENERIC = "Non sono riuscito a salvare. Riprova tra un attimo.";

/** "Ho capito" on the welcome card. Only fixed messages leave this function (allowlist). */
export async function dismissWelcome(db: Db): Promise<ActionResult> {
  const { error } = await db.rpc("dismiss_welcome");
  if (!error) return { ok: true };
  const infra = classifyDbError(error);
  if (infra === "paused") return { ok: false, code: "unreachable", message: PAUSED };
  if (infra === "unreachable") return { ok: false, code: "unreachable", message: UNREACHABLE };
  return { ok: false, code: error.code === "42501" ? "forbidden" : "unknown", message: GENERIC };
}

// ---------------------------------------------------------------------------------------------
// Shared facts (read once, used by several sections)
// ---------------------------------------------------------------------------------------------

interface DecisionFacts {
  readonly decisions: readonly { id: string; key: string; status: string }[];
  readonly options: readonly { id: string; decision_id: string; title: string; status: string }[];
  readonly scenarios: readonly {
    option_id: string;
    date_from: string;
    location_option_id: string | null;
  }[];
  readonly referenceEvents: readonly { option_id: string | null; actor_id: string | null }[];
}

async function loadDecisionFacts(db: Db): Promise<DecisionFacts> {
  const [decisions, options, scenarios] = await Promise.all([
    db.from("decisions").select("id, key, status"),
    db.from("decision_options").select("id, decision_id, title, status").is("deleted_at", null),
    db.from("date_scenarios").select("option_id, date_from, location_option_id"),
  ]);
  const decisionRows = must(decisions, "decisioni");
  const dateDecision = decisionRows.find((d) => d.key === "date");
  const referenceEvents = dateDecision
    ? must(
        await db
          .from("decision_events")
          .select("option_id, actor_id")
          .eq("decision_id", dateDecision.id)
          .eq("kind", "reference_set")
          .order("at", { ascending: false })
          .order("id", { ascending: false })
          .limit(20),
        "storico del riferimento",
      )
    : [];
  return {
    decisions: decisionRows,
    options: must(options, "opzioni"),
    scenarios: must(scenarios, "date"),
    referenceEvents,
  };
}

interface BudgetFacts {
  readonly budgetDefined: boolean;
  readonly categories: BudgetCategory[];
  readonly items: BudgetItem[];
  readonly payments: Payment[];
}

const ITEM_STATUSES: readonly string[] = ["planned", "agreed", "cancelled"];
const PAYMENT_KINDS: readonly string[] = ["deposit", "balance", "other"];

async function loadBudgetFacts(db: Db): Promise<BudgetFacts> {
  const [versions, categories, items, payments] = await Promise.all([
    db
      .from("budget_versions")
      .select("id")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1),
    db.from("budget_categories").select("id, name, assigned_cents, deleted_at"),
    db
      .from("budget_items")
      .select("id, category_id, description, status, planned_cents, agreed_cents, deleted_at"),
    db
      .from("payments")
      .select("id, item_id, kind, amount_cents, due_date, paid, paid_on, deleted_at"),
  ]);
  return {
    budgetDefined: must(versions, "budget").length > 0,
    categories: must(categories, "categorie").map((c) => ({
      id: c.id,
      name: c.name,
      assignedCents: c.assigned_cents,
      deleted: c.deleted_at !== null,
    })),
    items: must(items, "voci").map((i) => ({
      id: i.id,
      categoryId: i.category_id,
      description: i.description,
      status: (ITEM_STATUSES.includes(i.status) ? i.status : "planned") as ItemStatus,
      plannedCents: i.planned_cents,
      agreedCents: i.agreed_cents,
      deleted: i.deleted_at !== null,
    })),
    payments: must(payments, "pagamenti").map((p) => ({
      id: p.id,
      itemId: p.item_id,
      kind: (PAYMENT_KINDS.includes(p.kind) ? p.kind : "other") as PaymentKind,
      amountCents: p.amount_cents,
      dueDate: p.due_date && isPlainDate(p.due_date) ? p.due_date : null,
      paid: p.paid,
      paidOn: p.paid_on && isPlainDate(p.paid_on) ? p.paid_on : null,
      deleted: p.deleted_at !== null,
    })),
  };
}

// ---------------------------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------------------------

const nameParts = (p: Person | undefined) =>
  p ? { firstName: p.firstName, lastName: p.lastName, label: p.label } : null;

function referenceSection(
  facts: DecisionFacts,
  manualReferenceId: string | null,
  people: readonly Person[],
  today: PlainDate,
): ReferenceData {
  const dateDecision = facts.decisions.find((d) => d.key === "date");
  const optionById = new Map(facts.options.map((o) => [o.id, o]));
  const rows = facts.scenarios.flatMap((s) => {
    const option = optionById.get(s.option_id);
    if (!option || !dateDecision || option.decision_id !== dateDecision.id) return [];
    if (!isPlainDate(s.date_from)) return [];
    return [{ scenario: s, option }];
  });
  const scenarios: ScenarioInput[] = rows.map(({ scenario, option }) => ({
    id: scenario.option_id,
    dateFrom: scenario.date_from,
    state: option.status === "chosen" || option.status === "discarded" ? option.status : "open",
  }));
  const resolved = resolveReference({ scenarios, manualReferenceId, today });

  let setBy: string | null = null;
  let locationName: string | null = null;
  if (resolved) {
    if (resolved.source === "manual") {
      const event = facts.referenceEvents.find((e) => e.option_id === resolved.scenarioId);
      const actor = people.find((p) => p.userId !== null && p.userId === event?.actor_id);
      setBy = actor ? displayName(nameParts(actor)) : null;
    }
    const linked = rows.find((r) => r.scenario.option_id === resolved.scenarioId)?.scenario
      .location_option_id;
    locationName = (linked && optionById.get(linked)?.title) || null;
  }
  return { value: countdown(resolved, today), setBy, locationName };
}

async function stepsSection(
  db: Db,
  facts: DecisionFacts,
  budget: BudgetFacts,
  mySlot: Slot | null,
  today: PlainDate,
): Promise<StepsData> {
  const openDecisions: OpenDecision[] = facts.decisions.flatMap((d): OpenDecision[] => {
    if (d.status !== "open") return [];
    if (d.key === "date") return [{ id: d.id, kind: "date", title: "Scegli la data" }];
    if (d.key === "location") return [{ id: d.id, kind: "location", title: "Scegli la location" }];
    return [];
  });
  const tasks: HomeTask[] = must(
    await db.from("tasks").select("*").is("deleted_at", null),
    "compiti",
  ).map(rowToTask);
  const payments: PendingPayment[] = upcomingPayments(budget, today).map((p) => ({
    id: p.paymentId,
    title: p.itemDescription,
    dueDate: p.dueDate,
  }));
  return buildSteps({ openDecisions, tasks, payments, mySlot, today });
}

const ACCOUNT_KINDS: readonly string[] = [
  "partner_account_created",
  "temp_code_set",
  "code_changed",
  "email_changed",
  "invite_revoked",
];
const DECISION_KINDS: readonly string[] = [
  "option_added",
  "option_updated",
  "option_removed",
  "chosen",
  "reopened",
  "note",
  "reference_set",
  "reference_auto",
];
const AUDIT_TABLES = ["tasks", "budget_versions", "payments"];
const AUDIT_FETCH = 200;
const EVENT_FETCH = 100;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

async function newsSection(
  db: Db,
  facts: DecisionFacts,
  people: readonly Person[],
  userId: string,
  since: string,
): Promise<NewsItem[]> {
  const [audit, accounts, events] = await Promise.all([
    db
      .from("audit_log")
      .select("id, at, actor_id, table_name, op, old_data, new_data")
      .in("table_name", AUDIT_TABLES)
      .gt("at", since)
      .order("at", { ascending: false })
      .limit(AUDIT_FETCH),
    db
      .from("account_events")
      .select("id, at, kind, actor_id, target_user_id")
      .gt("at", since)
      .order("at", { ascending: false })
      .limit(EVENT_FETCH),
    db
      .from("decision_events")
      .select("id, at, kind, actor_id, decision_id, option_id, payload")
      .gt("at", since)
      .order("at", { ascending: false })
      .limit(EVENT_FETCH),
  ]);

  const keyOf = new Map(facts.decisions.map((d) => [d.id, d.key]));
  const titleOf = new Map(facts.options.map((o) => [o.id, o.title]));

  const auditEntries: AuditEntry[] = must(audit, "novità").flatMap((r) =>
    r.op === "INSERT" || r.op === "UPDATE" || r.op === "DELETE"
      ? [
          {
            id: r.id,
            at: r.at,
            actorId: r.actor_id,
            tableName: r.table_name,
            op: r.op,
            oldData: asRecord(r.old_data),
            newData: asRecord(r.new_data),
          },
        ]
      : [],
  );
  const accountEntries: AccountEventEntry[] = must(accounts, "novità account").flatMap((r) =>
    ACCOUNT_KINDS.includes(r.kind)
      ? [
          {
            id: r.id,
            at: r.at,
            kind: r.kind as AccountEventKind,
            actorId: r.actor_id,
            targetUserId: r.target_user_id,
          },
        ]
      : [],
  );
  const decisionEntries: DecisionEventEntry[] = must(events, "novità scelte").flatMap((r) => {
    if (!DECISION_KINDS.includes(r.kind)) return [];
    const payload = asRecord(r.payload) ?? {};
    const title = typeof payload["title"] === "string" ? payload["title"] : null;
    const reference = payload["reference_date"];
    return [
      {
        id: r.id,
        at: r.at,
        kind: r.kind as DecisionEventKind,
        actorId: r.actor_id,
        decisionKey: keyOf.get(r.decision_id) ?? "",
        optionTitle: title ?? (r.option_id ? (titleOf.get(r.option_id) ?? null) : null),
        referenceDate: typeof reference === "string" && isPlainDate(reference) ? reference : null,
      },
    ];
  });

  const newsPeople: NewsPerson[] = people.flatMap((p) =>
    p.userId
      ? [{ userId: p.userId, firstName: p.firstName, lastName: p.lastName, label: p.label }]
      : [],
  );
  return buildNews({
    viewerId: userId,
    since,
    audit: auditEntries,
    accountEvents: accountEntries,
    decisionEvents: decisionEntries,
    people: newsPeople,
    limit: NEWS_LIMIT,
  });
}

async function paymentsSection(budget: BudgetFacts, today: PlainDate): Promise<PaymentsData> {
  return {
    upcoming: upcomingPayments(budget, today, {
      withinDays: PAYMENT_WINDOW_DAYS,
      limit: PAYMENT_LIMIT,
    }),
    budgetDefined: budget.budgetDefined,
  };
}

// ---------------------------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------------------------

export interface LoadHomeOptions {
  /** Calendar date in Europe/Rome (from the injectable clock). */
  readonly today: PlainDate;
  /** Real time in ms, to tell a new session from a reload. Defaults to `Date.now()`. */
  readonly nowMs?: number;
}

/**
 * Everything the Home shows, as the signed-in user sees it. `null` = no wedding yet. A failing
 * block becomes `{ ok: false }` (the page keeps the rest); an outage or the basics failing throw.
 */
export async function loadHomeData(
  db: Db,
  userId: string,
  options: LoadHomeOptions,
): Promise<HomeData | null> {
  const { today } = options;
  const wedding = await db.from("weddings").select("id, manual_reference_option_id").maybeSingle();
  if (wedding.error) throw new HomeLoadError("nozze", wedding.error);
  if (!wedding.data) return null;

  const [partnerRows, visit] = await Promise.all([
    db.from("wedding_partners").select("user_id, first_name, last_name, label, slot"),
    registerVisit(db, userId, options.nowMs ?? Date.now()),
  ]);
  const people: Person[] = must(partnerRows, "partner").map((p) => ({
    userId: p.user_id,
    slot: p.slot === "B" ? "B" : "A",
    firstName: p.first_name,
    lastName: p.last_name,
    label: p.label,
  }));
  const me = people.find((p) => p.userId === userId);
  const partner = people.find((p) => p !== me);
  const mySlot = me?.slot ?? null;

  // Read once, awaited by every block that needs them; each block handles its own failure.
  const facts = loadDecisionFacts(db);
  const budget = loadBudgetFacts(db);
  facts.catch(() => undefined);
  budget.catch(() => undefined);

  const manualReferenceId = wedding.data.manual_reference_option_id;
  const [reference, steps, payments, news] = await Promise.all([
    section(async () => referenceSection(await facts, manualReferenceId, people, today)),
    section(async () => stepsSection(db, await facts, await budget, mySlot, today)),
    section(async () => paymentsSection(await budget, today)),
    section(async () =>
      visit.previousSeenAt === null
        ? null
        : newsSection(db, await facts, people, userId, visit.previousSeenAt),
    ),
  ]);

  return {
    userId,
    mySlot,
    myName: displayName(nameParts(me), ""),
    partnerName: displayName(nameParts(partner)),
    today,
    visit,
    reference,
    steps,
    payments,
    news,
    lastExport: lastExport(visit.lastExportAt, today),
  };
}
