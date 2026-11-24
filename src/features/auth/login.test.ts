import { describe, expect, it, vi } from "vitest";
import { limitedPasswordLogin, type LoginDeps } from "./login";

type Call = { fn: string; args: Record<string, unknown> };

function setup(options: { blocked?: boolean; gateError?: unknown } = {}) {
  const calls: Call[] = [];
  const limiter = {
    rpc: vi.fn((fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (fn === "login_gate" && options.gateError) {
        return Promise.resolve({ data: null, error: options.gateError });
      }
      return Promise.resolve({
        data: { blocked: fn === "login_gate" ? Boolean(options.blocked) : false },
        error: null,
      });
    }),
  };
  const deps: LoginDeps = {
    limiter,
    secret: "unit-test-secret",
    limits: { maxFailuresPerEmail: 5, maxFailuresPerIp: 20, lockMinutes: 15, windowMinutes: 15 },
  };
  return { calls, deps };
}

const input = { email: "a@example.test", code: "Whatever1234", ip: "203.0.113.7" };
const authReturning = (result: unknown) => ({
  signInWithPassword: vi.fn(() => Promise.resolve(result)),
});
const fns = (calls: Call[]) => calls.map((c) => c.fn);

describe("limitedPasswordLogin", () => {
  it("a blocked key answers 'blocked' without trying the password and writes no row", async () => {
    const { calls, deps } = setup({ blocked: true });
    const auth = authReturning({ data: { user: { id: "u" } }, error: null });
    expect(await limitedPasswordLogin(auth as never, input, deps)).toEqual({ status: "blocked" });
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
    expect(fns(calls)).toEqual(["login_gate"]); // login_record only when the gate was open
  });

  it("success: gate, sign in, record(success)", async () => {
    const { calls, deps } = setup();
    const user = { id: "u1", app_metadata: {} };
    const auth = authReturning({ data: { user }, error: null });
    expect(await limitedPasswordLogin(auth as never, input, deps)).toEqual({ status: "ok", user });
    expect(fns(calls)).toEqual(["login_gate", "login_record"]);
    expect(calls[1]?.args["p_success"]).toBe(true);
  });

  it("wrong code: neutral 'invalid' and record(failure) with the configured thresholds", async () => {
    const { calls, deps } = setup();
    const auth = authReturning({
      data: { user: null },
      error: { status: 400, code: "invalid_credentials", message: "Invalid login credentials" },
    });
    expect(await limitedPasswordLogin(auth as never, input, deps)).toEqual({ status: "invalid" });
    expect(calls[1]?.args).toMatchObject({
      p_success: false,
      p_max_email: 5,
      p_max_ip: 20,
      p_window_minutes: 15,
      p_lock_minutes: 15,
    });
  });

  it("only ever sends keyed digests to the DB, never the email, the ip or the code", async () => {
    const { calls, deps } = setup();
    const auth = authReturning({
      data: { user: null },
      error: { status: 400, code: "invalid_credentials" },
    });
    await limitedPasswordLogin(auth as never, input, deps);
    const wire = JSON.stringify(calls);
    expect(wire).not.toContain("example.test");
    expect(wire).not.toContain("203.0.113.7");
    expect(wire).not.toContain("Whatever1234");
    expect(calls[0]?.args["p_email_key"]).toMatch(/^\\x[0-9a-f]{64}$/);
  });

  it("a GoTrue 429 is the same 'blocked' answer and records nothing", async () => {
    const { calls, deps } = setup();
    const auth = authReturning({
      data: { user: null },
      error: { status: 429, code: "over_request_rate_limit", message: "rate limit" },
    });
    expect(await limitedPasswordLogin(auth as never, input, deps)).toEqual({ status: "blocked" });
    expect(fns(calls)).toEqual(["login_gate"]);
  });

  it("an outage of Auth is 'unavailable' and is NOT counted as a wrong code", async () => {
    const { calls, deps } = setup();
    const auth = authReturning({
      data: { user: null },
      error: { status: 540, name: "AuthApiError", message: "" },
    });
    expect(await limitedPasswordLogin(auth as never, input, deps)).toEqual({
      status: "unavailable",
      kind: "paused",
    });
    expect(fns(calls)).toEqual(["login_gate"]);
  });

  it("an outage of the gate is 'unavailable' and the password is not tried", async () => {
    const { deps } = setup({ gateError: { status: 503, message: "down" } });
    const auth = authReturning({ data: { user: { id: "u" } }, error: null });
    const outcome = await limitedPasswordLogin(auth as never, input, deps);
    expect(outcome.status).toBe("unavailable");
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("without an ip only the email key is sent", async () => {
    const { calls, deps } = setup();
    const auth = authReturning({ data: { user: { id: "u" } }, error: null });
    await limitedPasswordLogin(auth as never, { ...input, ip: null }, deps);
    expect(calls[0]?.args["p_ip_key"]).toBeNull();
  });
});
