import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { isPlainDate } from "@/lib/dates/plain-date";
import { allPages } from "@/lib/supabase/all-pages";
import { classifyDbError, type DbErrorKind } from "@/lib/supabase/errors";
import type { SuggestionDismissal } from "@/domain/timeline";
import {
  parseRite,
  rowToPartner,
  rowToTask,
  type LocationRow,
  type OptionStatus,
  type PercorsoData,
  type ScenarioRow,
  type Slot,
} from "./model";

export type Db = SupabaseClient<Database>;

/** Loading failed: `kind` says whether it is an outage (paused/unreachable) or an app error. */
export class PercorsoLoadError extends Error {
  readonly kind: DbErrorKind | null;
  constructor(message: string, kind: DbErrorKind | null, cause?: unknown) {
    super(message, { cause });
    this.name = "PercorsoLoadError";
    this.kind = kind;
  }
}

function must<T>(result: { data: T | null; error: unknown }, what: string): T {
  if (result.error || result.data === null) {
    const message = (result.error as { message?: string } | null)?.message ?? "no data";
    throw new PercorsoLoadError(`${what}: ${message}`, classifyDbError(result.error), result.error);
  }
  return result.data;
}

function asStatus(value: string): OptionStatus {
  return value === "chosen" || value === "discarded" ? value : "candidate";
}

/** Events that can explain a change of dates; the screen needs the recent ones only. */
const EVENT_LIMIT = 30;

/**
 * Reads everything the Percorso needs with the USER's client: RLS decides what is visible
 * (plan §1). Returns `null` when the user has no wedding yet. Nothing is written here.
 */
export async function loadPercorsoData(db: Db, userId: string): Promise<PercorsoData | null> {
  const wedding = await db
    .from("weddings")
    .select("id, rite, manual_reference_option_id")
    .maybeSingle();
  if (wedding.error) {
    throw new PercorsoLoadError(
      `weddings: ${wedding.error.message}`,
      classifyDbError(wedding.error),
      wedding.error,
    );
  }
  if (!wedding.data) return null;
  const weddingId = wedding.data.id;

  const [membership, partners, decisions, tasks, dismissals, state] = await Promise.all([
    db.from("memberships").select("partner_slot").eq("user_id", userId).maybeSingle(),
    db.from("wedding_partners").select("*"),
    db.from("decisions").select("id, key, status"),
    // Every task, page by page (the DB allows up to 2000 per wedding; `max_rows` is lower).
    allPages((from, to) =>
      db
        .from("tasks")
        .select("*")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ).then(
      (data) => ({ data, error: null }),
      (error: unknown) => ({ data: null, error }),
    ),
    db.from("task_suggestion_dismissals").select("template_key, kind"),
    db.from("user_wedding_state").select("previous_seen_at").eq("user_id", userId).maybeSingle(),
  ]);
  if (membership.error)
    throw new PercorsoLoadError("memberships", classifyDbError(membership.error), membership.error);
  if (state.error) throw new PercorsoLoadError("state", classifyDbError(state.error), state.error);

  const decisionRows = must(decisions, "decisions");
  const dateDecision = decisionRows.find((d) => d.key === "date") ?? null;
  const locationDecision = decisionRows.find((d) => d.key === "location") ?? null;

  const [options, scenarioRows, events] = await Promise.all([
    db.from("decision_options").select("id, decision_id, title, status").is("deleted_at", null),
    db.from("date_scenarios").select("option_id, kind, date_from, date_to, location_option_id"),
    dateDecision
      ? db
          .from("decision_events")
          .select("kind, option_id, actor_id, at")
          .eq("decision_id", dateDecision.id)
          .order("at", { ascending: false })
          .order("id", { ascending: false })
          .limit(EVENT_LIMIT)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const optionRows = must(options, "decision_options");
  const scenarioData = must(scenarioRows, "date_scenarios");
  const eventRows = must(events, "decision_events");

  const optionById = new Map(optionRows.map((o) => [o.id, o]));
  const scenarios: ScenarioRow[] = scenarioData.flatMap((s) => {
    const option = optionById.get(s.option_id);
    if (!option || !dateDecision || option.decision_id !== dateDecision.id) return [];
    if (!isPlainDate(s.date_from)) return [];
    return [
      {
        optionId: s.option_id,
        label: option.title,
        kind: s.kind === "period" ? ("period" as const) : ("fixed" as const),
        dateFrom: s.date_from,
        dateTo: s.date_to && isPlainDate(s.date_to) ? s.date_to : null,
        locationOptionId: s.location_option_id,
        status: asStatus(option.status),
      },
    ];
  });
  const locations: LocationRow[] = optionRows
    .filter((o) => locationDecision && o.decision_id === locationDecision.id)
    .map((o) => ({ id: o.id, title: o.title, status: asStatus(o.status) }));

  const mySlot: Slot | null =
    membership.data?.partner_slot === "A" || membership.data?.partner_slot === "B"
      ? membership.data.partner_slot
      : null;

  return {
    weddingId,
    userId,
    mySlot,
    rite: parseRite(wedding.data.rite),
    manualReferenceId: wedding.data.manual_reference_option_id,
    partners: must(partners, "wedding_partners").map(rowToPartner),
    dateDecision: dateDecision
      ? { id: dateDecision.id, status: dateDecision.status === "taken" ? "taken" : "open" }
      : null,
    scenarios,
    locations,
    tasks: must(tasks, "tasks").map(rowToTask),
    dismissals: must(dismissals, "task_suggestion_dismissals").map((d): SuggestionDismissal => ({
      templateKey: d.template_key,
      kind: d.kind === "remove" ? "remove" : "add",
    })),
    events: eventRows.map((e) => ({
      kind: e.kind,
      optionId: e.option_id,
      actorId: e.actor_id,
      at: e.at,
    })),
    previousSeenAt: state.data?.previous_seen_at ?? null,
  };
}
