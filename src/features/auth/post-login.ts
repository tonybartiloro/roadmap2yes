import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Where a signed-in user goes (plan §4.3.4). Runs with the USER's client (their JWT): every
 * decision is taken by the DB (RLS and the RPCs), this file only orders the calls:
 *
 *   1. membership                     -> home, or resume the onboarding of the first partner;
 *   2. `accept_pending_invitation()`  -> `ok` = the inviting space (B never creates one, BR13);
 *   3. founder without a wedding      -> `create_wedding()` + onboarding;
 *   4. otherwise                      -> `/su-invito`.
 * and, over all of it, `app_metadata.r2y_must_change_code` sends to the forced code change
 * (acceptance still happens first: the change needs the membership).
 * `sync_my_email()` is retried at every access for members (idempotent) so the partner row follows
 * an Auth email changed by the app.
 */

export const ACCOUNT_FORCED_PATH = "/altro/account?obbligatorio=1";
export const ONBOARDING_PATH = "/onboarding";
export const INVITE_ONLY_PATH = "/su-invito";
export const HOME_PATH = "/";

/** `id` is the verified user id: a member can read the memberships of the whole wedding (RLS). */
export type PostLoginUser = { id: string; app_metadata?: Record<string, unknown> | null };

export type PostLoginResult = { status: "ok"; to: string } | { status: "error"; error: unknown };

type Row = { partner_slot: string | null };

async function loadMembership(db: SupabaseClient, userId: string): Promise<Row | null> {
  const { data, error } = await db
    .from("memberships")
    .select("partner_slot")
    .eq("user_id", userId)
    .limit(1);
  if (error) throw error;
  const row = (data as Row[] | null)?.[0];
  return row ?? null;
}

/** True when the signed-in user (JWT claims or user object) must change the code before anything. */
export function mustChangeCode(appMetadata: Record<string, unknown> | null | undefined): boolean {
  return appMetadata?.["r2y_must_change_code"] === true;
}

export function isFounder(appMetadata: Record<string, unknown> | null | undefined): boolean {
  return appMetadata?.["r2y_founder"] === true;
}

export async function resolvePostLogin(
  db: SupabaseClient,
  user: PostLoginUser,
): Promise<PostLoginResult> {
  try {
    let membership = await loadMembership(db, user.id);

    if (!membership) {
      const accepted = await db.rpc("accept_pending_invitation");
      if (accepted.error) throw accepted.error;
      if (accepted.data === "ok" || accepted.data === "already_member") {
        membership = await loadMembership(db, user.id);
      }
    }

    if (!membership && isFounder(user.app_metadata)) {
      const created = await db.rpc("create_wedding");
      // `already_member` / `pending_invitation` / `already_created` are answers, not outages.
      if (!created.error) membership = await loadMembership(db, user.id);
      else if (isOutage(created.error)) throw created.error;
    }

    if (!membership) return { status: "ok", to: INVITE_ONLY_PATH };

    // Idempotent; a failure here is retried at the next access.
    await db.rpc("sync_my_email").then(
      () => undefined,
      () => undefined,
    );

    if (mustChangeCode(user.app_metadata)) return { status: "ok", to: ACCOUNT_FORCED_PATH };

    if (membership.partner_slot === "A") {
      const { data } = await db.from("weddings").select("onboarding_completed_at").limit(1);
      const wedding = (data as { onboarding_completed_at: string | null }[] | null)?.[0];
      if (wedding && wedding.onboarding_completed_at === null) {
        return { status: "ok", to: ONBOARDING_PATH };
      }
    }
    return { status: "ok", to: HOME_PATH };
  } catch (error) {
    return { status: "error", error };
  }
}

/** HTTP 5xx / network / paused project; anything with a Postgres code is an application answer. */
function isOutage(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return true;
  const code = (error as { code?: unknown }).code;
  return typeof code !== "string" || code === "" || code.startsWith("PGRST00");
}
