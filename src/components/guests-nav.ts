import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** Budget for the two reads; the aborted request does not outlive it. */
export const GUESTS_NAV_TIMEOUT_MS = 1500;

/**
 * Should the bar show "Invitati"? Only the NAV ITEM depends on it (the real gate is RLS and the
 * page's own "su invito" panel). It is deliberately FAIL-OPEN, unlike the guests data layer:
 * an error, a timeout, or a user with no visible wedding all resolve to `true`, so an outage never
 * hides the section by mistake (worst case: a link to the "su invito" panel). Only an explicit
 * "no" from `has_permission` hides it. Named apart from the guests data functions on purpose.
 */
export async function shouldShowGuestsNav(
  db: SupabaseClient<Database>,
  timeoutMs: number = GUESTS_NAV_TIMEOUT_MS,
): Promise<boolean> {
  try {
    const signal = AbortSignal.timeout(timeoutMs);
    const { data: wedding, error } = await db
      .from("weddings")
      .select("id")
      .abortSignal(signal)
      .limit(1)
      .maybeSingle();
    // No visible wedding: nothing to decide on, so the item stays (see the fail-open note above).
    if (error || !wedding) return true;
    const { data, error: rpcError } = await db
      .rpc("has_permission", { p_wedding_id: wedding.id, p_area: "guests", p_action: "read" })
      .abortSignal(signal);
    return rpcError ? true : data === true;
  } catch {
    return true;
  }
}
