import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Helpers for integration/acceptance tests against the LOCAL Supabase stack (`npm run db:start`).
 *
 * The service (secret-key) client is built here with `createClient` and NOT through
 * `src/lib/supabase/admin.ts`: that module is `server-only` and lint-restricted to 4 app scopes.
 * Only local/CI keys ever reach this file (from the environment or from `npm run db:env`).
 * All emails are FAKE (`@example.test`, enforced by `scripts/check-test-emails.ts`).
 */

export type TestClient = SupabaseClient<Database>;

type StackEnv = { url: string; publishableKey: string; secretKey: string };

let cached: StackEnv | undefined;

function parseEnvLines(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const eq = line.indexOf("=");
    if (eq > 0) out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return out;
}

/** Local stack settings: environment first (CI exports them), else `npm run db:env`. */
export function stackEnv(): StackEnv {
  if (cached) return cached;
  let source: Record<string, string | undefined> = process.env;
  if (
    !source["NEXT_PUBLIC_SUPABASE_URL"] ||
    !source["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] ||
    !source["SUPABASE_SECRET_KEY"]
  ) {
    source = parseEnvLines(execFileSync("npm", ["run", "-s", "db:env"], { encoding: "utf8" }));
  }
  const url = source["NEXT_PUBLIC_SUPABASE_URL"];
  const publishableKey = source["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  const secretKey = source["SUPABASE_SECRET_KEY"];
  if (!url || !publishableKey || !secretKey) {
    throw new Error("Local Supabase stack not available: run `npm run db:start` first.");
  }
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) {
    throw new Error("Integration tests only run against the local stack (127.0.0.1/localhost).");
  }
  cached = { url, publishableKey, secretKey };
  return cached;
}

const noSession = { auth: { autoRefreshToken: false, persistSession: false } } as const;

/** Client with the publishable key and no session (what an anonymous visitor has). */
export function anonClient(): TestClient {
  const { url, publishableKey } = stackEnv();
  return createClient<Database>(url, publishableKey, noSession);
}

/** Client with the SECRET key: bypasses RLS. Tests only. */
export function serviceClient(): TestClient {
  const { url, secretKey } = stackEnv();
  return createClient<Database>(url, secretKey, noSession);
}

/** Fake, unique, normalized email: never a real address. */
export function uniqueEmail(prefix = "user"): string {
  return `${prefix}.${randomBytes(5).toString("hex")}@example.test`;
}

/** A valid access code (>= 10 chars, letters + digits). Random so no two tests share one. */
export function randomCode(): string {
  return `Code${randomBytes(6).toString("hex")}x9`;
}

export type TestUser = {
  id: string;
  email: string;
  code: string;
};

/** Creates a confirmed Auth user with the admin API (what the server does for partners). */
export async function createUser(
  options: {
    email?: string;
    code?: string;
    founder?: boolean;
    role?: "sposo" | "sposa";
  } = {},
): Promise<TestUser> {
  const email = options.email ?? uniqueEmail();
  const code = options.code ?? randomCode();
  const appMetadata: Record<string, unknown> = {};
  if (options.founder) appMetadata["r2y_founder"] = true;
  if (options.role) appMetadata["r2y_role"] = options.role;
  const { data, error } = await serviceClient().auth.admin.createUser({
    email,
    password: code,
    email_confirm: true,
    app_metadata: appMetadata,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message ?? "no user"}`);
  return { id: data.user.id, email, code };
}

/** Signs in with email + access code and returns a client carrying that user's JWT. */
export async function signInAs(user: Pick<TestUser, "email" | "code">): Promise<TestClient> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.code });
  if (error) throw new Error(`signIn failed: ${error.message}`);
  return client;
}

export type TestWedding = {
  founder: TestUser;
  founderClient: TestClient;
  weddingId: string;
};

/** A founder with a wedding made through the real RPC `create_wedding`. */
export async function createWedding(role: "sposo" | "sposa" = "sposo"): Promise<TestWedding> {
  const founder = await createUser({ founder: true, role });
  const founderClient = await signInAs(founder);
  const { data, error } = await founderClient.rpc("create_wedding");
  if (error || !data) throw new Error(`create_wedding failed: ${error?.message ?? "no id"}`);
  return { founder, founderClient, weddingId: data };
}

export type TestPartnerB = { user: TestUser; client: TestClient };

/** Adds partner B the way the app does: partner row, Auth account, invitation, first sign-in. */
export async function addPartnerB(wedding: TestWedding): Promise<TestPartnerB> {
  const user = await createUser();
  const { founderClient } = wedding;
  const partner = await founderClient.rpc("upsert_partner_b", { p_email: user.email });
  if (partner.error) throw new Error(`upsert_partner_b failed: ${partner.error.message}`);
  const invitation = await founderClient.rpc("create_invitation", {
    p_email: user.email,
    p_method: "code",
    p_invitee_user_id: user.id,
  });
  if (invitation.error) throw new Error(`create_invitation failed: ${invitation.error.message}`);
  const client = await signInAs(user);
  const accepted = await client.rpc("accept_pending_invitation");
  if (accepted.error || accepted.data !== "ok") {
    throw new Error(`accept_pending_invitation failed: ${accepted.error?.message ?? accepted.data}`);
  }
  return { user, client };
}

/** Raw GoTrue call with the publishable key (for refusal tests that supabase-js would hide). */
export async function authFetch(path: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const { url, publishableKey } = stackEnv();
  const response = await fetch(`${url}/auth/v1${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: publishableKey },
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: response.status, json };
}

export function newId(): string {
  return randomUUID();
}
