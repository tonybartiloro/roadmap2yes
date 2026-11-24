import type { SupabaseClient } from "@supabase/supabase-js";
import type { TimelineTask } from "@/domain/timeline";
import type { PlainDate } from "@/lib/dates/plain-date";
import type { Database, Tables } from "@/lib/supabase/database.types";
import { classifyDbError } from "@/lib/supabase/errors";
import { versionedUpdate, VersionedUpdateError } from "@/lib/supabase/versioned-update";
import {
  buildDetailView,
  buildListItems,
  defaultScenarioTitle,
  GENERIC_ERROR,
  mapDbError,
  nameBook,
  type PartnerRow,
} from "./model";
import type {
  ActionResult,
  DecisionDetailView,
  DecisionListItem,
  OptionInput,
  ScenarioInput,
  VersionedResult,
} from "./types";

/**
 * Reads and writes of the Scelte screens. Everything runs with the USER'S client (RLS is the only
 * authorization layer); nothing here imports Next.js, so the integration tests drive it directly.
 */
export type Db = SupabaseClient<Database>;

/** A failed read: rendered by the segment `error.tsx` ("Riprova"), never swallowed. */
export class DecisionsLoadError extends Error {
  readonly infra: "paused" | "unreachable" | null;
  constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = "DecisionsLoadError";
    this.infra = classifyDbError(cause);
  }
}

type Loaded<D> = { data: D; error: { message: string; code?: string } | null };

/** The rows of a read, or a thrown `DecisionsLoadError`. */
function must<D>(result: Loaded<D>, what: string): NonNullable<D> {
  if (result.error) throw new DecisionsLoadError(`Scelte: ${what}`, result.error);
  return result.data as NonNullable<D>;
}

/** The single row of a `maybeSingle` read, `null` when absent. */
function mustMaybe<D>(result: Loaded<D>, what: string): NonNullable<D> | null {
  if (result.error) throw new DecisionsLoadError(`Scelte: ${what}`, result.error);
  return (result.data ?? null) as NonNullable<D> | null;
}

// ---------------------------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------------------------

export async function loadDecisionList(db: Db): Promise<DecisionListItem[]> {
  const decisions = must(await db.from("decisions").select("*"), "decisioni");
  if (decisions.length === 0) return [];
  const ids = decisions.map((d) => d.id);
  const [options, events] = await Promise.all([
    db.from("decision_options").select("id, decision_id, title, deleted_at").in("decision_id", ids),
    db
      .from("decision_events")
      .select("id, decision_id, kind")
      .in("decision_id", ids)
      .in("kind", ["chosen", "reopened"]),
  ]);
  const optionRows = must(options, "opzioni");
  const scenarios = must(
    await db
      .from("date_scenarios")
      .select("option_id, kind, date_from, date_to")
      .in(
        "option_id",
        optionRows.map((o) => o.id),
      ),
    "date",
  );
  return buildListItems({
    decisions,
    options: optionRows,
    scenarios,
    events: must(events, "storico"),
  });
}

function toTimelineTask(row: Tables<"tasks">): TimelineTask {
  return {
    id: row.id,
    title: row.title,
    status: row.status === "done" ? "done" : "todo",
    dueDate: row.due_date,
    dueOverridden: row.due_overridden,
    source: row.source === "template" ? "template" : "user",
    templateKey: row.template_key,
    templateVersion: row.template_version,
    category: row.category,
    deleted: row.deleted_at !== null,
  };
}

/** The decision with its options, history, reactions and, for the date, the reference. `null` if absent. */
export async function loadDecisionDetail(
  db: Db,
  key: string,
  context: { userId: string; today: PlainDate },
): Promise<DecisionDetailView | null> {
  const decision = mustMaybe(
    await db.from("decisions").select("*").eq("key", key).maybeSingle(),
    "decisione",
  );
  if (!decision) return null;
  const isDate = decision.type === "date";

  const [options, events, partners, wedding, locationDecision, tasks] = await Promise.all([
    db.from("decision_options").select("*").eq("decision_id", decision.id),
    db.from("decision_events").select("*").eq("decision_id", decision.id),
    db.from("wedding_partners").select("user_id, first_name, last_name, label, slot"),
    isDate
      ? db
          .from("weddings")
          .select("manual_reference_option_id")
          .eq("id", decision.wedding_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    isDate
      ? db
          .from("decisions")
          .select("id")
          .eq("wedding_id", decision.wedding_id)
          .eq("key", "location")
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    isDate
      ? db.from("tasks").select("*").eq("wedding_id", decision.wedding_id)
      : Promise.resolve({ data: [] as Tables<"tasks">[], error: null }),
  ]);
  const optionRows = must(options, "opzioni");
  const optionIds = optionRows.map((o) => o.id);
  const locationDecisionRow = mustMaybe(locationDecision, "location");

  const [scenarios, reactions, locationOptions] = await Promise.all([
    isDate
      ? db.from("date_scenarios").select("*").in("option_id", optionIds)
      : Promise.resolve({ data: [] as Tables<"date_scenarios">[], error: null }),
    db.from("option_reactions").select("*").in("option_id", optionIds),
    locationDecisionRow
      ? db
          .from("decision_options")
          .select("id, title, status, deleted_at")
          .eq("decision_id", (locationDecisionRow as { id: string }).id)
      : Promise.resolve({
          data: [] as { id: string; title: string; status: string; deleted_at: string | null }[],
          error: null,
        }),
  ]);

  return buildDetailView({
    decision,
    options: optionRows,
    scenarios: must(scenarios, "date"),
    reactions: must(reactions, "reazioni"),
    events: must(events, "storico"),
    partners: must(partners, "partner") as PartnerRow[],
    manualReferenceId:
      (mustMaybe(wedding, "nozze") as { manual_reference_option_id: string | null } | null)
        ?.manual_reference_option_id ?? null,
    locationOptions: must(locationOptions, "location"),
    tasks: must(tasks, "compiti").map(toTimelineTask),
    meUserId: context.userId,
    today: context.today,
  });
}

async function partnerNames(db: Db): Promise<PartnerRow[]> {
  const { data } = await db
    .from("wedding_partners")
    .select("user_id, first_name, last_name, label, slot");
  return (data ?? []) as PartnerRow[];
}

// ---------------------------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------------------------

function infraMessage(error: unknown): string | null {
  const kind = classifyDbError(error);
  if (kind === "paused") return "L'app è in pausa: riprova più tardi.";
  if (kind === "unreachable")
    return "Non riesco a raggiungere il servizio. Controlla la connessione e riprova.";
  return null;
}

function failure(
  error: { code?: string; message?: string } | null,
  partnerName?: string,
): ActionResult<never> {
  const infra = infraMessage(error);
  if (infra) return { ok: false, code: "unreachable", message: infra };
  const mapped = mapDbError(error, partnerName);
  return { ok: false, code: mapped.code, message: mapped.message };
}

async function partnerName(db: Db, userId: string): Promise<string> {
  return nameBook(await partnerNames(db), userId).partner;
}

export interface ChooseInput {
  decisionId: string;
  optionId: string;
  expectedVersion: number;
  /** Day inside the period (AC64). */
  exactDate?: PlainDate | null;
}

export async function chooseOption(
  db: Db,
  userId: string,
  input: ChooseInput,
): Promise<ActionResult<{ referenceDate: PlainDate | null }>> {
  const { data, error } = await db.rpc("choose_option", {
    p_decision_id: input.decisionId,
    p_option_id: input.optionId,
    p_expected_version: input.expectedVersion,
    ...(input.exactDate ? { p_exact_date: input.exactDate } : {}),
  });
  if (error)
    return failure(
      error,
      error.message === "version_conflict" ? await partnerName(db, userId) : undefined,
    );
  const row = (data ?? {}) as { reference_date?: string | null };
  return { ok: true, data: { referenceDate: row.reference_date ?? null } };
}

export async function reopenDecision(
  db: Db,
  userId: string,
  input: { decisionId: string; reason: string; expectedVersion: number },
): Promise<ActionResult> {
  const { error } = await db.rpc("reopen_decision", {
    p_decision_id: input.decisionId,
    p_reason: input.reason,
    p_expected_version: input.expectedVersion,
  });
  if (error)
    return failure(
      error,
      error.message === "version_conflict" ? await partnerName(db, userId) : undefined,
    );
  return { ok: true, data: undefined };
}

export async function addNote(
  db: Db,
  input: { decisionId: string; note: string; optionId?: string | null },
): Promise<ActionResult> {
  const { error } = await db.rpc("add_decision_note", {
    p_decision_id: input.decisionId,
    p_note: input.note,
    ...(input.optionId ? { p_option_id: input.optionId } : {}),
  });
  if (error) return failure(error);
  return { ok: true, data: undefined };
}

export interface ReferenceChange {
  optionId: string | null;
  referenceDate: PlainDate | null;
  status: "provisional" | "definitive" | null;
  source: "chosen" | "manual" | "automatic" | null;
}

/** `null` returns to the automatic reference (the nearest). */
export async function setReference(
  db: Db,
  optionId: string | null,
): Promise<ActionResult<ReferenceChange>> {
  const { data, error } = await db.rpc(
    "set_reference_scenario",
    optionId ? { p_option_id: optionId } : {},
  );
  if (error) return failure(error);
  const row = (data ?? {}) as {
    option_id?: string | null;
    reference_date?: string | null;
    status?: string | null;
    source?: string | null;
  };
  return {
    ok: true,
    data: {
      optionId: row.option_id ?? null,
      referenceDate: row.reference_date ?? null,
      status: row.status === "definitive" || row.status === "provisional" ? row.status : null,
      source:
        row.source === "chosen" || row.source === "manual" || row.source === "automatic"
          ? row.source
          : null,
    },
  };
}

function optionColumns(input: OptionInput) {
  return {
    title: input.title,
    comune: input.comune,
    link: input.link,
    notes: input.notes,
    pros: input.pros,
    cons: input.cons,
    cost_cents: input.costCents,
  };
}

/**
 * New candidate. A date takes two inserts (option + scenario, no RPC in T8): if the second one
 * fails the option is soft-deleted again so no half date is left behind.
 */
export async function addOption(
  db: Db,
  input: { decisionId: string; option: OptionInput; scenario?: ScenarioInput | null },
): Promise<ActionResult<{ optionId: string }>> {
  const decision = await db
    .from("decisions")
    .select("wedding_id, type")
    .eq("id", input.decisionId)
    .maybeSingle();
  if (decision.error) return failure(decision.error);
  if (!decision.data) return failure({ code: "42501" });
  const weddingId = decision.data.wedding_id;
  if (decision.data.type === "date" && !input.scenario) {
    return {
      ok: false,
      code: "scenario_missing",
      message: mapDbError({ message: "scenario_missing" }).message,
    };
  }

  const title =
    input.option.title.trim() !== ""
      ? input.option.title
      : input.scenario
        ? defaultScenarioTitle(input.scenario)
        : input.option.title;
  const inserted = await db
    .from("decision_options")
    .insert({
      wedding_id: weddingId,
      decision_id: input.decisionId,
      ...optionColumns({ ...input.option, title }),
    })
    .select("id")
    .single();
  if (inserted.error) return failure(inserted.error);
  const optionId = inserted.data.id;

  if (decision.data.type === "date" && input.scenario) {
    const scenario = await db.from("date_scenarios").insert({
      wedding_id: weddingId,
      option_id: optionId,
      kind: input.scenario.kind,
      date_from: input.scenario.dateFrom,
      date_to: input.scenario.dateTo,
      location_option_id: input.scenario.locationOptionId,
    });
    if (scenario.error) {
      await db
        .from("decision_options")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", optionId);
      return failure(scenario.error);
    }
  }
  return { ok: true, data: { optionId } };
}

function optionFields(row: Tables<"decision_options">): Record<string, unknown> {
  return {
    title: row.title,
    comune: row.comune,
    link: row.link,
    notes: row.notes,
    pros: row.pros,
    cons: row.cons,
    costCents: row.cost_cents,
    version: row.version,
  };
}

function scenarioFields(row: Tables<"date_scenarios">): Record<string, unknown> {
  return {
    kind: row.kind,
    dateFrom: row.date_from,
    dateTo: row.date_to,
    locationOptionId: row.location_option_id,
    version: row.version,
  };
}

async function conflictResult(
  db: Db,
  current: Record<string, unknown> | null,
  changedBy: string | null,
  changedAt: string | null,
  userId: string,
): Promise<VersionedResult> {
  const names = nameBook(await partnerNames(db), userId);
  return {
    ok: false,
    code: "conflict",
    message: "Qualcuno ha modificato questo elemento mentre lo guardavi.",
    conflict: {
      current,
      changedByName: changedBy ? names.nameOf(changedBy, names.partner) : null,
      changedAt,
    },
  };
}

/** Edit of the option fields with optimistic concurrency (AC40): a conflict never overwrites. */
export async function updateOption(
  db: Db,
  userId: string,
  input: { optionId: string; version: number; option: OptionInput },
): Promise<VersionedResult> {
  try {
    const result = await versionedUpdate(
      db,
      "decision_options",
      input.optionId,
      input.version,
      optionColumns(input.option),
    );
    if (!result.conflict) return { ok: true, data: { version: result.row.version } };
    return conflictResult(
      db,
      result.current ? optionFields(result.current) : null,
      result.changedBy,
      result.changedAt,
      userId,
    );
  } catch (error) {
    return versionedFailure(error);
  }
}

/** Edit of the date, the period or the linked location (the dates only while the decision is open). */
export async function updateScenario(
  db: Db,
  userId: string,
  input: { scenarioId: string; version: number; scenario: ScenarioInput; locationOnly?: boolean },
): Promise<VersionedResult> {
  const patch = input.locationOnly
    ? { location_option_id: input.scenario.locationOptionId }
    : {
        kind: input.scenario.kind,
        date_from: input.scenario.dateFrom,
        date_to: input.scenario.dateTo,
        location_option_id: input.scenario.locationOptionId,
      };
  try {
    const result = await versionedUpdate(
      db,
      "date_scenarios",
      input.scenarioId,
      input.version,
      patch,
    );
    if (!result.conflict) return { ok: true, data: { version: result.row.version } };
    return conflictResult(
      db,
      result.current ? scenarioFields(result.current) : null,
      result.changedBy,
      result.changedAt,
      userId,
    );
  } catch (error) {
    return versionedFailure(error);
  }
}

function versionedFailure(error: unknown): VersionedResult {
  if (error instanceof VersionedUpdateError) {
    return failure({ code: error.code, message: error.message });
  }
  return { ok: false, code: "unknown", message: GENERIC_ERROR };
}

/** Soft delete (never for the chosen option: the database refuses). */
export async function removeOption(
  db: Db,
  userId: string,
  input: { optionId: string; version: number },
): Promise<VersionedResult> {
  try {
    const result = await versionedUpdate(db, "decision_options", input.optionId, input.version, {
      deleted_at: new Date().toISOString(),
    });
    if (!result.conflict) return { ok: true, data: { version: result.row.version } };
    return conflictResult(db, null, result.changedBy, result.changedAt, userId);
  } catch (error) {
    return versionedFailure(error);
  }
}

export async function restoreOption(
  db: Db,
  userId: string,
  input: { optionId: string; version: number },
): Promise<VersionedResult> {
  try {
    const result = await versionedUpdate(db, "decision_options", input.optionId, input.version, {
      deleted_at: null,
    });
    if (!result.conflict) return { ok: true, data: { version: result.row.version } };
    return conflictResult(db, null, result.changedBy, result.changedAt, userId);
  } catch (error) {
    return versionedFailure(error);
  }
}

/** Non-binding reaction of the caller (AC22); `null` removes it. Update first: upsert would need column grants we do not give. */
export async function setReaction(
  db: Db,
  userId: string,
  input: { optionId: string; reaction: "prefer" | "doubt" | null },
): Promise<ActionResult> {
  if (input.reaction === null) {
    const removed = await db
      .from("option_reactions")
      .delete()
      .eq("option_id", input.optionId)
      .eq("user_id", userId);
    return removed.error ? failure(removed.error) : { ok: true, data: undefined };
  }
  const updated = await db
    .from("option_reactions")
    .update({ reaction: input.reaction })
    .eq("option_id", input.optionId)
    .eq("user_id", userId)
    .select("id");
  if (updated.error) return failure(updated.error);
  if (updated.data.length > 0) return { ok: true, data: undefined };

  const option = await db
    .from("decision_options")
    .select("wedding_id")
    .eq("id", input.optionId)
    .maybeSingle();
  if (option.error) return failure(option.error);
  if (!option.data) return failure({ code: "42501" });
  const inserted = await db.from("option_reactions").insert({
    wedding_id: option.data.wedding_id,
    option_id: input.optionId,
    user_id: userId,
    reaction: input.reaction,
  });
  return inserted.error ? failure(inserted.error) : { ok: true, data: undefined };
}
