import { beforeEach, describe, expect, it, vi } from "vitest";

const probeAuth = { signInWithPassword: vi.fn(), signOut: vi.fn() };
const createClient = vi.fn((..._args: unknown[]) => ({ auth: probeAuth }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

const { verifyCurrentCode } = await import("./login");

function deps() {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  return {
    calls,
    deps: {
      limiter: {
        rpc: vi.fn((fn: string, args: Record<string, unknown>) => {
          calls.push({ fn, args });
          return Promise.resolve({ data: { blocked: false }, error: null });
        }),
      },
      secret: "unit-test-secret",
      limits: { maxFailuresPerEmail: 5, maxFailuresPerIp: 20, lockMinutes: 15, windowMinutes: 15 },
    },
  };
}
const input = { email: "a@example.test", code: "Whatever1234", ip: "203.0.113.7" };

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54421");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_fake");
  probeAuth.signInWithPassword.mockReset();
  probeAuth.signOut.mockReset().mockResolvedValue({ error: null });
  createClient.mockClear();
});

describe("verifyCurrentCode (plan §4.5.3)", () => {
  it("checks the code on a throwaway client with no session persistence, and signs it out", async () => {
    probeAuth.signInWithPassword.mockResolvedValue({ data: { user: { id: "u" } }, error: null });
    const { deps: d, calls } = deps();
    expect((await verifyCurrentCode(input, d)).status).toBe("ok");
    expect(createClient.mock.calls[0]?.[2]).toMatchObject({
      auth: { persistSession: false, autoRefreshToken: false },
    });
    expect(probeAuth.signInWithPassword).toHaveBeenCalledOnce();
    expect(probeAuth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(calls.map((c) => c.fn)).toEqual(["login_gate", "login_record"]);
  });

  it("a wrong current code goes through the limiter (counts against the email key)", async () => {
    probeAuth.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { status: 400, code: "invalid_credentials" },
    });
    const { deps: d, calls } = deps();
    expect(await verifyCurrentCode(input, d)).toEqual({ status: "invalid" });
    expect(calls[1]).toMatchObject({ fn: "login_record", args: { p_success: false } });
    expect(probeAuth.signOut).not.toHaveBeenCalled();
  });

  it("a blocked email never tries the code", async () => {
    const { deps: d } = deps();
    d.limiter.rpc.mockResolvedValue({ data: { blocked: true }, error: null });
    expect(await verifyCurrentCode(input, d)).toEqual({ status: "blocked" });
    expect(probeAuth.signInWithPassword).not.toHaveBeenCalled();
  });
});
