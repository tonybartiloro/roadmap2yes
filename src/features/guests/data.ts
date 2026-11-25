import type { SupabaseClient } from "@supabase/supabase-js";
import {
  GUEST_CATEGORIES,
  GUEST_SIDES,
  type Guest,
  type GuestCategory,
  type GuestGroup,
  type GuestSide,
  type GuestTable,
} from "@/domain/guests";
import { nameBook, type PartnerRow } from "@/features/budget/model";
import type { ActionResult, VersionedResult } from "@/features/decisions/types";
import { allPages, chunk, PageReadError } from "@/lib/supabase/all-pages";
import type { Database, Tables } from "@/lib/supabase/database.types";
import { classifyDbError } from "@/lib/supabase/errors";
import {
  versionedUpdate,
  VersionedUpdateError,
  type VersionedPatch,
  type VersionedTable,
} from "@/lib/supabase/versioned-update";

/**
 * Reads and writes of the guests module (ADR-0002). Everything runs with the USER'S client (RLS is
 * the only authorization layer); nothing here imports Next.js, so the integration tests drive it
 * directly.
 *
 * PERSONAL DATA RULE: nothing in this file logs, and no error result or thrown message ever carries
 * a database message or a field value. Failures map to FIXED Italian texts by code only.
 */
export type Db = SupabaseClient<Database>;

export type GuestView = Guest & { version: number };
export type GroupView = GuestGroup & { version: number };
export type TableView = GuestTable & { version: number };

/** Everything the module shows, deleted rows included ("Eliminati di recente"). */
export interface GuestsSnapshot {
  guests: GuestView[];
  groups: GroupView[];
  tables: TableView[];
}

/** What a form sends for a person, already validated and normalized (empty text = null). */
export interface GuestValues {
  firstName: string;
  lastName: string | null;
  category: GuestCategory;
  side: GuestSide | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
}

export type EntityKind = "guest" | "group" | "table";
export type BulkOp = "assign_group" | "assign_table" | "delete" | "restore";

/** One entry of `previous`, exactly as `guests_bulk` returns it and `guests_bulk_undo` takes it. */
export interface BulkPrevious {
  id: string;
  op: BulkOp;
  group_id: string | null;
  table_id: string | null;
  deleted: boolean;
}

// ---------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------

/**
 * A failed read, rendered by `ErrorState` ("Riprova"). `not_migrated` = the tables are not there
 * yet (the code is deployed before the migration runs): a state, not a crash.
 */
export class GuestsLoadError extends Error {
  readonly code: "not_migrated" | "unknown";
  readonly infra: "paused" | "unreachable" | null;
  constructor(code: "not_migrated" | "unknown", cause: unknown) {
    super(code === "not_migrated" ? "Guests: schema not migrated" : "Guests: read failed");
    this.name = "GuestsLoadError";
    this.code = code;
    this.infra = classifyDbError(cause);
  }
}

const NOT_MIGRATED_CODES: ReadonlySet<string> = new Set(["42P01", "PGRST205", "PGRST202"]);

export const GENERIC_ERROR = "Non sono riuscito a salvare. Riprova tra un attimo.";
export const BULK_ERROR = "Non sono riuscito a cambiarli tutti. Riprova.";

const MESSAGES: Readonly<Record<string, string>> = {
  forbidden: "Non hai il permesso di farlo.",
  invalid: "Qualche dato non è valido: controlla e riprova.",
  invalid_row: "Una delle persone ha dati non validi: controlla nome, telefono ed email.",
  group_deleted: "Questo gruppo è stato eliminato: scegline un altro.",
  table_deleted: "Questo tavolo è stato eliminato: scegline un altro.",
  invalid_target: "Questo gruppo o tavolo non c'è più: scegline un altro.",
  not_found: "Questo elemento non c'è più. Ho ricaricato la pagina.",
  too_many_rows: "Una famiglia può avere al massimo 100 persone.",
  invalid_previous: "Non posso annullare questa azione: ricarica la pagina.",
  not_deleted: "Puoi eliminare per sempre solo ciò che è già tra gli eliminati.",
  not_migrated: "Gli invitati non sono ancora pronti: riprova tra un minuto.",
};

/** Codes after which the screen is stale and must reload. */
export const STALE_CODES: ReadonlySet<string> = new Set(["not_found", "invalid_target", "partial"]);

const INVALID_SQLSTATES: ReadonlySet<string> = new Set(["23514", "22P02", "23502", "22001"]);

function infraMessage(error: unknown): string | null {
  const kind = classifyDbError(error);
  if (kind === "paused") return "L'app è in pausa: riprova più tardi.";
  if (kind === "unreachable") {
    return "Non riesco a raggiungere il servizio. Controlla la connessione e riprova.";
  }
  return null;
}

/**
 * `{ code, message }` of a Supabase error. Only the SQLSTATE and an EXACT business code (the RPCs
 * raise their code as the message) are read; any other message text is dropped, never returned.
 */
export function mapDbError(
  error: { code?: string; message?: string } | null | undefined,
  generic: string = GENERIC_ERROR,
): { code: string; message: string } {
  const infra = infraMessage(error);
  if (infra) return { code: "unreachable", message: infra };
  if (!error) return { code: "unknown", message: generic };
  const sqlstate = error.code ?? "";
  if (sqlstate === "42501") return { code: "forbidden", message: MESSAGES["forbidden"]! };
  if (NOT_MIGRATED_CODES.has(sqlstate)) {
    return { code: "not_migrated", message: MESSAGES["not_migrated"]! };
  }
  if (INVALID_SQLSTATES.has(sqlstate)) return { code: "invalid", message: MESSAGES["invalid"]! };
  if (sqlstate === "23503") {
    return { code: "invalid_target", message: MESSAGES["invalid_target"]! };
  }
  const code = (error.message ?? "").trim();
  const text = Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : undefined;
  if (text) return { code, message: text };
  return { code: "unknown", message: generic };
}

function failure(
  error: { code?: string; message?: string } | null,
  generic?: string,
): ActionResult<never> {
  return { ok: false, ...mapDbError(error, generic) };
}

function versionedFailure(error: unknown): VersionedResult {
  if (error instanceof VersionedUpdateError) {
    return failure({ ...(error.code ? { code: error.code } : {}), message: error.message });
  }
  return { ok: false, code: "unknown", message: GENERIC_ERROR };
}

// ---------------------------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------------------------

const GUEST_COLUMNS =
  "id, first_name, last_name, category, side, phone, email, notes, group_id, table_id, deleted_at, version";
const GROUP_COLUMNS = "id, name, deleted_at, version";
const TABLE_COLUMNS = "id, name, capacity, deleted_at, version";

function oneOf<T extends string>(values: readonly T[], value: string | null, fallback: T): T {
  return (values as readonly string[]).includes(value ?? "") ? (value as T) : fallback;
}

/**
 * Every guest, group and table of the wedding, deleted ones included, read in pages of 500 ordered
 * by id (no cap, no silent truncation: AC12). A missing table throws `GuestsLoadError("not_migrated")`.
 */
export async function loadGuests(db: Db): Promise<GuestsSnapshot> {
  try {
    const [guests, groups, tables] = await Promise.all([
      allPages((from, to) => db.from("guests").select(GUEST_COLUMNS).order("id").range(from, to)),
      allPages((from, to) =>
        db.from("guest_groups").select(GROUP_COLUMNS).order("id").range(from, to),
      ),
      allPages((from, to) =>
        db.from("guest_tables").select(TABLE_COLUMNS).order("id").range(from, to),
      ),
    ]);
    // Pages are read at different instants: an insert or a hard delete between two pages can
    // repeat a row. Keep the first of each id (a skipped row heals on the next refresh) (REV-19).
    const unique = <T extends { id: string }>(rows: T[]): T[] => {
      const seen = new Set<string>();
      return rows.filter((row) => !seen.has(row.id) && !!seen.add(row.id));
    };
    return {
      guests: unique(guests).map((g) => ({
        id: g.id,
        firstName: g.first_name,
        lastName: g.last_name,
        category: oneOf(GUEST_CATEGORIES, g.category, "adult"),
        side: g.side === null ? null : oneOf(GUEST_SIDES, g.side, "A"),
        phone: g.phone,
        email: g.email,
        notes: g.notes,
        groupId: g.group_id,
        tableId: g.table_id,
        deletedAt: g.deleted_at,
        version: g.version,
      })),
      groups: unique(groups).map((g) => ({
        id: g.id,
        name: g.name,
        deletedAt: g.deleted_at,
        version: g.version,
      })),
      tables: unique(tables).map((t) => ({
        id: t.id,
        name: t.name,
        capacity: t.capacity,
        deletedAt: t.deleted_at,
        version: t.version,
      })),
    };
  } catch (error) {
    const code = error instanceof PageReadError ? error.code : undefined;
    throw new GuestsLoadError(
      code && NOT_MIGRATED_CODES.has(code) ? "not_migrated" : "unknown",
      error,
    );
  }
}

/** The caller's `guests/read` permission (drives the "Questo spazio è su invito" panel). */
export async function canReadGuests(db: Db): Promise<boolean> {
  const wedding = await db.from("weddings").select("id").limit(1).maybeSingle();
  if (wedding.error || !wedding.data) return false;
  const allowed = await db.rpc("has_permission", {
    p_wedding_id: wedding.data.id,
    p_area: "guests",
    p_action: "read",
  });
  return allowed.data === true;
}

async function loadPartners(db: Db): Promise<PartnerRow[]> {
  const rows = await db.from("wedding_partners").select("user_id, first_name, last_name, label");
  return (rows.data ?? []) as PartnerRow[];
}

// ---------------------------------------------------------------------------------------------
// Writes: people and groups
// ---------------------------------------------------------------------------------------------

async function weddingIdOrFail(db: Db): Promise<string | ActionResult<never>> {
  const row = await db.from("weddings").select("id").limit(1).maybeSingle();
  if (row.error) return failure(row.error);
  if (!row.data) return failure({ code: "42501" });
  return row.data.id;
}

function guestRow(values: GuestValues) {
  return {
    first_name: values.firstName,
    last_name: values.lastName,
    category: values.category,
    side: values.side,
    phone: values.phone,
    email: values.email,
    notes: values.notes,
  };
}

/** A person, optionally already in a group and/or at a table. */
export async function addGuest(
  db: Db,
  input: { guest: GuestValues; groupId?: string | null; tableId?: string | null },
): Promise<ActionResult<{ guestId: string }>> {
  const weddingId = await weddingIdOrFail(db);
  if (typeof weddingId !== "string") return weddingId;
  const inserted = await db
    .from("guests")
    .insert({
      wedding_id: weddingId,
      ...guestRow(input.guest),
      group_id: input.groupId ?? null,
      table_id: input.tableId ?? null,
    })
    .select("id")
    .single();
  return inserted.error
    ? failure(inserted.error)
    : { ok: true, data: { guestId: inserted.data.id } };
}

export async function addGroup(
  db: Db,
  input: { name: string },
): Promise<ActionResult<{ groupId: string }>> {
  const weddingId = await weddingIdOrFail(db);
  if (typeof weddingId !== "string") return weddingId;
  const inserted = await db
    .from("guest_groups")
    .insert({ wedding_id: weddingId, name: input.name })
    .select("id")
    .single();
  return inserted.error
    ? failure(inserted.error)
    : { ok: true, data: { groupId: inserted.data.id } };
}

/** "Nuova famiglia" / "Aggiungi un gruppo intero": the group and its people in ONE transaction (AC5). */
export async function createFamily(
  db: Db,
  input: { name: string; side: GuestSide | null; guests: readonly GuestValues[] },
): Promise<ActionResult<{ groupId: string; guestIds: string[] }>> {
  const rows = input.guests.map((g) => ({
    first_name: g.firstName,
    last_name: g.lastName,
    category: g.category,
    phone: g.phone,
    email: g.email,
    notes: g.notes,
  }));
  const result = await db.rpc("create_guest_family", {
    p_name: input.name,
    p_side: input.side as string,
    p_rows: rows,
  });
  if (result.error) return failure(result.error);
  const body = result.data as { group_id?: unknown; guest_ids?: unknown } | null;
  if (!body || typeof body.group_id !== "string" || !Array.isArray(body.guest_ids)) {
    return failure(null);
  }
  return { ok: true, data: { groupId: body.group_id, guestIds: body.guest_ids as string[] } };
}

function guestFields(row: Tables<"guests">): Record<string, unknown> {
  return {
    firstName: row.first_name,
    lastName: row.last_name,
    category: row.category,
    side: row.side,
    phone: row.phone,
    email: row.email,
    notes: row.notes,
    groupId: row.group_id,
    tableId: row.table_id,
    version: row.version,
  };
}

function groupFields(row: Tables<"guest_groups">): Record<string, unknown> {
  return { name: row.name, version: row.version };
}

function tableFields(row: Tables<"guest_tables">): Record<string, unknown> {
  return { name: row.name, capacity: row.capacity, version: row.version };
}

/** Builds the `conflict` result of a versioned write (who changed it, when, and the current row). */
export async function conflictResult(
  db: Db,
  userId: string,
  current: Record<string, unknown> | null,
  changedBy: string | null,
  changedAt: string | null,
): Promise<VersionedResult> {
  const names = nameBook(await loadPartners(db).catch(() => []), userId);
  return {
    ok: false,
    code: "conflict",
    message: "Qualcuno ha modificato questo elemento mentre lo guardavi.",
    conflict: {
      current,
      changedByName: changedBy ? names.nameOf(changedBy) : null,
      changedAt,
    },
  };
}

/**
 * One optimistic-concurrency write (AC6, BR9): a conflict never overwrites; zero rows at the same
 * version is `forbidden`. `fields` maps the current row to the keys of the conflict dialog.
 */
export async function versioned<T extends VersionedTable>(
  db: Db,
  userId: string,
  table: T,
  id: string,
  version: number,
  patch: VersionedPatch<T>,
  fields: (row: Tables<T>) => Record<string, unknown>,
): Promise<VersionedResult> {
  try {
    const result = await versionedUpdate(db, table, id, version, patch);
    if (!result.conflict) return { ok: true, data: { version: result.row.version } };
    // Zero rows but the row is visible and still at the expected version: not a conflict, the
    // UPDATE was denied by RLS (REV-20).
    if (result.current && result.current.version === version) {
      return failure({ code: "42501" });
    }
    return conflictResult(
      db,
      userId,
      result.current ? fields(result.current) : null,
      result.changedBy,
      result.changedAt,
    );
  } catch (error) {
    return versionedFailure(error);
  }
}

/** Edit from the form: versioned update plus the conflict dialog data. */
export async function updateGuest(
  db: Db,
  userId: string,
  input: {
    guestId: string;
    version: number;
    guest: GuestValues;
    groupId?: string | null;
    tableId?: string | null;
  },
): Promise<VersionedResult> {
  const patch: VersionedPatch<"guests"> = {
    ...guestRow(input.guest),
    ...(input.groupId !== undefined ? { group_id: input.groupId } : {}),
    ...(input.tableId !== undefined ? { table_id: input.tableId } : {}),
  };
  return versioned(db, userId, "guests", input.guestId, input.version, patch, guestFields);
}

export async function updateGroup(
  db: Db,
  userId: string,
  input: { groupId: string; version: number; name: string },
): Promise<VersionedResult> {
  return versioned(
    db,
    userId,
    "guest_groups",
    input.groupId,
    input.version,
    { name: input.name },
    groupFields,
  );
}

/**
 * Quick assignment of ONE person (a direct update, no version: the last save wins). `undefined`
 * leaves that field alone; `null` = "Senza gruppo" / "Senza tavolo".
 */
export async function assignGuest(
  db: Db,
  input: { guestId: string; groupId?: string | null; tableId?: string | null },
): Promise<ActionResult> {
  const patch = {
    ...(input.groupId !== undefined ? { group_id: input.groupId } : {}),
    ...(input.tableId !== undefined ? { table_id: input.tableId } : {}),
  };
  const updated = await db.from("guests").update(patch).eq("id", input.guestId).select("id");
  if (updated.error) return failure(updated.error);
  return (updated.data?.length ?? 0) === 1
    ? { ok: true, data: undefined }
    : failure({ message: "not_found" });
}

// ---------------------------------------------------------------------------------------------
// Delete, restore, delete for good, empty ("Svuota"): guests, groups and tables
// ---------------------------------------------------------------------------------------------

const KIND_TABLE = {
  guest: "guests",
  group: "guest_groups",
  table: "guest_tables",
} as const;

/** Soft delete (AC10): "Annulla" and "Eliminati di recente" restore it. The pointer is KEPT (P2). */
export async function removeEntity(
  db: Db,
  userId: string,
  input: { kind: EntityKind; id: string; version: number },
): Promise<VersionedResult> {
  const patch = { deleted_at: new Date().toISOString() };
  switch (input.kind) {
    case "guest":
      return versioned(db, userId, "guests", input.id, input.version, patch, guestFields);
    case "group":
      return versioned(db, userId, "guest_groups", input.id, input.version, patch, groupFields);
    case "table":
      return versioned(db, userId, "guest_tables", input.id, input.version, patch, tableFields);
  }
}

export async function restoreEntity(
  db: Db,
  userId: string,
  input: { kind: EntityKind; id: string; version: number },
): Promise<VersionedResult> {
  const patch = { deleted_at: null };
  switch (input.kind) {
    case "guest":
      return versioned(db, userId, "guests", input.id, input.version, patch, guestFields);
    case "group":
      return versioned(db, userId, "guest_groups", input.id, input.version, patch, groupFields);
    case "table":
      return versioned(db, userId, "guest_tables", input.id, input.version, patch, tableFields);
  }
}

/**
 * "Elimina definitivamente" (AC11): a physical DELETE. RLS lets it through only for rows already
 * soft deleted and with `guests/delete`; on anything else zero rows are removed, which is reported
 * as `not_deleted`. The members of a group/table are freed by the foreign keys.
 */
export async function purgeEntity(
  db: Db,
  input: { kind: EntityKind; id: string },
): Promise<ActionResult> {
  const removed = await db.from(KIND_TABLE[input.kind]).delete().eq("id", input.id).select("id");
  if (removed.error) return failure(removed.error);
  return (removed.data?.length ?? 0) === 1
    ? { ok: true, data: undefined }
    : failure({ message: "not_deleted" });
}

export type EmptyScope = "guests" | "groups" | "tables" | "all";
export interface EmptyCounts {
  guests: number;
  groups: number;
  tables: number;
}

/** "3 persone e 1 gruppo" for the sections already emptied; "" when nothing was removed. */
function removedSummary(counts: EmptyCounts): string {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const parts = [
    counts.guests > 0 ? plural(counts.guests, "persona", "persone") : "",
    counts.groups > 0 ? plural(counts.groups, "gruppo", "gruppi") : "",
    counts.tables > 0 ? plural(counts.tables, "tavolo", "tavoli") : "",
  ].filter(Boolean);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} e ${parts.at(-1)}` : (parts[0] ?? "");
}

/**
 * "Svuota" (AC11), per section or all of it: physical DELETE of every soft-deleted row. People
 * first, so a group's members that were deleted go with it; live members are freed by the FKs.
 * Stops at the first failure and says so (earlier sections stay deleted: that is what was asked).
 */
export async function emptyDeleted(
  db: Db,
  input: { scope: EmptyScope },
): Promise<ActionResult<EmptyCounts>> {
  const counts: EmptyCounts = { guests: 0, groups: 0, tables: 0 };
  const sections: [keyof EmptyCounts, EmptyScope[]][] = [
    ["guests", ["guests", "all"]],
    ["groups", ["groups", "all"]],
    ["tables", ["tables", "all"]],
  ];
  const tableOf = { guests: "guests", groups: "guest_groups", tables: "guest_tables" } as const;
  for (const [section, scopes] of sections) {
    if (!scopes.includes(input.scope)) continue;
    const removed = await db
      .from(tableOf[section])
      .delete({ count: "exact" })
      .not("deleted_at", "is", null);
    if (removed.error) {
      const failed = failure(removed.error);
      const done = removedSummary(counts);
      // Earlier sections stay deleted: say what is gone and what is left, and to reload.
      return done && failed.ok === false
        ? {
            ok: false,
            code: "partial",
            message: `Ho eliminato per sempre ${done}, ma non sono riuscito a finire. Ricarica la pagina: quello che resta è ancora tra gli eliminati.`,
          }
        : failed;
    }
    counts[section] = removed.count ?? 0;
  }
  return { ok: true, data: counts };
}

// ---------------------------------------------------------------------------------------------
// Bulk actions and their Annulla (AC7, P6)
// ---------------------------------------------------------------------------------------------

/** The database refuses more than this many ids per call (REV-7); larger selections are batched. */
export const BULK_BATCH = 1000;

async function undoBatch(db: Db, previous: readonly BulkPrevious[]): Promise<ActionResult<number>> {
  const result = await db.rpc("guests_bulk_undo", {
    p_previous: previous.map((entry) => ({ ...entry })),
  });
  if (result.error) return failure(result.error, BULK_ERROR);
  const body = result.data as { restored?: unknown } | null;
  if (!body || typeof body.restored !== "number") return failure(null, BULK_ERROR);
  return { ok: true, data: body.restored };
}

const PARTIAL_BULK: ActionResult<never> = {
  ok: false,
  code: "partial",
  message: "Ne ho cambiati solo alcuni. Ricarica la pagina e controlla.",
};
const PARTIAL_UNDO: ActionResult<never> = {
  ok: false,
  code: "partial",
  message: "Ne ho ripristinati solo alcuni. Ricarica la pagina e controlla.",
};

/**
 * `guests_bulk`: the ids travel in the request body, in batches of 1000 (the per-call cap is NOT a
 * cap on the selection: "Seleziona tutti i filtrati" may be 1200). `previous` is what the database
 * changed, concatenated and handed back UNCHANGED to `undoBulk`.
 *
 * BEST EFFORT across batches (each RPC is its own transaction): if a later batch fails, the earlier
 * ones are rolled back with their own `previous`. When that rollback fails or restores fewer rows
 * (the usual cause of the first failure, a dropped connection, also breaks it; a concurrent edit
 * of those rows is skipped), the result is `partial` with a message that tells the user to reload
 * and check, never a plain "Riprova".
 */
export async function bulkGuests(
  db: Db,
  input: { ids: readonly string[]; op: BulkOp; target?: string | null },
): Promise<ActionResult<{ previous: BulkPrevious[]; changed: number }>> {
  const previous: BulkPrevious[] = [];
  let changed = 0;
  for (const ids of chunk([...new Set(input.ids)], BULK_BATCH)) {
    const result = await db.rpc("guests_bulk", {
      p_ids: ids,
      p_op: input.op,
      ...(input.target ? { p_target: input.target } : {}),
    });
    const body = result.data as { previous?: unknown; changed?: unknown } | null;
    if (
      result.error ||
      !body ||
      !Array.isArray(body.previous) ||
      typeof body.changed !== "number"
    ) {
      if (previous.length > 0) {
        const rolledBack = await undo(db, previous);
        if (!rolledBack.ok || rolledBack.data < previous.length) return PARTIAL_BULK;
      }
      return failure(result.error ?? null, BULK_ERROR);
    }
    previous.push(...(body.previous as BulkPrevious[]));
    changed += body.changed;
  }
  return { ok: true, data: { previous, changed } };
}

async function undo(db: Db, previous: readonly BulkPrevious[]): Promise<ActionResult<number>> {
  let restored = 0;
  for (const batch of chunk([...previous], BULK_BATCH)) {
    const result = await undoBatch(db, batch);
    if (!result.ok) return restored > 0 ? PARTIAL_UNDO : result;
    restored += result.data;
  }
  return { ok: true, data: restored };
}

/** "Annulla" of a bulk action: replays the batches with the `previous` received, unchanged. */
export async function undoBulk(
  db: Db,
  input: { previous: readonly BulkPrevious[] },
): Promise<ActionResult<{ restored: number }>> {
  const result = await undo(db, input.previous);
  return result.ok ? { ok: true, data: { restored: result.data } } : result;
}
