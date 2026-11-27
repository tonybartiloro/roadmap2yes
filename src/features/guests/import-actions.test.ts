import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  claims: { claims: { sub: "00000000-0000-4000-8000-000000000001" } } as { claims: unknown } | null,
  revalidated: [] as string[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: state.claims }) },
    rpc: state.rpc,
  }),
}));
vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => {
    state.revalidated.push(path);
  },
}));

import { importGuestsAction, undoGuestImportAction } from "./import-actions";

// Invented personal values: none may reach a log call or a returned error (ADR-0002, REV-44).
const SECRET_NAME = "Zedmario";
const SECRET_MAIL = "zed.secret@example.test";
const SECRET_NOTE = "allergia segretissima";
const SECRET_GROUP = "Famiglia Zetarossi";

const row = (extra: Record<string, unknown> = {}) => ({
  first_name: SECRET_NAME,
  last_name: "Zetarossi",
  category: "adult",
  side: null,
  group: SECRET_GROUP,
  phone: null,
  email: SECRET_MAIL,
  notes: SECRET_NOTE,
  ...extra,
});

const logs = {
  log: vi.spyOn(console, "log"),
  info: vi.spyOn(console, "info"),
  warn: vi.spyOn(console, "warn"),
  error: vi.spyOn(console, "error"),
  debug: vi.spyOn(console, "debug"),
};
const logged = () => JSON.stringify(Object.values(logs).flatMap((spy) => spy.mock.calls)) ?? "";
const leaks = (value: unknown) =>
  [SECRET_NAME, SECRET_MAIL, SECRET_NOTE, SECRET_GROUP].filter((secret) =>
    JSON.stringify(value).includes(secret),
  );

beforeEach(() => {
  state.rpc.mockReset();
  state.revalidated = [];
  state.claims = { claims: { sub: "00000000-0000-4000-8000-000000000001" } };
  for (const spy of Object.values(logs)) spy.mockClear();
});
afterEach(() => {
  expect(leaks(logged())).toEqual([]);
});

describe("importGuestsAction", () => {
  it("imports the ready rows through the RPC and refreshes the list and the settings band", async () => {
    state.rpc.mockResolvedValue({
      data: { batch_id: "00000000-0000-4000-8000-0000000000aa", guests: 2, groups: 1 },
      error: null,
    });
    const result = await importGuestsAction({ rows: [row(), row({ first_name: "Anna" })] });
    expect(result).toEqual({
      ok: true,
      data: { batchId: "00000000-0000-4000-8000-0000000000aa", guests: 2, groups: 1 },
    });
    expect(state.rpc).toHaveBeenCalledWith("import_guests", {
      p_rows: [row(), row({ first_name: "Anna" })],
    });
    expect(state.revalidated).toEqual(["/invitati", "/altro/impostazioni"]);
  });

  it("re-checks the rows with the browser's rules, before the database, with fixed texts", async () => {
    const bad = [
      await importGuestsAction({ rows: [row({ email: "senza-chiocciola" })] }),
      await importGuestsAction({ rows: [row({ first_name: "  " })] }),
      await importGuestsAction({ rows: [row({ phone: "12345" })] }),
      await importGuestsAction({ rows: [row({ category: "senior" })] }),
      await importGuestsAction({ rows: [row({ group: "g".repeat(81) })] }),
      await importGuestsAction({ rows: [] }),
      await importGuestsAction({ rows: "x" }),
      await importGuestsAction(null),
    ];
    for (const result of bad) {
      expect(result).toMatchObject({ ok: false });
      expect(leaks(result)).toEqual([]);
      expect((result as { message: string }).message).not.toMatch(/Invalid|expected/);
    }
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("refuses more than 500 rows and a payload over 900 KB", async () => {
    const many = await importGuestsAction({ rows: Array.from({ length: 501 }, () => row()) });
    expect(many).toMatchObject({ ok: false, code: "too_many_rows" });
    const big = await importGuestsAction({
      rows: Array.from({ length: 500 }, () =>
        row({
          first_name: "あ".repeat(80),
          last_name: "あ".repeat(80),
          notes: "あ".repeat(500),
          group: "あ".repeat(80),
        }),
      ),
    });
    expect(big).toMatchObject({ ok: false, code: "payload_too_large" });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("answers a database failure with a fixed text, never its message or details", async () => {
    for (const error of [
      { code: "23514", message: `check violated by ${SECRET_NAME} ${SECRET_MAIL}` },
      { code: "XX000", message: `boom: ${SECRET_NOTE}`, details: `Failing row (${SECRET_NAME})` },
      { message: `random text ${SECRET_GROUP}` },
    ]) {
      state.rpc.mockResolvedValueOnce({ data: null, error });
      const result = await importGuestsAction({ rows: [row()] });
      expect(result).toMatchObject({ ok: false });
      expect(leaks(result)).toEqual([]);
    }
    expect(state.revalidated).toEqual([]);
  });

  it("maps the RPC's own codes and a denial to their fixed texts", async () => {
    state.rpc.mockResolvedValueOnce({ data: null, error: { message: "too_many_rows" } });
    expect(await importGuestsAction({ rows: [row()] })).toMatchObject({
      ok: false,
      code: "too_many_rows",
    });
    state.rpc.mockResolvedValueOnce({ data: null, error: { message: "payload_too_large" } });
    expect(await importGuestsAction({ rows: [row()] })).toMatchObject({
      ok: false,
      code: "payload_too_large",
    });
    state.rpc.mockResolvedValueOnce({ data: null, error: { message: "invalid_row" } });
    expect(await importGuestsAction({ rows: [row()] })).toMatchObject({
      ok: false,
      code: "invalid_row",
    });
    state.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: SECRET_NAME } });
    const denied = await importGuestsAction({ rows: [row()] });
    expect(denied).toMatchObject({ ok: false, code: "forbidden" });
    expect(leaks(denied)).toEqual([]);
  });

  it("refuses a NUL character in any field, and answers an unreadable success as an unknown outcome", async () => {
    expect(await importGuestsAction({ rows: [row({ notes: "ab\u0000cd" })] })).toMatchObject({
      ok: false,
      code: "invalid_row",
    });
    expect(state.rpc).not.toHaveBeenCalled();
    state.rpc.mockResolvedValueOnce({ data: "garbage", error: null });
    const unknown = await importGuestsAction({ rows: [row()] });
    expect(unknown).toMatchObject({ ok: false, code: "unknown_outcome" });
    expect(unknown).toMatchObject({ message: expect.stringContaining("Controlla la lista") });
    // a database ERROR is a rolled-back transaction: a known failure, not an unknown outcome
    state.rpc.mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "x" } });
    expect(await importGuestsAction({ rows: [row()] })).toMatchObject({
      ok: false,
      code: "unknown",
    });
  });

  it("asks to sign in again without a session", async () => {
    state.claims = null;
    expect(await importGuestsAction({ rows: [row()] })).toMatchObject({
      ok: false,
      code: "session",
    });
    expect(state.rpc).not.toHaveBeenCalled();
  });
});

describe("undoGuestImportAction", () => {
  const batchId = "00000000-0000-4000-8000-0000000000aa";

  it("removes the batch through the RPC and refreshes", async () => {
    state.rpc.mockResolvedValue({ data: { guests: 3, groups: 1, skipped: 2 }, error: null });
    expect(await undoGuestImportAction({ batchId })).toEqual({
      ok: true,
      data: { guests: 3, groups: 1, skipped: 2 },
    });
    expect(state.rpc).toHaveBeenCalledWith("undo_guest_import", { p_batch_id: batchId });
    expect(state.revalidated).toEqual(["/invitati", "/altro/impostazioni"]);
  });

  it("reports no skipped people when the database does not say (schema before R-04)", async () => {
    state.rpc.mockResolvedValue({ data: { guests: 3, groups: 1 }, error: null });
    expect(await undoGuestImportAction({ batchId })).toEqual({
      ok: true,
      data: { guests: 3, groups: 1, skipped: 0 },
    });
  });

  it("rejects a malformed id and hides a database failure", async () => {
    expect(await undoGuestImportAction({ batchId: "x" })).toMatchObject({
      ok: false,
      code: "invalid",
    });
    state.rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: SECRET_NAME } });
    const failed = await undoGuestImportAction({ batchId });
    expect(failed).toMatchObject({ ok: false });
    expect(leaks(failed)).toEqual([]);
  });
});
