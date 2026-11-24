import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { anonClient, serviceClient, stackEnv } from "../support/supabase";

/**
 * QA T17a: the first-user bootstrap as an operator runs it, `npm run bootstrap` (plan "Bootstrap",
 * AC55). The real script runs as a child process against the real local stack: acceptance of the
 * contract (create-only, idempotent, no values in the output), not of the internals.
 *
 * AC map
 *  - AC55  variables absent -> nothing; present -> founder with `r2y_founder` and role; run twice ->
 *          no change; a code changed in the app is never overwritten and the env code stops
 *          working; an invalid env code creates nothing and the output holds no value; two runs at
 *          once -> ONE user; a remote target is refused without `--remote`
 *  - (the same function runs inside the login server action: that path is exercised in
 *    e2e/login.spec.ts through the founder's first login)
 */

const run = promisify(execFile);
const ROOT = resolve(__dirname, "../..");

type Result = { code: number; out: string };

async function bootstrap(
  env: Record<string, string>,
  args: string[] = [],
  overrides: Record<string, string> = {},
): Promise<Result> {
  const stack = stackEnv();
  try {
    const { stdout, stderr } = await run("npx", ["tsx", "scripts/bootstrap.ts", ...args], {
      cwd: ROOT,
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: stack.url,
        SUPABASE_SECRET_KEY: stack.secretKey,
        ...env,
        ...overrides,
      },
      timeout: 60_000,
    });
    return { code: 0, out: `${stdout}\n${stderr}` };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failure.code ?? 1, out: `${failure.stdout ?? ""}\n${failure.stderr ?? ""}` };
  }
}

function fresh(label: string, role: "sposo" | "sposa" = "sposo") {
  const email = `${label}.${randomBytes(4).toString("hex")}@example.test`;
  const code = `Boot${randomBytes(5).toString("hex")}x7`;
  return {
    email,
    code,
    env: {
      R2Y_BOOTSTRAP_EMAIL: email,
      R2Y_BOOTSTRAP_ACCESS_CODE: code,
      R2Y_BOOTSTRAP_ROLE: role,
    },
  };
}

async function userIdOf(email: string): Promise<string | null> {
  const { data } = await serviceClient().rpc("auth_user_id_by_email", { p_email: email });
  return (data as string | null) ?? null;
}

const noValues = (out: string, ...values: string[]) => {
  for (const value of values) expect(out).not.toContain(value);
  expect(out).not.toContain(stackEnv().secretKey);
};

describe("npm run bootstrap (AC55)", () => {
  it("variables absent -> no action, exit 0", async () => {
    const result = await bootstrap({
      R2Y_BOOTSTRAP_EMAIL: "",
      R2Y_BOOTSTRAP_ACCESS_CODE: "",
      R2Y_BOOTSTRAP_ROLE: "",
    });
    expect(result.code).toBe(0);
    expect(result.out).toContain("nothing to do");
  });

  it("creates the founder with the role; the env code signs in; the output holds no value", async () => {
    const { email, code, env } = fresh("first", "sposa");
    const result = await bootstrap(env);
    expect(result.code).toBe(0);
    expect(result.out).toContain("first user created");
    noValues(result.out, email, code);

    const client = anonClient();
    const signIn = await client.auth.signInWithPassword({ email, password: code });
    expect(signIn.error).toBeNull();
    expect(signIn.data.user?.app_metadata).toMatchObject({ r2y_founder: true, r2y_role: "sposa" });
    expect(signIn.data.user?.email_confirmed_at).toBeTruthy();
    // an unrelated user can never be a founder: the claim only comes from the bootstrap
    expect((await client.rpc("create_wedding")).error).toBeNull();
  });

  it("running it twice changes nothing", async () => {
    const { email, env } = fresh("twice");
    expect((await bootstrap(env)).code).toBe(0);
    const id = await userIdOf(email);
    expect(id).toBeTruthy();
    const second = await bootstrap(env);
    expect(second.code).toBe(0);
    expect(second.out).toContain("already exists");
    expect(await userIdOf(email)).toBe(id);
  });

  it("a code changed in the app stays valid; the env code does not come back", async () => {
    const { email, code, env } = fresh("changed");
    await bootstrap(env);
    const id = (await userIdOf(email)) as string;
    const appCode = `App${randomBytes(5).toString("hex")}y8`;
    const changed = await serviceClient().auth.admin.updateUserById(id, { password: appCode });
    expect(changed.error).toBeNull();

    const again = await bootstrap(env);
    expect(again.out).toContain("already exists");

    const withApp = await anonClient().auth.signInWithPassword({ email, password: appCode });
    expect(withApp.error).toBeNull();
    const withEnv = await anonClient().auth.signInWithPassword({ email, password: code });
    expect(withEnv.error).not.toBeNull();
  });

  it("an invalid env code creates nothing, exits 1 and prints no value", async () => {
    const { email, env } = fresh("invalid");
    const bad = { ...env, R2Y_BOOTSTRAP_ACCESS_CODE: "short1" };
    const result = await bootstrap(bad);
    expect(result.code).toBe(1);
    expect(result.out).toContain("invalid-config");
    noValues(result.out, email, "short1");
    expect(await userIdOf(email)).toBeNull();

    const badRole = await bootstrap({ ...env, R2Y_BOOTSTRAP_ROLE: "marito" });
    expect(badRole.code).toBe(1);
    expect(await userIdOf(email)).toBeNull();
  });

  it("two runs at the same time create ONE user and both succeed", async () => {
    const { email, env } = fresh("race");
    const [a, b] = await Promise.all([bootstrap(env), bootstrap(env)]);
    expect(a.code).toBe(0);
    expect(b.code).toBe(0);
    const users = await serviceClient().auth.admin.listUsers({ page: 1, perPage: 1000 });
    expect(users.data.users.filter((u) => u.email === email)).toHaveLength(1);
  });

  it("a remote target is refused without --remote, before touching anything", async () => {
    const { email, code, env } = fresh("remote");
    const result = await bootstrap(env, [], {
      NEXT_PUBLIC_SUPABASE_URL: "https://example-project.supabase.co",
    });
    expect(result.code).toBe(1);
    expect(result.out).toContain("--remote");
    noValues(result.out, email, code);
  });
});
