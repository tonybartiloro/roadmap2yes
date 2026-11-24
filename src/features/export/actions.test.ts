import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));
const auth = { getClaims: vi.fn() };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth }) }));
const NOW = new Date("2026-11-24T10:00:00Z");
vi.mock("@/lib/clock", () => ({ getNow: async () => NOW }));
const prepareExport = vi.fn();
vi.mock("./data", () => ({ prepareExport }));

const { prepareExportAction } = await import("./actions");

beforeEach(() => {
  vi.clearAllMocks();
  auth.getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
});

describe("prepareExportAction", () => {
  it("fails without claims and reads nothing", async () => {
    auth.getClaims.mockResolvedValue({ data: null });
    expect(await prepareExportAction()).toMatchObject({ ok: false });
    expect(prepareExport).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("revalidates Home and the page only on success, with the clock's now", async () => {
    prepareExport.mockResolvedValueOnce({ ok: false, code: "unknown", message: "x" });
    await prepareExportAction();
    expect(revalidatePath).not.toHaveBeenCalled();
    prepareExport.mockResolvedValueOnce({ ok: true, bundle: {} });
    await prepareExportAction();
    expect(prepareExport).toHaveBeenLastCalledWith(expect.anything(), NOW);
    expect(revalidatePath.mock.calls.map((c) => c[0])).toEqual(["/", "/altro/esporta"]);
  });
});
