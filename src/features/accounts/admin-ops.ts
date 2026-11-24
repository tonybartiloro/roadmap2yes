import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyDbError, type DbErrorKind } from "@/lib/supabase/errors";

/**
 * Operations on Auth accounts that need the SECRET key (plan §4.8). One of the 4 lint-allowed
 * scopes for `lib/supabase/admin.ts`. THE RULE, for every operation here and every one T7b adds:
 *   1. the DB first, with the USER's JWT (`userDb`): the RPC re-checks the state, writes the account
 *      event and returns the target;
 *   2. then the admin call, ONLY on the id that step returned (never an id found by email, never
 *      a `wedding_partners.user_id` read separately);
 *   3. the caller has already verified the CURRENT code (`features/auth/login.ts`
 *      `verifyCurrentCode`, under the limiter) for the operations that need it.
 * The code is never logged or returned.
 *
 * Own-account operations (T7a): `changeOwnCode`, `changeOwnEmail`. T7b extends this file with the
 * partner operations (create/update/delete pending, temporary code) following the same pattern.
 */

/** The user's cookie client, seen through the only method used here. */
export type UserRpc = {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

/** Failure kinds shared by the account operations (the UI maps them to texts). */
export type AccountOpError =
  "unauthenticated" | "not_partner" | "same_email" | "email_in_use" | "unavailable" | "failed";

export type AccountOpResult<T extends object = object> =
  ({ ok: true } & T) | { ok: false; error: AccountOpError; kind?: DbErrorKind };

type Authorization = {
  allowed?: boolean;
  error?: string;
  target_user_id?: string;
  target_email?: string;
  new_email?: string;
};

const KNOWN_DENIALS: readonly AccountOpError[] = [
  "unauthenticated",
  "not_partner",
  "same_email",
  "email_in_use",
];

function denial(auth: Authorization): AccountOpResult<never> {
  const error = KNOWN_DENIALS.find((known) => known === auth.error);
  return { ok: false, error: error ?? "failed" };
}

async function authorize(
  userDb: UserRpc,
  args: Record<string, unknown>,
): Promise<{ auth: Authorization } | { fail: AccountOpResult<never> }> {
  let response;
  try {
    response = await userDb.rpc("authorize_account_op", args);
  } catch (error) {
    const kind = classifyDbError(error);
    return {
      fail: { ok: false, error: kind ? "unavailable" : "failed", ...(kind ? { kind } : {}) },
    };
  }
  if (response.error) {
    const kind = classifyDbError(response.error);
    return {
      fail: { ok: false, error: kind ? "unavailable" : "failed", ...(kind ? { kind } : {}) },
    };
  }
  return { auth: (response.data ?? {}) as Authorization };
}

/**
 * Changes the caller's OWN access code (AC56): step 1 `authorize_account_op('change_own_code')`
 * (event `code_changed` written BEFORE), step 2 ONE admin call that sets the code and clears the
 * forced-change flag together (`app_metadata` is merged by Auth: `r2y_founder`/`r2y_role` stay).
 * The admin update closes the user's existing sessions: the caller signs in again afterwards.
 *
 * `selfId` is the id from the verified JWT. A user without membership (`not_partner`: there is no
 * wedding to record an event in) may still change THEIR OWN code, on their own id only.
 */
export async function changeOwnCode(
  userDb: UserRpc,
  selfId: string,
  newCode: string,
): Promise<AccountOpResult<{ userId: string }>> {
  const step1 = await authorize(userDb, { p_op: "change_own_code" });
  if ("fail" in step1) return step1.fail;

  let target = selfId;
  if (step1.auth.allowed === true) {
    if (step1.auth.target_user_id !== selfId) return { ok: false, error: "failed" };
    target = step1.auth.target_user_id;
  } else if (step1.auth.error !== "not_partner") {
    return denial(step1.auth);
  }

  try {
    const { error } = await createAdminClient().auth.admin.updateUserById(target, {
      password: newCode,
      app_metadata: { r2y_must_change_code: false },
    });
    if (error) {
      const kind = classifyDbError(error);
      return { ok: false, error: kind ? "unavailable" : "failed", ...(kind ? { kind } : {}) };
    }
  } catch (error) {
    const kind = classifyDbError(error);
    return { ok: false, error: kind ? "unavailable" : "failed", ...(kind ? { kind } : {}) };
  }
  return { ok: true, userId: target };
}

/**
 * Changes the caller's OWN login email (AC58): step 1 `authorize_account_op('change_own_email')`
 * (`email_in_use`, `same_email`; event `email_changed` BEFORE), step 2 the admin call with
 * `email_confirm: true`, so no confirmation email is needed and it works without any email
 * provider. Returns the previous address (for the notice) and the new one. The caller then runs
 * `sync_my_email()` (and `post-login` retries it at every access if that fails).
 */
export async function changeOwnEmail(
  userDb: UserRpc,
  selfId: string,
  newEmail: string,
): Promise<AccountOpResult<{ userId: string; oldEmail: string | null; newEmail: string }>> {
  const step1 = await authorize(userDb, { p_op: "change_own_email", p_new_email: newEmail });
  if ("fail" in step1) return step1.fail;
  const { auth } = step1;
  if (auth.allowed !== true) return denial(auth);
  if (auth.target_user_id !== selfId || !auth.new_email) return { ok: false, error: "failed" };

  try {
    const { error } = await createAdminClient().auth.admin.updateUserById(auth.target_user_id, {
      email: auth.new_email,
      email_confirm: true,
    });
    if (error) {
      const kind = classifyDbError(error);
      if (kind) return { ok: false, error: "unavailable", kind };
      const code = (error as { code?: string }).code;
      return { ok: false, error: code === "email_exists" ? "email_in_use" : "failed" };
    }
  } catch (error) {
    const kind = classifyDbError(error);
    return { ok: false, error: kind ? "unavailable" : "failed", ...(kind ? { kind } : {}) };
  }
  return {
    ok: true,
    userId: auth.target_user_id,
    oldEmail: auth.target_email ?? null,
    newEmail: auth.new_email,
  };
}
