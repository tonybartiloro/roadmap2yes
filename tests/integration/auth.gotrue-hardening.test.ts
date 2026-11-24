import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  anonClient,
  createUser,
  randomCode,
  serviceClient,
  signInAs,
  stackEnv,
  uniqueEmail,
} from "../support/supabase";

/**
 * The three Auth settings of plan §4.1 (P2) against the local GoTrue, with a DIRECT `PUT /user`
 * (what a stolen session can do, risk R26) rather than through the app:
 *   - `double_confirm_changes` + `enable_confirmations`: a direct email change is not applied;
 *   - `secure_password_change`: a direct code change with a session older than 24 h is refused;
 *   - the policy of the code (>= 10, letters + digits) holds for direct calls too.
 * What the local stack can NOT prove: the same checks on staging/prod (dashboard checklist) and the
 * 24-hour rule with a really old session: the test ages the session row in the local database.
 */

const DB_CONTAINER = "supabase_db_roadmap2yes";

function sql(statement: string): void {
  execFileSync(
    "docker",
    [
      "exec",
      DB_CONTAINER,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      statement,
    ],
    { stdio: "pipe" },
  );
}

async function putUser(accessToken: string, body: Record<string, unknown>) {
  const { url, publishableKey } = stackEnv();
  const response = await fetch(`${url}/auth/v1/user`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      apikey: publishableKey,
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: response.status, json };
}

async function session() {
  const user = await createUser();
  const client = await signInAs(user);
  const { data } = await client.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error("no session");
  return { user, accessToken };
}

const canSignIn = async (email: string, code: string) =>
  (await anonClient().auth.signInWithPassword({ email, password: code })).error === null;

describe("direct PUT /user: email (double_confirm_changes + enable_confirmations)", () => {
  it("does not change the login email: it only stays pending", async () => {
    const { user, accessToken } = await session();
    const next = uniqueEmail("direct");

    await putUser(accessToken, { email: next });

    const stored = await serviceClient().auth.admin.getUserById(user.id);
    expect(stored.data.user?.email).toBe(user.email); // not applied
    expect(await canSignIn(next, user.code)).toBe(false); // the new address cannot sign in
    expect(await canSignIn(user.email, user.code)).toBe(true);
  });
});

describe("direct PUT /user: code (secure_password_change)", () => {
  it("is refused when the session is older than 24 hours", async () => {
    const { user, accessToken } = await session();
    sql(
      `update auth.sessions set created_at = now() - interval '25 hours' where user_id = '${user.id}'`,
    );

    const result = await putUser(accessToken, { password: randomCode() });

    expect(result.status).toBeGreaterThanOrEqual(400);
    expect(result.status).toBeLessThan(500);
    expect(await canSignIn(user.email, user.code)).toBe(true); // the code did not change
  });

  it("is still possible within 24 hours of the sign-in: the accepted residual risk R26", async () => {
    const { user, accessToken } = await session();
    const next = randomCode();

    const result = await putUser(accessToken, { password: next });

    expect(result.status).toBe(200);
    expect(await canSignIn(user.email, next)).toBe(true);
  });
});

describe("direct PUT /user: the code policy holds for direct calls", () => {
  it.each([
    ["9 characters", "abcd12345"],
    ["letters only", "abcdefghijkl"],
    ["digits only", "1234567890123"],
  ])("refuses %s", async (_label, code) => {
    const { user, accessToken } = await session();
    const result = await putUser(accessToken, { password: code });
    expect(result.status).toBeGreaterThanOrEqual(400);
    expect(await canSignIn(user.email, user.code)).toBe(true);
  });
});
