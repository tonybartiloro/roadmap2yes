import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));
const auth = { getClaims: vi.fn() };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth }) }));
const saveTheme = vi.fn();
vi.mock("./data", () => ({ saveTheme }));

const { saveThemeAction } = await import("./actions");

beforeEach(() => {
  vi.clearAllMocks();
  auth.getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
});

describe("saveThemeAction", () => {
  it("rejects a malformed id before touching the session or the database", async () => {
    for (const bad of [42, "", "Giardino", "a b", "x".repeat(41)]) {
      expect(await saveThemeAction(bad)).toMatchObject({ ok: false, code: "invalid" });
    }
    expect(auth.getClaims).not.toHaveBeenCalled();
    expect(saveTheme).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("answers forbidden without claims and writes nothing", async () => {
    auth.getClaims.mockResolvedValue({ data: null });
    expect(await saveThemeAction("sera")).toMatchObject({ ok: false, code: "forbidden" });
    expect(saveTheme).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("revalidates only the page, and only on success", async () => {
    saveTheme.mockResolvedValueOnce({ ok: false, code: "unknown", message: "x" });
    await saveThemeAction("sera");
    expect(revalidatePath).not.toHaveBeenCalled();
    saveTheme.mockResolvedValueOnce({ ok: true });
    expect(await saveThemeAction("sera")).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/altro/aspetto");
  });
});
