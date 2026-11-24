import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { classifyDbError } from "@/lib/supabase/errors";

/**
 * Per-user email switches (AC52). Own row only: `notification_preferences` RLS keeps each person
 * to their own, and no row means both switches are on. Runs with the USER'S client; nothing here
 * imports Next.js.
 */
export type Db = SupabaseClient<Database>;

export type PreferenceKind = "reminders" | "digest";

export interface Preferences {
  readonly reminders: boolean;
  readonly digest: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = { reminders: true, digest: true };

export class PreferencesLoadError extends Error {
  readonly infra: "paused" | "unreachable" | null;
  constructor(what: string, cause: unknown) {
    super(`Promemoria: ${what}`, { cause });
    this.name = "PreferencesLoadError";
    this.infra = classifyDbError(cause);
  }
}

export type SaveResult =
  | { readonly ok: true; readonly preferences: Preferences }
  | {
      readonly ok: false;
      readonly code: "invalid" | "forbidden" | "unreachable" | "unknown";
      readonly message: string;
    };

const UNREACHABLE = "Non riesco a raggiungere il servizio. Controlla la connessione e riprova.";
const PAUSED = "L'app è in pausa: riprova più tardi.";
const GENERIC = "Non sono riuscito a salvare. Riprova tra un attimo.";
const FORBIDDEN = "Non puoi cambiare queste preferenze.";

function failure(error: { code?: string }): SaveResult {
  const infra = classifyDbError(error);
  if (infra === "paused") return { ok: false, code: "unreachable", message: PAUSED };
  if (infra === "unreachable") return { ok: false, code: "unreachable", message: UNREACHABLE };
  if (error.code === "42501") return { ok: false, code: "forbidden", message: FORBIDDEN };
  return { ok: false, code: "unknown", message: GENERIC };
}

/** The caller's switches, or both on when there is no row (or no wedding yet). */
export async function loadPreferences(db: Db, userId: string): Promise<Preferences> {
  const row = await db
    .from("notification_preferences")
    .select("reminders_enabled, digest_enabled")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (row.error) throw new PreferencesLoadError("preferenze", row.error);
  if (!row.data) return DEFAULT_PREFERENCES;
  return { reminders: row.data.reminders_enabled, digest: row.data.digest_enabled };
}

/**
 * Sets ONE switch of the caller and leaves the other as it is. Update first (the grant covers only
 * the two switches); without a row, insert it with the other switch at its default (on). A second
 * insert racing this one (23505) falls back to the update.
 */
export async function setPreference(
  db: Db,
  userId: string,
  kind: PreferenceKind,
  enabled: boolean,
): Promise<SaveResult> {
  const column = kind === "reminders" ? "reminders_enabled" : "digest_enabled";
  const patch = { [column]: enabled } as { reminders_enabled?: boolean; digest_enabled?: boolean };

  const updated = await db
    .from("notification_preferences")
    .update(patch)
    .eq("user_id", userId)
    .select("reminders_enabled, digest_enabled");
  if (updated.error) return failure(updated.error);
  const first = updated.data?.[0];
  if (first) {
    return {
      ok: true,
      preferences: { reminders: first.reminders_enabled, digest: first.digest_enabled },
    };
  }

  const wedding = await db.from("weddings").select("id").limit(1).maybeSingle();
  if (wedding.error) return failure(wedding.error);
  if (!wedding.data) return { ok: false, code: "forbidden", message: FORBIDDEN };
  const weddingId = wedding.data.id;

  const inserted = await db.from("notification_preferences").insert({
    user_id: userId,
    wedding_id: weddingId,
    reminders_enabled: kind === "reminders" ? enabled : true,
    digest_enabled: kind === "digest" ? enabled : true,
  });
  if (inserted.error) {
    if (inserted.error.code !== "23505") return failure(inserted.error);
    const retry = await db
      .from("notification_preferences")
      .update(patch)
      .eq("user_id", userId)
      .select("reminders_enabled, digest_enabled");
    if (retry.error) return failure(retry.error);
  }
  try {
    return { ok: true, preferences: await loadPreferences(db, userId) };
  } catch {
    return { ok: false, code: "unknown", message: GENERIC };
  }
}
