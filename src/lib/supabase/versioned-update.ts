import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables, TablesUpdate } from "./database.types";

/**
 * Optimistic concurrency (plan §9, AC40, BR9).
 *
 * Every versioned table has `version` (bumped by the `bump_version` trigger on each UPDATE),
 * `updated_at` and `updated_by`. `versionedUpdate` writes only when the row still has the version
 * the user was looking at; otherwise nothing is written and the caller gets the current row plus
 * who changed it and when, to show the conflict dialog ("Jessica ha modificato questo elemento
 * 2 minuti fa": view changes / save anyway / cancel).
 *
 * "Save anyway" = call again with `current.version` as `expectedVersion`.
 * It runs with the user's JWT, so RLS and column grants still apply: this helper never widens
 * what a user can write.
 */

type TableName = keyof Database["public"]["Tables"];

/** Tables whose rows carry the concurrency columns (extends itself as T8/T9 add tables). */
export type VersionedTable = {
  [T in TableName]: Tables<T> extends {
    id: string;
    version: number;
    updated_at: string;
    updated_by: string | null;
  }
    ? T
    : never;
}[TableName];

/** The patch can never carry the concurrency columns or the immutable ones. */
export type VersionedPatch<T extends VersionedTable> = Omit<
  TablesUpdate<T>,
  "id" | "version" | "wedding_id" | "created_at" | "created_by" | "updated_at" | "updated_by"
>;

export type VersionedUpdateResult<T extends VersionedTable> =
  | { conflict: false; row: Tables<T> }
  | {
      conflict: true;
      /** Current row, or `null` when it no longer exists or is not visible to the caller. */
      current: Tables<T> | null;
      /** `updated_by` of the current row (user id), `null` if unknown. */
      changedBy: string | null;
      /** `updated_at` of the current row (ISO), `null` if unknown. */
      changedAt: string | null;
    };

/** A failure that is NOT a version conflict (RLS/grant refusal, constraint, network). */
export class VersionedUpdateError extends Error {
  readonly code: string | undefined;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "VersionedUpdateError";
    this.code = code;
  }
}

type QueryResult = Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
// supabase-js cannot type a table name known only at runtime: this is the narrow shape we use.
type LooseClient = {
  from: (table: string) => {
    update: (patch: unknown) => {
      eq: (
        column: string,
        value: unknown,
      ) => { eq: (column: string, value: unknown) => { select: () => { maybeSingle: () => QueryResult } } };
    };
    select: () => { eq: (column: string, value: unknown) => { maybeSingle: () => QueryResult } };
  };
};

export async function versionedUpdate<T extends VersionedTable>(
  client: SupabaseClient<Database>,
  table: T,
  id: string,
  expectedVersion: number,
  patch: VersionedPatch<T>,
): Promise<VersionedUpdateResult<T>> {
  const db = client as unknown as LooseClient;

  const updated = await db
    .from(table)
    .update(patch)
    .eq("id", id)
    .eq("version", expectedVersion)
    .select()
    .maybeSingle();
  if (updated.error) throw new VersionedUpdateError(updated.error.message, updated.error.code);
  if (updated.data) return { conflict: false, row: updated.data as Tables<T> };

  // Zero rows: stale version, or row missing/not visible. Look at the current state.
  const latest = await db.from(table).select().eq("id", id).maybeSingle();
  if (latest.error) throw new VersionedUpdateError(latest.error.message, latest.error.code);
  const current = (latest.data as Tables<T> | null) ?? null;
  return {
    conflict: true,
    current,
    changedBy: current?.updated_by ?? null,
    changedAt: current?.updated_at ?? null,
  };
}
