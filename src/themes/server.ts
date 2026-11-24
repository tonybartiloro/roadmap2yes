import "server-only";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_THEME_ID, THEME_COOKIE, isApprovedThemeId, resolveThemeId } from "./approved";

/**
 * Where the wedding's theme comes from (DB). Kept behind a function type so T2/T10 can replace
 * the implementation (e.g. a typed query) without touching the layout. It must NEVER throw: a
 * failure means "unknown" (null) and the fallback chain continues.
 */
export type WeddingThemeLookup = () => Promise<string | null>;

/** Timeout so a hanging database never blocks the first byte (DES-16). */
const LOOKUP_TIMEOUT_MS = 1500;

/**
 * Default lookup: `weddings.theme_id` of the signed-in user through RLS (a user belongs to one
 * wedding). No session, an outage, a missing table or any error resolve to `null`.
 */
export const lookupWeddingThemeFromDb: WeddingThemeLookup = async () => {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims) return null;
    const { data: row, error } = await supabase
      .from("weddings")
      .select("theme_id")
      .abortSignal(AbortSignal.timeout(LOOKUP_TIMEOUT_MS))
      .limit(1)
      .maybeSingle();
    if (error) return null; // outage or application error: both fall back safely
    const themeId = (row as { theme_id?: unknown } | null)?.theme_id;
    return isApprovedThemeId(themeId) ? themeId : null;
  } catch {
    return null;
  }
};

/**
 * Active theme id for the root layout: DB, else the `r2y-theme` cookie, else "giardino".
 * The proxy marks outage rewrites with `x-r2y-backend` when it can; in that case (and on the
 * `/servizio` page) the database is not touched at all.
 */
export async function getActiveThemeId(
  lookup: WeddingThemeLookup = lookupWeddingThemeFromDb,
): Promise<string> {
  let fromCookie: string | undefined;
  let backendDown = false;
  try {
    fromCookie = (await cookies()).get(THEME_COOKIE)?.value;
    backendDown = (await headers()).has("x-r2y-backend");
  } catch {
    return DEFAULT_THEME_ID;
  }
  const fromDb = backendDown ? null : await lookup().catch(() => null);
  return resolveThemeId(fromDb, fromCookie);
}
