import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));
const auth = { getClaims: vi.fn() };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth }) }));
const setPreference = vi.fn();
vi.mock("./data", () => ({ setPreference }));

const { setPreferenceAction } = await import("./actions");

beforeEach(() => {
  vi.clearAllMocks();
  auth.getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
});

describe("setPreferenceAction", () => {
  it("rejects a wrong shape before touching the session or the database", async () => {
    for (const bad of [
      null,
      {},
      { kind: "payments", enabled: true },
      { kind: "digest", enabled: "no" },
    ]) {
      expect(await setPreferenceAction(bad)).toMatchObject({ ok: false, code: "invalid" });
    }
    expect(auth.getClaims).not.toHaveBeenCalled();
    expect(setPreference).not.toHaveBeenCalled();
  });

  it("answers forbidden without claims and writes nothing", async () => {
    auth.getClaims.mockResolvedValue({ data: null });
    expect(await setPreferenceAction({ kind: "digest", enabled: false })).toMatchObject({
      ok: false,
      code: "forbidden",
    });
    expect(setPreference).not.toHaveBeenCalled();
  });

  it("writes for the verified user and revalidates only on success", async () => {
    setPreference.mockResolvedValueOnce({ ok: false, code: "unknown", message: "x" });
    await setPreferenceAction({ kind: "digest", enabled: false });
    expect(revalidatePath).not.toHaveBeenCalled();
    setPreference.mockResolvedValueOnce({
      ok: true,
      preferences: { reminders: true, digest: false },
    });
    await setPreferenceAction({ kind: "digest", enabled: false });
    expect(setPreference).toHaveBeenLastCalledWith(expect.anything(), "user-1", "digest", false);
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/altro/promemoria");
  });
});
