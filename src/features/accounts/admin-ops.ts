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
 * Own-account operations (T7a): `changeOwnCode`, `changeOwnEmail`. Partner operations (T7b):
 * `createPartnerWithCode`, `createPartnerForEmailInvite`, `updatePendingPartnerEmail`,
 * `revokePartnerInvitation`, `setTemporaryCode`, and the two token operations of the public
 * `/invito/[token]` page (`peekInviteToken`, `consumeInviteToken`: step 1 is `invitation_by_token`,
 * which only the SECRET key can run, so there is no user JWT there). Orchestration (tokens, emails,
 * texts) lives in `features/invitations`.
 */

/** The user's cookie client, seen through the only method used here. */
export type UserRpc = {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

/** Failure kinds shared by the account operations (the UI maps them to texts). */
export type AccountOpError =
  | "unauthenticated"
  | "not_partner"
  | "same_email"
  | "email_in_use"
  | "partner_already_joined"
  | "invitation_pending"
  | "partner_email_mismatch"
  | "no_pending_partner"
  | "already_accepted"
  | "no_account"
  | "self_target"
  | "unavailable"
  | "failed";

export type AccountOpFailure = { ok: false; error: AccountOpError; kind?: DbErrorKind };

export type AccountOpResult<T extends object = object> = ({ ok: true } & T) | AccountOpFailure;

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
  "no_account",
  "self_target",
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

// ------------------------------------------------------------------------------------------------
// Partner operations (T7b). Same rule: DB first (user JWT), admin only on the id the DB returned.
// ------------------------------------------------------------------------------------------------

function failureOf(error: unknown): AccountOpFailure {
  const kind = classifyDbError(error);
  return { ok: false, error: kind ? "unavailable" : "failed", ...(kind ? { kind } : {}) };
}

/** Raise messages of the T2 RPCs that the UI tells apart; anything else is a plain failure. */
const RPC_MESSAGES: Readonly<Record<string, AccountOpError>> = {
  email_in_use: "email_in_use",
  same_email: "same_email",
  partner_already_joined: "partner_already_joined",
  invitation_pending: "invitation_pending",
  partner_email_mismatch: "partner_email_mismatch",
  no_pending_partner: "no_pending_partner",
  already_accepted: "already_accepted",
  forbidden: "not_partner",
  unauthenticated: "unauthenticated",
};

type Row = Record<string, unknown>;
export type DbStep = { ok: true; data: Row } | { ok: false; failure: AccountOpFailure };

/** Step 1 of an operation: an RPC with the USER's JWT (the DB locks, rechecks, writes the event). */
export async function dbStep(
  userDb: UserRpc,
  fn: string,
  args: Record<string, unknown>,
): Promise<DbStep> {
  let response;
  try {
    response = await userDb.rpc(fn, args);
  } catch (error) {
    return { ok: false, failure: failureOf(error) };
  }
  if (response.error) {
    const kind = classifyDbError(response.error);
    if (kind) return { ok: false, failure: { ok: false, error: "unavailable", kind } };
    const message = (response.error as { message?: unknown }).message;
    const known = typeof message === "string" ? RPC_MESSAGES[message] : undefined;
    return { ok: false, failure: { ok: false, error: known ?? "failed" } };
  }
  const data = response.data;
  return { ok: true, data: typeof data === "object" && data !== null ? (data as Row) : {} };
}

const str = (value: unknown): string | null => (typeof value === "string" ? value : null);

function adminErrorCode(error: unknown): string | undefined {
  return (error as { code?: string } | null)?.code;
}

function isCreateRace(error: unknown): boolean {
  if (adminErrorCode(error) === "email_exists") return true;
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" && /database error creating new user/i.test(message);
}

type Invitation = { id: string; inviteeUserId: string | null; expiresAt: string | null };

function readInvitation(data: Row): Invitation | null {
  const id = str(data["id"]);
  return id
    ? { id, inviteeUserId: str(data["invitee_user_id"]), expiresAt: str(data["expires_at"]) }
    : null;
}

/**
 * Creates (or re-delivers) partner B's access (plan §4.5, §4.8). Step 1 `create_invitation` (invitation
 * row + event first; `email_in_use` unless the account is reusable); step 2 admin: `createUser` for a
 * new address (then BIND it with a second `create_invitation(…, new_id)`), or `updateUserById` on the
 * reusable account the DB returned. An "already registered" race gets ONE new attempt from step 1.
 * `password` null = the account has no code yet (invite by email: B chooses it at the link).
 */
async function createPartnerAccount(
  userDb: UserRpc,
  input: {
    email: string;
    method: "code" | "email";
    tokenHash: string | null;
    password: string | null;
  },
): Promise<AccountOpResult<{ invitationId: string; userId: string; expiresAt: string | null }>> {
  const hash = input.tokenHash === null ? {} : { p_token_hash: input.tokenHash };
  const base = { p_email: input.email, p_method: input.method, ...hash };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const step1 = await dbStep(userDb, "create_invitation", base);
    if (!step1.ok) return step1.failure;
    const invitation = readInvitation(step1.data);
    if (!invitation) return { ok: false, error: "failed" };

    try {
      const admin = createAdminClient().auth.admin;
      if (invitation.inviteeUserId) {
        if (input.password !== null) {
          const { error } = await admin.updateUserById(invitation.inviteeUserId, {
            password: input.password,
          });
          if (error) return failureOf(error);
        }
        return {
          ok: true,
          invitationId: invitation.id,
          userId: invitation.inviteeUserId,
          expiresAt: invitation.expiresAt,
        };
      }

      const created = await admin.createUser({
        email: input.email,
        email_confirm: true,
        ...(input.password === null ? {} : { password: input.password }),
      });
      if (created.error || !created.data.user) {
        // Somebody created the address a moment ago: start again, the DB now finds the account.
        // (Under a true race GoTrue answers 500 "Database error creating new user" for the unique
        // violation instead of `email_exists`; a second look from step 1 settles either case.)
        if (isCreateRace(created.error) && attempt === 0) continue;
        return failureOf(created.error);
      }
      const newId = created.data.user.id;

      // Bind the new account to the invitation (not a new delivery: no event, no count).
      const bound = await dbStep(userDb, "create_invitation", {
        ...base,
        p_invitee_user_id: newId,
      });
      if (!bound.ok) return bound.failure;
      const rebound = readInvitation(bound.data);
      if (!rebound || rebound.inviteeUserId !== newId) return { ok: false, error: "failed" };
      return { ok: true, invitationId: rebound.id, userId: newId, expiresAt: rebound.expiresAt };
    } catch (error) {
      return failureOf(error);
    }
  }
  return { ok: false, error: "failed" };
}

/** B's access with an initial code that A hands over in person (always available, AC5). */
export function createPartnerWithCode(
  userDb: UserRpc,
  input: { email: string; code: string },
): Promise<AccountOpResult<{ invitationId: string; userId: string }>> {
  return createPartnerAccount(userDb, {
    email: input.email,
    method: "code",
    tokenHash: null,
    password: input.code,
  });
}

/** B's access for an invite by email: the account has no code, B chooses it at `/invito/[token]`. */
export function createPartnerForEmailInvite(
  userDb: UserRpc,
  input: { email: string; tokenHash: string },
): Promise<AccountOpResult<{ invitationId: string; userId: string; expiresAt: string | null }>> {
  return createPartnerAccount(userDb, {
    email: input.email,
    method: "email",
    tokenHash: input.tokenHash,
    password: null,
  });
}

/**
 * A changes B's email while B has never entered (AC58). Step 1 `update_partner_email` (refuses
 * `partner_already_joined` / `email_in_use`, returns the bound account and the previous address);
 * step 2 `updateUserById(target, { email, email_confirm: true })`. If step 2 fails the DB is put back
 * with a second `update_partner_email(old_email)`; if even that fails, repeating the change converges
 * (both steps are idempotent).
 */
export async function updatePendingPartnerEmail(
  userDb: UserRpc,
  newEmail: string,
): Promise<AccountOpResult<{ targetUserId: string | null; oldEmail: string }>> {
  const step1 = await dbStep(userDb, "update_partner_email", { p_slot: "B", p_email: newEmail });
  if (!step1.ok) return step1.failure;
  const targetUserId = str(step1.data["target_user_id"]);
  const oldEmail = str(step1.data["old_email"]);
  if (!oldEmail) return { ok: false, error: "failed" };

  if (targetUserId) {
    let failure: AccountOpFailure | null = null;
    try {
      const { error } = await createAdminClient().auth.admin.updateUserById(targetUserId, {
        email: newEmail,
        email_confirm: true,
      });
      if (error) {
        failure =
          adminErrorCode(error) === "email_exists"
            ? { ok: false, error: "email_in_use" }
            : failureOf(error);
      }
    } catch (error) {
      failure = failureOf(error);
    }
    if (failure) {
      if (oldEmail !== newEmail) {
        // Compensation: the DB goes back to the address the account still has.
        await dbStep(userDb, "update_partner_email", { p_slot: "B", p_email: oldEmail });
      }
      return failure;
    }
  }
  return { ok: true, targetUserId, oldEmail };
}

/**
 * Revokes the pending invitation and removes the never-used account (plan §4.5.1, §4.8). Step 1
 * `revoke_invitation` (idempotent, `already_accepted` once B is in; returns `delete_user_id` only
 * while that account is still reusable); step 2 `deleteUser` on that id and no other. Repeating the
 * revoke after a failed step 2 returns the id again and completes.
 */
export async function revokePartnerInvitation(
  userDb: UserRpc,
  invitationId: string,
): Promise<AccountOpResult<{ deletedUserId: string | null }>> {
  const step1 = await dbStep(userDb, "revoke_invitation", { p_invitation_id: invitationId });
  if (!step1.ok) return step1.failure;
  const deleteId = str(step1.data["delete_user_id"]);
  if (deleteId) {
    try {
      const { error } = await createAdminClient().auth.admin.deleteUser(deleteId);
      if (error && adminErrorCode(error) !== "user_not_found") return failureOf(error);
    } catch (error) {
      return failureOf(error);
    }
  }
  return { ok: true, deletedUserId: deleteId };
}

/**
 * Temporary code for the OTHER partner (AC57): step 1 `authorize_account_op('set_temp_code')` (event
 * `temp_code_set` BEFORE; target = the other member, or the pending invitee while reusable); step 2
 * one admin call that sets the code and the forced-change flag (`app_metadata` is merged, so
 * `r2y_founder`/`r2y_role` stay). The update also closes every session of the target.
 */
export async function setTemporaryCode(
  userDb: UserRpc,
  code: string,
): Promise<AccountOpResult<{ targetUserId: string; targetEmail: string | null }>> {
  const step1 = await authorize(userDb, { p_op: "set_temp_code" });
  if ("fail" in step1) return step1.fail;
  const { auth } = step1;
  if (auth.allowed !== true) return denial(auth);
  if (!auth.target_user_id) return { ok: false, error: "failed" };

  try {
    const { error } = await createAdminClient().auth.admin.updateUserById(auth.target_user_id, {
      password: code,
      app_metadata: { r2y_must_change_code: true },
    });
    if (error) return failureOf(error);
  } catch (error) {
    return failureOf(error);
  }
  return { ok: true, targetUserId: auth.target_user_id, targetEmail: auth.target_email ?? null };
}

// ----------------------------------------------------------------------- `/invito/[token]` (no JWT)

type TokenCheck =
  | { ok: true; invitationId: string; userId: string }
  | { ok: false; error: "invalid_link" | "unavailable" | "failed"; kind?: DbErrorKind };

/** Step 1 of the link: `invitation_by_token` (secret key only). One neutral answer for every bad link. */
async function checkToken(tokenHash: string): Promise<TokenCheck> {
  try {
    const { data, error } = await createAdminClient().rpc("invitation_by_token", {
      p_token_hash: tokenHash,
    });
    if (error) {
      const kind = classifyDbError(error);
      return kind ? { ok: false, error: "unavailable", kind } : { ok: false, error: "failed" };
    }
    const row = (data ?? {}) as Row;
    const invitationId = str(row["invitation_id"]);
    const userId = str(row["user_id"]);
    if (row["ok"] !== true || !invitationId || !userId) return { ok: false, error: "invalid_link" };
    return { ok: true, invitationId, userId };
  } catch (error) {
    const kind = classifyDbError(error);
    return kind ? { ok: false, error: "unavailable", kind } : { ok: false, error: "failed" };
  }
}

export type InvitePeek =
  | { ok: true; inviterName: string | null; maskedEmail: string | null }
  | { ok: false; error: "invalid_link" | "unavailable" | "failed" };

/** `a***@host`: enough to recognise the address, not enough to read it. */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 1) return "***";
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}

/**
 * GET of the link: changes NOTHING (mail scanners open links). Says whether it is usable, who invited
 * (first name or label of partner A) and a masked address. The reads are by ids the DB returned.
 */
export async function peekInviteToken(tokenHash: string): Promise<InvitePeek> {
  const checked = await checkToken(tokenHash);
  if (!checked.ok) return { ok: false, error: checked.error };
  try {
    const admin = createAdminClient();
    const invitation = await admin
      .from("invitations")
      .select("wedding_id, email")
      .eq("id", checked.invitationId)
      .maybeSingle();
    const weddingId = invitation.data?.wedding_id;
    let inviterName: string | null = null;
    if (weddingId) {
      const inviter = await admin
        .from("wedding_partners")
        .select("first_name, label")
        .eq("wedding_id", weddingId)
        .eq("slot", "A")
        .maybeSingle();
      inviterName = inviter.data?.first_name?.trim() || inviter.data?.label?.trim() || null;
    }
    const email = invitation.data?.email;
    return {
      ok: true,
      inviterName,
      maskedEmail: typeof email === "string" ? maskEmail(email) : null,
    };
  } catch {
    return { ok: true, inviterName: null, maskedEmail: null };
  }
}

export type InviteConsume =
  | { ok: true; userId: string; email: string }
  | { ok: false; error: "invalid_link" | "unavailable" | "failed" }
  | { ok: false; error: "policy"; message: string };

/**
 * POST of the link: B chooses the code. Step 1 `invitation_by_token` (pending, not expired, account
 * still reusable) → `{ user_id }`; step 2 `updateUserById(user_id, { password })`, only on that id.
 * `checkCode(email)` runs between the two (the policy needs the account's email) and returns an
 * error text or null. Nothing is consumed here: the invitation is accepted by the sign-in that
 * follows (`accept_pending_invitation`), after which the link no longer works; if anything fails
 * before that, the link still works and repeating converges.
 */
export async function consumeInviteToken(
  tokenHash: string,
  code: string,
  checkCode: (email: string) => string | null,
): Promise<InviteConsume> {
  const checked = await checkToken(tokenHash);
  if (!checked.ok) return { ok: false, error: checked.error };
  try {
    const admin = createAdminClient().auth.admin;
    const found = await admin.getUserById(checked.userId);
    const email = found.data.user?.email;
    if (found.error || !email) return { ok: false, error: "failed" };
    const refused = checkCode(email);
    if (refused) return { ok: false, error: "policy", message: refused };
    const { error } = await admin.updateUserById(checked.userId, { password: code });
    if (error) {
      const kind = classifyDbError(error);
      return { ok: false, error: kind ? "unavailable" : "failed" };
    }
    return { ok: true, userId: checked.userId, email };
  } catch (error) {
    return { ok: false, error: classifyDbError(error) ? "unavailable" : "failed" };
  }
}
