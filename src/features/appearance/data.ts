import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { classifyDbError } from "@/lib/supabase/errors";
import { isApprovedThemeId } from "@/themes/approved";

/**
 * Write of the wedding theme (AC49). Runs with the USER'S client: `weddings.theme_id` has a column
 * grant and the `weddings_update` policy decides who may write it. Nothing here imports Next.js.
 */
export type Db = SupabaseClient<Database>;

export type SaveThemeResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: "invalid" | "forbidden" | "unreachable" | "unknown";
      readonly message: string;
    };

const UNREACHABLE = "Non riesco a raggiungere il servizio. Controlla la connessione e riprova.";
const PAUSED = "L'app è in pausa: riprova più tardi.";
const FORBIDDEN = "Non hai il permesso di cambiare il tema.";
const GENERIC = "Non sono riuscito a salvare il tema. Riprova.";

/**
 * Saves the theme on the wedding of the caller (RLS shows only that one). Last write wins: a theme
 * is a single value without a "your draft vs theirs" to compare, so no version check. Only fixed
 * messages leave this function (allowlist, never the database text).
 */
export async function saveTheme(db: Db, themeId: string): Promise<SaveThemeResult> {
  if (!isApprovedThemeId(themeId)) {
    return { ok: false, code: "invalid", message: GENERIC };
  }
  const wedding = await db.from("weddings").select("id").limit(1).maybeSingle();
  if (wedding.error) return failure(wedding.error);
  if (!wedding.data) return { ok: false, code: "forbidden", message: FORBIDDEN };

  const updated = await db
    .from("weddings")
    .update({ theme_id: themeId })
    .eq("id", wedding.data.id)
    .select("id");
  if (updated.error) return failure(updated.error);
  // RLS refusing a write is not an error for PostgREST: it simply touches no row.
  if (!updated.data || updated.data.length === 0) {
    return { ok: false, code: "forbidden", message: FORBIDDEN };
  }
  return { ok: true };
}

function failure(error: { code?: string }): SaveThemeResult {
  const infra = classifyDbError(error);
  if (infra === "paused") return { ok: false, code: "unreachable", message: PAUSED };
  if (infra === "unreachable") return { ok: false, code: "unreachable", message: UNREACHABLE };
  if (error.code === "42501") return { ok: false, code: "forbidden", message: FORBIDDEN };
  return { ok: false, code: "unknown", message: GENERIC };
}
