import type { SupabaseClient } from "@supabase/supabase-js";
import { isRite, type Rite } from "@/content/milestones";
import type { ActionFailure, VersionedResult } from "@/features/decisions/types";
import { isGuestBand, parseUnknown } from "@/features/onboarding/model";
import type { Database } from "@/lib/supabase/database.types";
import { classifyDbError } from "@/lib/supabase/errors";
import {
  versionedUpdate,
  VersionedUpdateError,
  type VersionedPatch,
} from "@/lib/supabase/versioned-update";
import { displayName } from "@/lib/display-name";
import { GENERIC_ERROR, recomputeUnknown } from "./model";

/**
 * Reads and writes of Impostazioni nozze and Profili (AC16, AC46, AC48, AC58). Everything runs with
 * the USER's client (RLS and column grants are the only authorization); nothing here imports Next.js.
 * Changing an answer NEVER adds or deletes a task: the Percorso derives "Suggerimenti da rivedere"
 * from the saved rite (`diffSuggestions`), so saving the rite is the whole write.
 */
export type Db = SupabaseClient<Database>;

export class SettingsLoadError extends Error {
  readonly infra: "paused" | "unreachable" | null;
  constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = "SettingsLoadError";
    this.infra = classifyDbError(cause);
  }
}

type Loaded<D> = { data: D; error: { message: string; code?: string } | null };

function must<D>(result: Loaded<D>, what: string): NonNullable<D> {
  if (result.error) throw new SettingsLoadError(`Impostazioni: ${what}`, result.error);
  return result.data as NonNullable<D>;
}

// ---------------------------------------------------------------------------------------- views

export interface ScenarioView {
  readonly id: string;
  readonly title: string;
  readonly kind: "fixed" | "period";
  readonly dateFrom: string;
  readonly dateTo: string | null;
  readonly status: "candidate" | "chosen" | "discarded";
  readonly locationName: string | null;
}

export interface SettingsView {
  readonly weddingId: string;
  readonly version: number;
  readonly completed: boolean;
  readonly rite: Rite | null;
  readonly guestBand: string | null;
  /** People on the list; 0 = empty (or no table yet): the band is then editable. */
  readonly guestCount: number;
  readonly styleLabel: string | null;
  readonly styleNote: string | null;
  readonly region: string | null;
  readonly comune: string | null;
  /** Current total (the latest `budget_versions` row), `null` while there is none. */
  readonly budgetCents: number | null;
  readonly scenarios: readonly ScenarioView[];
  readonly unknown: readonly string[];
  readonly partnerName: string;
}

type PartnerRow = {
  id: string;
  version: number;
  slot: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  label: string | null;
  user_id: string | null;
  updated_at: string;
};

async function loadPartnerRows(db: Db): Promise<PartnerRow[]> {
  return must(
    await db
      .from("wedding_partners")
      .select("id,version,slot,email,first_name,last_name,label,user_id,updated_at"),
    "partner",
  ) as PartnerRow[];
}

/** First name or label of the partner who is not the caller. */
function partnerNameOf(rows: readonly PartnerRow[], userId: string): string {
  const other = rows.find((row) => row.user_id !== userId);
  return displayName(other ? { firstName: other.first_name, label: other.label } : null);
}

/** SQLSTATE / PostgREST codes meaning "the table is not there yet" (migration not applied). */
const MISSING_TABLE_CODES: ReadonlySet<string> = new Set(["42P01", "PGRST205"]);

/**
 * People on the guest list (not deleted, RLS decides what is visible). A missing `guests` table
 * counts as an empty list: the settings keep working before the migration (BR6).
 */
export async function countGuests(db: Db): Promise<number> {
  const result = await db
    .from("guests")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);
  if (result.error) {
    if (result.error.code && MISSING_TABLE_CODES.has(result.error.code)) return 0;
    throw new SettingsLoadError("Impostazioni: invitati", result.error);
  }
  return result.count ?? 0;
}

export async function loadSettings(db: Db, userId: string): Promise<SettingsView> {
  const [wedding, scenarios, versions, partners, guestCount] = await Promise.all([
    db.from("weddings").select("*").limit(1).maybeSingle(),
    db.from("date_scenarios").select("id,option_id,kind,date_from,date_to,location_option_id"),
    db
      .from("budget_versions")
      .select("total_cents")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1),
    loadPartnerRows(db),
    countGuests(db),
  ]);
  const row = must(wedding, "nozze");
  const scenarioRows = must(scenarios, "date");
  const ids = [
    ...new Set(
      scenarioRows.flatMap((s) =>
        s.location_option_id ? [s.option_id, s.location_option_id] : [s.option_id],
      ),
    ),
  ];
  const options =
    ids.length === 0
      ? []
      : must(
          await db.from("decision_options").select("id,title,status,deleted_at").in("id", ids),
          "opzioni",
        );
  const byId = new Map(options.map((o) => [o.id, o]));

  const views: ScenarioView[] = scenarioRows
    .flatMap((s): ScenarioView[] => {
      const option = byId.get(s.option_id);
      if (!option || option.deleted_at !== null) return [];
      const location = s.location_option_id ? byId.get(s.location_option_id) : undefined;
      return [
        {
          id: s.id,
          title: option.title,
          kind: s.kind === "period" ? "period" : "fixed",
          dateFrom: s.date_from,
          dateTo: s.date_to,
          status:
            option.status === "chosen" || option.status === "discarded"
              ? option.status
              : "candidate",
          locationName: location && location.deleted_at === null ? location.title : null,
        },
      ];
    })
    .toSorted((a, b) => (a.dateFrom < b.dateFrom ? -1 : a.dateFrom > b.dateFrom ? 1 : 0));

  return {
    weddingId: row.id,
    version: row.version,
    completed: row.onboarding_completed_at !== null,
    rite: isRite(row.rite) ? row.rite : null,
    guestBand: isGuestBand(row.guest_band) ? row.guest_band : null,
    guestCount,
    styleLabel: row.style_label,
    styleNote: row.style_note,
    region: row.region,
    comune: row.comune,
    budgetCents: must(versions, "totale")[0]?.total_cents ?? null,
    scenarios: views,
    unknown: parseUnknown(row.onboarding_unknown),
    partnerName: partnerNameOf(partners, userId),
  };
}

// ---------------------------------------------------------------------------------------- errors

function infraMessage(error: unknown): string | null {
  const kind = classifyDbError(error);
  if (kind === "paused") return "L'app è in pausa: riprova più tardi.";
  if (kind === "unreachable") {
    return "Non riesco a raggiungere il servizio. Controlla la connessione e riprova.";
  }
  return null;
}

function failure(error: { code?: string; message?: string } | null): ActionFailure {
  const infra = infraMessage(error);
  if (infra) return { ok: false, code: "unreachable", message: infra };
  if (error?.code === "42501") {
    return {
      ok: false,
      code: "forbidden",
      message: "Non hai il permesso di fare questa modifica.",
    };
  }
  return { ok: false, code: "unknown", message: GENERIC_ERROR };
}

function versionedFailure(error: unknown): ActionFailure {
  if (error instanceof VersionedUpdateError) {
    return failure({ ...(error.code ? { code: error.code } : {}), message: error.message });
  }
  return failure(error as { code?: string });
}

/** Name of the person behind a user id (the partner rows know their `user_id`). */
function nameOfUser(rows: readonly PartnerRow[], userId: string | null): string | null {
  if (!userId) return null;
  const row = rows.find((p) => p.user_id === userId);
  return row ? displayName({ firstName: row.first_name, label: row.label }) : null;
}

async function conflict(
  db: Db,
  current: Record<string, unknown> | null,
  changedBy: string | null,
  changedAt: string | null,
): Promise<VersionedResult> {
  const rows = await loadPartnerRows(db).catch(() => [] as PartnerRow[]);
  return {
    ok: false,
    code: "conflict",
    message: "Qualcuno ha modificato questi dati mentre li guardavi.",
    conflict: { current, changedByName: nameOfUser(rows, changedBy), changedAt },
  };
}

// ---------------------------------------------------------------------------- settings: the write

export interface SettingsInput {
  readonly version: number;
  readonly rite: Rite | null;
  readonly guestBand: string | null;
  readonly styleLabel: string | null;
  readonly styleNote: string | null;
  readonly region: string | null;
  readonly comune: string | null;
}

const settingsFields = (row: Database["public"]["Tables"]["weddings"]["Row"]) => ({
  rite: row.rite,
  guestBand: row.guest_band,
  styleLabel: row.style_label,
  styleNote: row.style_note,
  region: row.region,
  comune: row.comune,
  // "Salva comunque" retries with this version (the dialog only shows the labelled fields).
  version: row.version,
});

/**
 * Saves the answers of Impostazioni nozze with the optimistic version the person was looking at
 * (BR9): a newer version is a conflict (never an overwrite). A new rite is just saved: the Percorso
 * shows the resulting "Suggerimenti da rivedere" (AC16, AC48); no task is added or deleted here.
 */
export async function saveSettings(
  db: Db,
  input: SettingsInput & { id: string; hasBudget: boolean; currentUnknown: readonly string[] },
): Promise<VersionedResult> {
  const patch: VersionedPatch<"weddings"> = {
    rite: input.rite,
    guest_band: input.guestBand,
    style_label: input.styleLabel,
    style_note: input.styleNote,
    region: input.region,
    comune: input.comune,
    onboarding_unknown: recomputeUnknown(input.currentUnknown, {
      rite: input.rite,
      guestBand: input.guestBand,
      styleLabel: input.styleLabel,
      styleNote: input.styleNote,
      region: input.region,
      comune: input.comune,
      hasBudget: input.hasBudget,
    }),
  };
  try {
    const result = await versionedUpdate(db, "weddings", input.id, input.version, patch);
    if (!result.conflict) return { ok: true, data: { version: result.row.version } };
    return conflict(
      db,
      result.current ? settingsFields(result.current) : null,
      result.changedBy,
      result.changedAt,
    );
  } catch (error) {
    return versionedFailure(error);
  }
}

// ------------------------------------------------------------------------------------- profiles

export interface ProfilePerson {
  readonly id: string;
  readonly version: number;
  readonly slot: "A" | "B";
  readonly email: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly label: string | null;
  /** Has entered at least once (the row is bound to an account). */
  readonly joined: boolean;
  readonly isMe: boolean;
}

export interface ProfilesView {
  readonly me: ProfilePerson;
  readonly other: ProfilePerson | null;
}

/** The two people of the wedding, "me" first. Throws `SettingsLoadError` when the caller has no row. */
export async function loadProfiles(db: Db, userId: string): Promise<ProfilesView> {
  const rows = await loadPartnerRows(db);
  const mine = rows.find((row) => row.user_id === userId);
  if (!mine) throw new SettingsLoadError("Profili: nessuna scheda", { message: "no partner row" });
  const toPerson = (row: PartnerRow): ProfilePerson => ({
    id: row.id,
    version: row.version,
    slot: row.slot === "B" ? "B" : "A",
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    label: row.label,
    joined: row.user_id !== null,
    isMe: row.id === mine.id,
  });
  const other = rows.find((row) => row.id !== mine.id);
  return { me: toPerson(mine), other: other ? toPerson(other) : null };
}

export interface PersonInput {
  readonly partnerId: string;
  readonly version: number;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly label: string | null;
}

/**
 * Name, surname and label of either partner (both may edit both, AC46). The EMAIL is not part of
 * this write: `wedding_partners.email` has no column grant (AC58 rules in `PartnerEmailForm` and
 * `/altro/account`).
 */
export async function savePerson(db: Db, input: PersonInput): Promise<VersionedResult> {
  try {
    const result = await versionedUpdate(db, "wedding_partners", input.partnerId, input.version, {
      first_name: input.firstName,
      last_name: input.lastName,
      label: input.label,
    });
    if (!result.conflict) return { ok: true, data: { version: result.row.version } };
    const current = result.current;
    return conflict(
      db,
      current
        ? {
            firstName: current.first_name,
            lastName: current.last_name,
            label: current.label,
            version: current.version,
          }
        : null,
      result.changedBy,
      result.changedAt,
    );
  } catch (error) {
    return versionedFailure(error);
  }
}
