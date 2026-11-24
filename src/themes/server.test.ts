import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieGet = vi.fn();
const headerHas = vi.fn();
let cookiesImpl: () => Promise<unknown>;
vi.mock("next/headers", () => ({
  cookies: () => cookiesImpl(),
  headers: async () => ({ has: headerHas }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const { getActiveThemeId, withTimeout, LOOKUP_TIMEOUT_MS } = await import("./server");

beforeEach(() => {
  cookieGet.mockReset();
  headerHas.mockReset().mockReturnValue(false);
  cookiesImpl = async () => ({ get: cookieGet });
  cookieGet.mockReturnValue(undefined);
  vi.useRealTimers();
});

describe("getActiveThemeId (DB, cookie, giardino)", () => {
  it("uses the approved id from the database first", async () => {
    cookieGet.mockReturnValue({ value: "boho" });
    expect(await getActiveThemeId(async () => "sera")).toBe("sera");
  });

  it("falls back to the cookie when the lookup returns null, rejects or throws", async () => {
    cookieGet.mockReturnValue({ value: "boho" });
    expect(await getActiveThemeId(async () => null)).toBe("boho");
    expect(await getActiveThemeId(() => Promise.reject(new Error("db down")))).toBe("boho");
    expect(
      await getActiveThemeId(() => {
        throw new Error("sync");
      }),
    ).toBe("boho");
  });

  it("ignores an unapproved db id and an invalid cookie", async () => {
    cookieGet.mockReturnValue({ value: "boho" });
    expect(await getActiveThemeId(async () => "nope")).toBe("boho");
    cookieGet.mockReturnValue({ value: '"><script>' });
    expect(await getActiveThemeId(async () => "nope")).toBe("giardino");
    cookieGet.mockReturnValue(undefined);
    expect(await getActiveThemeId(async () => null)).toBe("giardino");
  });

  it("never calls the lookup when the proxy flagged an outage", async () => {
    headerHas.mockReturnValue(true);
    cookieGet.mockReturnValue({ value: "velluto" });
    const lookup = vi.fn(async () => "sera");
    expect(await getActiveThemeId(lookup)).toBe("velluto");
    expect(lookup).not.toHaveBeenCalled();
    expect(headerHas).toHaveBeenCalledWith("x-r2y-backend");
  });

  it("returns giardino when cookies() itself throws", async () => {
    cookiesImpl = async () => {
      throw new Error("no request scope");
    };
    expect(await getActiveThemeId(async () => "sera")).toBe("giardino");
  });

  it("does not wait for a lookup that hangs (whole-lookup timeout)", async () => {
    vi.useFakeTimers();
    cookieGet.mockReturnValue({ value: "toscana" });
    const pending = getActiveThemeId(() => new Promise<string | null>(() => {}));
    await vi.advanceTimersByTimeAsync(LOOKUP_TIMEOUT_MS + 1);
    expect(await pending).toBe("toscana");
  });
});

describe("withTimeout", () => {
  it("returns the value, the fallback on rejection and on timeout", async () => {
    expect(await withTimeout(Promise.resolve(1), 50, 0)).toBe(1);
    expect(await withTimeout(Promise.reject(new Error("x")), 50, 0)).toBe(0);
    vi.useFakeTimers();
    const slow = withTimeout(new Promise<number>(() => {}), 100, -1);
    await vi.advanceTimersByTimeAsync(101);
    expect(await slow).toBe(-1);
  });
});
