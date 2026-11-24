import "server-only";
import {
  createClient as createSupabaseClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import {
  readLoginLimits,
  readSupabasePublicConfig,
  readSupabaseSecretKey,
  type LoginLimits,
} from "@/lib/app-config";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyDbError, type DbErrorKind } from "@/lib/supabase/errors";
import { emailLimiterKey, ipLimiterKey } from "./limiter-keys";

/**
 * Password login with the application limiter (plan §4.3). One function for the three callers
 * (sign in, verification of the CURRENT code before changing it, recovery) so the order is always:
 *   login_gate -> signInWithPassword -> login_record
 * `login_record` is called ONLY when the gate was open (a blocked attempt writes no row, so random
 * emails leave nothing behind). Imports the secret-key client: it is one of the lint-allowed scopes.
 */

export type LoginOutcome =
  | { status: "ok"; user: User }
  | { status: "blocked" }
  | { status: "invalid" }
  | { status: "unavailable"; kind: DbErrorKind | null };

/** The only part of a Supabase client the login needs (the user's cookie client or a throwaway one). */
type PasswordAuth = Pick<SupabaseClient["auth"], "signInWithPassword">;

type LimiterRpc = {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

export type LoginDeps = {
  limiter: LimiterRpc;
  secret: string;
  limits: LoginLimits;
};

function defaultDeps(): LoginDeps {
  return {
    limiter: createAdminClient() as unknown as LimiterRpc,
    secret: readSupabaseSecretKey(),
    limits: readLoginLimits(),
  };
}

function isBlocked(data: unknown): boolean {
  return (
    typeof data === "object" && data !== null && (data as { blocked?: unknown }).blocked === true
  );
}

function isRateLimited(error: { status?: number; code?: string }): boolean {
  return error.status === 429 || error.code === "over_request_rate_limit";
}

function isWrongCredentials(error: { status?: number; code?: string }): boolean {
  return (
    error.code === "invalid_credentials" ||
    error.code === "email_not_confirmed" ||
    error.code === "user_banned" ||
    error.code === "validation_failed" ||
    error.status === 400 ||
    error.status === 401 ||
    error.status === 422
  );
}

export async function limitedPasswordLogin(
  auth: PasswordAuth,
  input: { email: string; code: string; ip: string | null },
  deps: LoginDeps = defaultDeps(),
): Promise<LoginOutcome> {
  const emailKey = emailLimiterKey(deps.secret, input.email);
  const ipKey = ipLimiterKey(deps.secret, input.ip);

  const gate = await deps.limiter.rpc("login_gate", { p_email_key: emailKey, p_ip_key: ipKey });
  if (gate.error) return { status: "unavailable", kind: classifyDbError(gate.error) };
  if (isBlocked(gate.data)) return { status: "blocked" };

  let result;
  try {
    result = await auth.signInWithPassword({ email: input.email, password: input.code });
  } catch (error) {
    return { status: "unavailable", kind: classifyDbError(error) };
  }

  const record = (success: boolean) =>
    deps.limiter.rpc("login_record", {
      p_email_key: emailKey,
      p_ip_key: ipKey,
      p_success: success,
      p_max_email: deps.limits.maxFailuresPerEmail,
      p_max_ip: deps.limits.maxFailuresPerIp,
      p_window_minutes: deps.limits.windowMinutes,
      p_lock_minutes: deps.limits.lockMinutes,
    });

  if (!result.error && result.data.user) {
    // A success never shortens an active block (the DB decides); a failure to record is not fatal.
    await record(true);
    return { status: "ok", user: result.data.user };
  }

  const error = result.error ?? { status: 400 };
  if (isRateLimited(error)) return { status: "blocked" };
  const kind = classifyDbError(error);
  if (kind) return { status: "unavailable", kind };
  if (isWrongCredentials(error)) {
    await record(false);
    return { status: "invalid" };
  }
  return { status: "unavailable", kind: null };
}

/** A client with no cookies and no persistence: its session is thrown away after the check. */
export function createThrowawayClient(): SupabaseClient {
  const { url, publishableKey } = readSupabasePublicConfig();
  return createSupabaseClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

/**
 * Verifies the CURRENT access code of the signed-in user before an account change (plan §4.5.3),
 * under the same limiter as the login. The verification session is closed straight away, so no
 * extra live session is left behind.
 */
export async function verifyCurrentCode(
  input: { email: string; code: string; ip: string | null },
  deps?: LoginDeps,
): Promise<LoginOutcome> {
  const probe = createThrowawayClient();
  const outcome = await limitedPasswordLogin(probe.auth, input, deps);
  if (outcome.status === "ok") {
    try {
      await probe.auth.signOut({ scope: "local" });
    } catch {
      // The probe session is isolated and expires by itself.
    }
  }
  return outcome;
}
