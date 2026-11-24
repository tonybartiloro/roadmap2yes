import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureBootstrapUser } from "@/features/auth/bootstrap";
import { anonClient, serviceClient } from "../support/supabase";

/**
 * Bootstrap (plan §4.2, AC55) against the real stack, with the real `auth_user_id_by_email` and
 * `auth.admin.createUser`. The function takes the admin client as a parameter, so the test passes
 * the service client of the test helper (tests never import `lib/supabase/admin.ts`).
 */

type Admin = Parameters<typeof ensureBootstrapUser>[1];
const admin = () => serviceClient() as unknown as Admin;

function envFor(label: string) {
  const email = `${label}.${randomBytes(4).toString("hex")}@example.test`;
  return {
    email,
    env: {
      R2Y_BOOTSTRAP_EMAIL: email,
      R2Y_BOOTSTRAP_ACCESS_CODE: `Boot${randomBytes(5).toString("hex")}x7`,
      R2Y_BOOTSTRAP_ROLE: "sposa",
    },
  };
}

async function findUser(email: string) {
  const { data } = await serviceClient().rpc("auth_user_id_by_email", { p_email: email });
  return data as string | null;
}

afterEach(() => vi.restoreAllMocks());

describe("ensureBootstrapUser", () => {
  it("creates the founder with the role, and the env code works", async () => {
    const { email, env } = envFor("boot");
    expect(await ensureBootstrapUser(env, admin())).toEqual({ status: "created" });
    const client = anonClient();
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password: env.R2Y_BOOTSTRAP_ACCESS_CODE,
    });
    expect(error).toBeNull();
    expect(data.user?.app_metadata).toMatchObject({ r2y_founder: true, r2y_role: "sposa" });
    // and the founder can create the space (the claim is accepted by the DB)
    expect((await client.rpc("create_wedding")).error).toBeNull();
  });

  it("a second run changes nothing", async () => {
    const { email, env } = envFor("again");
    await ensureBootstrapUser(env, admin());
    const id = await findUser(email);
    expect(await ensureBootstrapUser(env, admin())).toEqual({ status: "exists" });
    expect(await findUser(email)).toBe(id);
  });

  it("a code changed in the app stays valid; the env code does not come back", async () => {
    const { email, env } = envFor("changed");
    await ensureBootstrapUser(env, admin());
    const id = (await findUser(email)) as string;
    const changed = `Changed${randomBytes(5).toString("hex")}z3`;
    const update = await serviceClient().auth.admin.updateUserById(id, { password: changed });
    expect(update.error).toBeNull();

    expect(await ensureBootstrapUser(env, admin())).toEqual({ status: "exists" });

    const ok = await anonClient().auth.signInWithPassword({ email, password: changed });
    expect(ok.error).toBeNull();
    const old = await anonClient().auth.signInWithPassword({
      email,
      password: env.R2Y_BOOTSTRAP_ACCESS_CODE,
    });
    expect(old.error).not.toBeNull();
  });

  it("an invalid code creates nothing and logs no value", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { email, env } = envFor("weak");
    const bad = { ...env, R2Y_BOOTSTRAP_ACCESS_CODE: "short1" };
    expect(await ensureBootstrapUser(bad, admin())).toEqual({ status: "invalid-config" });
    expect(await findUser(email)).toBeNull();
    const logged = JSON.stringify(error.mock.calls);
    expect(logged).not.toContain("short1");
    expect(logged).not.toContain(email);
  });

  it("absent variables: no action", async () => {
    const { email } = envFor("absent");
    expect(await ensureBootstrapUser({}, admin())).toEqual({ status: "absent" });
    expect(await findUser(email)).toBeNull();
  });

  it("two simultaneous logins create ONE user, both succeed", async () => {
    const { email, env } = envFor("race");
    const results = await Promise.all([
      ensureBootstrapUser(env, admin()),
      ensureBootstrapUser(env, admin()),
      ensureBootstrapUser(env, admin()),
    ]);
    expect(results.every((r) => r.status === "created" || r.status === "exists")).toBe(true);
    expect(results.filter((r) => r.status === "created")).toHaveLength(1);
    expect(await findUser(email)).not.toBeNull();
  });
});
