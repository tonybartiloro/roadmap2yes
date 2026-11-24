import { normalizeEmail, readBootstrapConfig, type Env } from "@/lib/app-config";
import { validateAccessCode } from "@/lib/access-code";

/**
 * First user from `R2Y_BOOTSTRAP_*` (plan §4.2, AC55). CREATE-ONLY and idempotent:
 * - a missing variable: nothing happens;
 * - an invalid configuration: a configuration error naming only the VARIABLE, nothing is created;
 * - an existing user (found with `auth_user_id_by_email`, the only caller of that RPC): nothing
 *   happens, so a code changed in the app is never overwritten;
 * - a concurrent request that created the user first ("already registered") counts as success.
 * No value (email, code, role) is ever logged or returned. It is one of the lint-allowed scopes
 * for the secret-key client. The client is loaded lazily and can be injected, so `npm run
 * bootstrap` (plain Node, where `server-only` would throw) passes its own and never loads
 * `lib/supabase/admin.ts`. Only call it from server code.
 */

export type BootstrapResult =
  | { status: "absent" }
  | { status: "invalid-config" }
  | { status: "created" }
  | { status: "exists" }
  | { status: "failed" };

type AdminLike = {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
  auth: {
    admin: {
      createUser(attributes: {
        email: string;
        password: string;
        email_confirm: boolean;
        app_metadata: Record<string, unknown>;
      }): PromiseLike<{ error: { status?: number; code?: string } | null }>;
    };
  };
};

/** True when the typed email is the bootstrap one (normalized comparison). */
export function isBootstrapEmail(email: string, env: Env = process.env): boolean {
  const config = readBootstrapConfig(env);
  if (config.status === "ok") return config.email === normalizeEmail(email);
  const raw = env["R2Y_BOOTSTRAP_EMAIL"];
  return config.status === "invalid" && !!raw && normalizeEmail(raw) === normalizeEmail(email);
}

function alreadyRegistered(error: { status?: number; code?: string }): boolean {
  return error.code === "email_exists" || error.code === "user_already_exists";
}

export async function ensureBootstrapUser(
  env: Env = process.env,
  injected?: AdminLike,
): Promise<BootstrapResult> {
  const config = readBootstrapConfig(env);
  if (config.status === "absent") return { status: "absent" };
  if (config.status === "invalid") {
    console.error(`[bootstrap] configuration error in: ${config.issues.join(", ")}`);
    return { status: "invalid-config" };
  }

  const policy = validateAccessCode(config.accessCode, { email: config.email });
  if (!policy.ok) {
    console.error("[bootstrap] configuration error in: R2Y_BOOTSTRAP_ACCESS_CODE (policy)");
    return { status: "invalid-config" };
  }

  const admin =
    injected ??
    ((await import("@/lib/supabase/admin")).createAdminClient() as unknown as AdminLike);
  const exists = async (): Promise<boolean | null> => {
    const lookup = await admin.rpc("auth_user_id_by_email", { p_email: config.email });
    if (lookup.error) return null;
    return typeof lookup.data === "string" && lookup.data !== "";
  };
  const found = await exists();
  if (found === null) return { status: "failed" };
  if (found) return { status: "exists" };

  const { error } = await admin.auth.admin.createUser({
    email: config.email,
    password: config.accessCode,
    email_confirm: true,
    app_metadata: { r2y_founder: true, r2y_role: config.role },
  });
  if (!error) return { status: "created" };
  if (alreadyRegistered(error)) return { status: "exists" };
  // Two simultaneous first logins: the loser of the race gets a generic 500 from Auth (the unique
  // email index), not "already registered". Look again: if the user exists now, the winner made it.
  return (await exists()) === true ? { status: "exists" } : { status: "failed" };
}
