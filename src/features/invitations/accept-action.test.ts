import { beforeEach, describe, expect, it, vi } from "vitest";

class Redirect extends Error {
  constructor(public to: string) {
    super("NEXT_REDIRECT");
  }
}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirect(to);
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }),
}));
const db = { auth: {} };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));

const consumeInviteToken = vi.fn();
const inviteGate = vi.fn();
const inviteRecord = vi.fn();
vi.mock("@/features/accounts/admin-ops", () => ({ consumeInviteToken, inviteGate, inviteRecord }));
const limitedPasswordLogin = vi.fn();
vi.mock("@/features/auth/login", () => ({ limitedPasswordLogin }));
const resolvePostLogin = vi.fn();
vi.mock("@/features/auth/post-login", () => ({ HOME_PATH: "/", resolvePostLogin }));

const { acceptInviteAction } = await import("./accept-action");
const { generateInviteToken } = await import("./token");

const IDLE = { status: "idle" } as const;
const token = generateInviteToken().token;
const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
};
const GOOD = "Tr3nta9Lampade";

beforeEach(() => {
  vi.clearAllMocks();
  inviteGate.mockResolvedValue("open");
  consumeInviteToken.mockResolvedValue({ ok: true, userId: "u1", email: "b@example.test" });
  limitedPasswordLogin.mockResolvedValue({ status: "ok", user: { id: "u1" } });
  resolvePostLogin.mockResolvedValue({ status: "ok", to: "/" });
});

describe("acceptInviteAction", () => {
  it("a token of the wrong shape or an empty code never reaches the gate or the DB", async () => {
    const cases: Record<string, string>[] = [
      { token: "short", code: GOOD },
      { token, code: "" },
      { code: GOOD },
    ];
    for (const fields of cases) {
      const result = await acceptInviteAction(IDLE, form(fields));
      expect(result.status).toBe("error");
    }
    expect(inviteGate).not.toHaveBeenCalled();
    expect(consumeInviteToken).not.toHaveBeenCalled();
  });

  it("a policy failure gets the field message before the gate", async () => {
    const result = await acceptInviteAction(IDLE, form({ token, code: "corto1" }));
    expect(result).toMatchObject({ status: "error", field: { name: "code" } });
    expect(consumeInviteToken).not.toHaveBeenCalled();
  });

  it("blocked IP: neutral 'troppi tentativi' and NOTHING is consumed or changed (REV-3 ordering)", async () => {
    inviteGate.mockResolvedValue("blocked");
    const result = await acceptInviteAction(IDLE, form({ token, code: GOOD }));
    expect(result).toMatchObject({
      status: "error",
      message: expect.stringContaining("Troppi tentativi"),
    });
    expect(consumeInviteToken).not.toHaveBeenCalled();
    expect(limitedPasswordLogin).not.toHaveBeenCalled();
  });

  it("gate unreadable: fails closed with the outage text", async () => {
    inviteGate.mockResolvedValue("unavailable");
    const result = await acceptInviteAction(IDLE, form({ token, code: GOOD }));
    expect(result.status).toBe("error");
    expect(consumeInviteToken).not.toHaveBeenCalled();
  });

  it("invalid link: one neutral text, and it counts as a failure for the IP", async () => {
    consumeInviteToken.mockResolvedValue({ ok: false, error: "invalid_link" });
    const result = await acceptInviteAction(IDLE, form({ token, code: GOOD }));
    expect(result).toMatchObject({
      status: "error",
      message: expect.stringContaining("non è più valido"),
    });
    expect(inviteRecord).toHaveBeenCalledWith("203.0.113.9", false);
    expect(limitedPasswordLogin).not.toHaveBeenCalled();
  });

  it("policy refusal after the lookup is a field error and not a counted failure", async () => {
    consumeInviteToken.mockResolvedValue({ ok: false, error: "policy", message: "No." });
    const result = await acceptInviteAction(IDLE, form({ token, code: GOOD }));
    expect(result).toEqual({
      status: "error",
      message: "No.",
      field: { name: "code", message: "No." },
    });
    expect(inviteRecord).not.toHaveBeenCalled();
  });

  it("unavailable and generic failures give their own texts", async () => {
    consumeInviteToken.mockResolvedValue({ ok: false, error: "unavailable" });
    const a = await acceptInviteAction(IDLE, form({ token, code: GOOD }));
    consumeInviteToken.mockResolvedValue({ ok: false, error: "failed" });
    const b = await acceptInviteAction(IDLE, form({ token, code: GOOD }));
    expect(a.status === "error" && b.status === "error" && a.message !== b.message).toBe(true);
  });

  it("limiter blocks the sign-in that follows: error, no redirect", async () => {
    limitedPasswordLogin.mockResolvedValue({ status: "blocked" });
    const result = await acceptInviteAction(IDLE, form({ token, code: GOOD }));
    expect(result.status).toBe("error");
    expect(resolvePostLogin).not.toHaveBeenCalled();
  });

  it("success: clears the IP bucket, signs in with the chosen code and redirects", async () => {
    await expect(acceptInviteAction(IDLE, form({ token, code: GOOD }))).rejects.toMatchObject({
      to: "/",
    });
    expect(inviteRecord).toHaveBeenCalledWith("203.0.113.9", true);
    expect(limitedPasswordLogin).toHaveBeenCalledWith(db.auth, {
      email: "b@example.test",
      code: GOOD,
      ip: "203.0.113.9",
    });
  });
});
