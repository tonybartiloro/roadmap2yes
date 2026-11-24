import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureBootstrapUser, isBootstrapEmail, supabaseTarget } from "./bootstrap";

describe("supabaseTarget (the script refuses a remote target without --remote)", () => {
  it("is local only for loopback hosts", () => {
    expect(supabaseTarget("http://127.0.0.1:54421")).toBe("local");
    expect(supabaseTarget("http://localhost:54421")).toBe("local");
    expect(supabaseTarget("https://abcdefgh.supabase.co")).toBe("remote");
    expect(supabaseTarget("http://127.0.0.1.evil.test")).toBe("remote");
    expect(supabaseTarget("not a url")).toBe("remote");
  });
});

const ENV = {
  R2Y_BOOTSTRAP_EMAIL: "Tony@Example.test",
  R2Y_BOOTSTRAP_ACCESS_CODE: "first-run-code-4821",
  R2Y_BOOTSTRAP_ROLE: "sposo",
};

function fakeAdmin(options: { existing?: string; createError?: { code?: string } } = {}) {
  const createUser = vi.fn(() => Promise.resolve({ error: options.createError ?? null }));
  const rpc = vi.fn(() => Promise.resolve({ data: options.existing ?? null, error: null }));
  return { admin: { rpc, auth: { admin: { createUser } } }, createUser, rpc };
}

afterEach(() => vi.restoreAllMocks());

describe("isBootstrapEmail", () => {
  it("compares normalized emails, and only when configured", () => {
    expect(isBootstrapEmail("  tony@example.TEST ", ENV)).toBe(true);
    expect(isBootstrapEmail("other@example.test", ENV)).toBe(false);
    expect(isBootstrapEmail("tony@example.test", {})).toBe(false);
  });
});

describe("ensureBootstrapUser", () => {
  it("does nothing when a variable is missing", async () => {
    const { admin, createUser, rpc } = fakeAdmin();
    const env = { ...ENV, R2Y_BOOTSTRAP_ACCESS_CODE: undefined };
    expect(await ensureBootstrapUser(env, admin)).toEqual({ status: "absent" });
    expect(rpc).not.toHaveBeenCalled();
    expect(createUser).not.toHaveBeenCalled();
  });

  it("creates the founder confirmed, with the role, from the env code", async () => {
    const { admin, createUser } = fakeAdmin();
    expect(await ensureBootstrapUser(ENV, admin)).toEqual({ status: "created" });
    expect(createUser).toHaveBeenCalledWith({
      email: "tony@example.test",
      password: "first-run-code-4821",
      email_confirm: true,
      app_metadata: { r2y_founder: true, r2y_role: "sposo" },
    });
  });

  it("is create-only: an existing user is never touched (a code changed in the app survives)", async () => {
    const { admin, createUser } = fakeAdmin({ existing: "11111111-1111-1111-1111-111111111111" });
    expect(await ensureBootstrapUser(ENV, admin)).toEqual({ status: "exists" });
    expect(createUser).not.toHaveBeenCalled();
  });

  it("treats 'already registered' from a concurrent request as success", async () => {
    const { admin } = fakeAdmin({ createError: { code: "email_exists" } });
    expect(await ensureBootstrapUser(ENV, admin)).toEqual({ status: "exists" });
  });

  it("the loser of a race gets a generic 500 from Auth: it looks again and finds the winner's user", async () => {
    const createUser = vi.fn(() => Promise.resolve({ error: { status: 500 } }));
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: "22222222-2222-2222-2222-222222222222", error: null });
    const admin = { rpc, auth: { admin: { createUser } } };
    expect(await ensureBootstrapUser(ENV, admin)).toEqual({ status: "exists" });
  });

  it("a real failure (no user afterwards) is reported as failed", async () => {
    const createUser = vi.fn(() => Promise.resolve({ error: { status: 500 } }));
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    expect(await ensureBootstrapUser(ENV, { rpc, auth: { admin: { createUser } } })).toEqual({
      status: "failed",
    });
  });

  it("an invalid code creates nothing and logs only the variable name", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { admin, createUser } = fakeAdmin();
    const env = { ...ENV, R2Y_BOOTSTRAP_ACCESS_CODE: "short1" };
    expect(await ensureBootstrapUser(env, admin)).toEqual({ status: "invalid-config" });
    expect(createUser).not.toHaveBeenCalled();
    const logged = JSON.stringify(error.mock.calls);
    expect(logged).toContain("R2Y_BOOTSTRAP_ACCESS_CODE");
    expect(logged).not.toContain("short1");
    expect(logged).not.toContain("example.test");
  });

  it("an invalid role or email creates nothing and logs no value", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { admin, createUser } = fakeAdmin();
    const env = { ...ENV, R2Y_BOOTSTRAP_ROLE: "capo" };
    expect(await ensureBootstrapUser(env, admin)).toEqual({ status: "invalid-config" });
    expect(createUser).not.toHaveBeenCalled();
    expect(JSON.stringify(error.mock.calls)).not.toContain("capo");
  });

  it("a code that contains the email's local part is refused", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { admin, createUser } = fakeAdmin();
    const env = { ...ENV, R2Y_BOOTSTRAP_ACCESS_CODE: "tony-secret-9981" };
    expect(await ensureBootstrapUser(env, admin)).toEqual({ status: "invalid-config" });
    expect(createUser).not.toHaveBeenCalled();
  });

  it("the example code of .env.example passes the policy", async () => {
    const { admin } = fakeAdmin();
    const env = {
      R2Y_BOOTSTRAP_EMAIL: "tony@example.test",
      R2Y_BOOTSTRAP_ACCESS_CODE: "local-demo-code-2026",
      R2Y_BOOTSTRAP_ROLE: "sposo",
    };
    expect((await ensureBootstrapUser(env, admin)).status).toBe("created");
  });
});
