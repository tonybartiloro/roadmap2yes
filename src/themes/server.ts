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

/** Budget of the WHOLE lookup (client creation, claims, query) so a hanging backend never blocks the first byte (DES-16). */
export const LOOKUP_TIMEOUT_MS = 1500;
export const BACKEND_HEADER = "x-r2y-backend";

/** Resolves with `fallback` when `promise` is not settled within `ms` (or rejects). Never rejects. */
export async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  try {
    return await Promise.race([promise.catch(() => fallback), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

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
 * The proxy sets `x-r2y-backend` on the outage rewrite to `/servizio` (and strips client-sent
 * copies): with it present the database is not touched at all. Otherwise the whole lookup runs
 * under one timeout race.
 */
export async function getActiveThemeId(
  lookup: WeddingThemeLookup = lookupWeddingThemeFromDb,
): Promise<string> {
  let fromCookie: string | undefined;
  let backendDown = false;
  try {
    fromCookie = (await cookies()).get(THEME_COOKIE)?.value;
    backendDown = (await headers()).has(BACKEND_HEADER);
  } catch {
    return DEFAULT_THEME_ID;
  }
  const fromDb = backendDown
    ? null
    : await withTimeout(
        Promise.resolve().then(() => lookup()),
        LOOKUP_TIMEOUT_MS,
        null,
      );
  return resolveThemeId(fromDb, fromCookie);
}
