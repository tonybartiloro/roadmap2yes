import { beforeEach, describe, expect, it, vi } from "vitest";

class Redirect extends Error {
  constructor(public to: string) {
    super("NEXT_REDIRECT");
  }
}

const redirect = vi.fn((to: string) => {
  throw new Redirect(to);
});
const deleted: string[] = [];
const cookieStore = {
  getAll: () => [{ name: "sb-127-auth-token" }, { name: "sb-127-auth-token.0" }, { name: "theme" }],
  delete: (name: string) => deleted.push(name),
};
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }),
}));

const auth = {
  getClaims: vi.fn(),
  signOut: vi.fn(),
  signInWithPassword: vi.fn(),
  refreshSession: vi.fn(),
};
const db = { auth, rpc: vi.fn(), from: vi.fn() };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));

const verifyCurrentCode = vi.fn();
vi.mock("./login", () => ({
  verifyCurrentCode,
  limitedPasswordLogin: vi.fn(),
  createThrowawayClient: vi.fn(),
}));
const changeOwnCode = vi.fn();
const changeOwnEmail = vi.fn();
vi.mock("@/features/accounts/admin-ops", () => ({ changeOwnCode, changeOwnEmail }));
vi.mock("./bootstrap", () => ({ ensureBootstrapUser: vi.fn(), isBootstrapEmail: () => false }));
vi.mock("@/lib/email", () => ({ emailEnabled: () => false, getEmailSender: vi.fn() }));

const { signOutAction, changeCodeAction, changeEmailAction } = await import("./actions");

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
};
const IDLE = { status: "idle" } as const;

beforeEach(() => {
  deleted.length = 0;
  vi.clearAllMocks();
  auth.getClaims.mockResolvedValue({ data: { claims: { sub: "u1", email: "a@example.test" } } });
  auth.signOut.mockResolvedValue({ error: null });
  auth.signInWithPassword.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  db.from.mockReturnValue({
    select: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }),
  });
});

describe("signOutAction (AC62, REV-3, REV-12)", () => {
  it("signs out this device only, clears the sb-* cookies and goes to the login", async () => {
    await expect(signOutAction()).rejects.toMatchObject({ to: "/accesso" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(deleted).toEqual(["sb-127-auth-token", "sb-127-auth-token.0"]);
  });

  it("clears the cookies even when signOut RETURNS an error (backend unreachable)", async () => {
    auth.signOut.mockResolvedValue({ error: { status: 0, message: "fetch failed" } });
    await expect(signOutAction()).rejects.toMatchObject({ to: "/accesso" });
    expect(deleted).toHaveLength(2);
  });

  it("clears the cookies even when signOut throws", async () => {
    auth.signOut.mockRejectedValue(new TypeError("fetch failed"));
    await expect(signOutAction()).rejects.toMatchObject({ to: "/accesso" });
    expect(deleted).toHaveLength(2);
  });
});

describe("changeCodeAction (AC56): the current code is required", () => {
  const fields = { currentCode: "Current-code-77", newCode: "Brand-new-code-31" };

  it("a wrong current code never reaches changeOwnCode and is reported on its field", async () => {
    verifyCurrentCode.mockResolvedValue({ status: "invalid" });
    const state = await changeCodeAction(IDLE, form(fields));
    expect(changeOwnCode).not.toHaveBeenCalled();
    expect(state).toMatchObject({ status: "error", field: { name: "currentCode" } });
    expect(verifyCurrentCode).toHaveBeenCalledWith({
      email: "a@example.test",
      code: "Current-code-77",
      ip: "203.0.113.7",
    });
  });

  it("a blocked email gets the same 'troppi tentativi' text and nothing changes", async () => {
    verifyCurrentCode.mockResolvedValue({ status: "blocked" });
    const state = await changeCodeAction(IDLE, form(fields));
    expect(state).toMatchObject({
      status: "error",
      message: expect.stringContaining("Troppi tentativi"),
    });
    expect(changeOwnCode).not.toHaveBeenCalled();
  });

  it("a weak new code is refused before the current code is even checked", async () => {
    const state = await changeCodeAction(IDLE, form({ ...fields, newCode: "short1" }));
    expect(state).toMatchObject({ status: "error", field: { name: "newCode" } });
    expect(verifyCurrentCode).not.toHaveBeenCalled();
    expect(changeOwnCode).not.toHaveBeenCalled();
  });

  it("without a session nothing is checked or changed", async () => {
    auth.getClaims.mockResolvedValue({ data: null });
    const state = await changeCodeAction(IDLE, form(fields));
    expect(state.status).toBe("error");
    expect(verifyCurrentCode).not.toHaveBeenCalled();
    expect(changeOwnCode).not.toHaveBeenCalled();
  });

  it("a verified code changes it on the caller's own id, then signs in again", async () => {
    verifyCurrentCode.mockResolvedValue({ status: "ok" });
    changeOwnCode.mockResolvedValue({ ok: true, userId: "u1" });
    const state = await changeCodeAction(IDLE, form(fields));
    expect(changeOwnCode).toHaveBeenCalledWith(db, "u1", "Brand-new-code-31");
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: "a@example.test",
      password: "Brand-new-code-31",
    });
    expect(state.status).toBe("success");
  });
});

describe("changeEmailAction (AC58): twice, plus the current code", () => {
  const fields = {
    newEmail: "new@example.test",
    newEmailConfirm: "new@example.test",
    currentCode: "Current-code-77",
  };

  it("a wrong current code never reaches changeOwnEmail", async () => {
    verifyCurrentCode.mockResolvedValue({ status: "invalid" });
    const state = await changeEmailAction(IDLE, form(fields));
    expect(changeOwnEmail).not.toHaveBeenCalled();
    expect(state).toMatchObject({ status: "error", field: { name: "currentCode" } });
  });

  it("two different emails stop before the current code is checked", async () => {
    const state = await changeEmailAction(
      IDLE,
      form({ ...fields, newEmailConfirm: "x@example.test" }),
    );
    expect(state).toMatchObject({ status: "error", field: { name: "newEmailConfirm" } });
    expect(verifyCurrentCode).not.toHaveBeenCalled();
    expect(changeOwnEmail).not.toHaveBeenCalled();
  });

  it("a blocked email changes nothing", async () => {
    verifyCurrentCode.mockResolvedValue({ status: "blocked" });
    await changeEmailAction(IDLE, form(fields));
    expect(changeOwnEmail).not.toHaveBeenCalled();
  });

  it("a verified code changes the email on the caller's own id", async () => {
    verifyCurrentCode.mockResolvedValue({ status: "ok" });
    changeOwnEmail.mockResolvedValue({
      ok: true,
      userId: "u1",
      oldEmail: "a@example.test",
      newEmail: "new@example.test",
    });
    db.rpc.mockResolvedValue({ data: null, error: null });
    auth.refreshSession.mockResolvedValue({});
    const state = await changeEmailAction(IDLE, form(fields));
    expect(changeOwnEmail).toHaveBeenCalledWith(db, "u1", "new@example.test");
    expect(db.rpc).toHaveBeenCalledWith("sync_my_email");
    expect(state.status).toBe("success");
  });
});
