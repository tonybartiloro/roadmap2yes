import { afterEach, describe, expect, it, vi } from "vitest";
import { ExportLoadError, gatherGuests, prepareExport, type Db } from "./data";

type Reply = { data: unknown; error: { code?: string; message: string } | null };

/**
 * A query builder double: every chained call returns itself, awaiting it gives the reply of the
 * table. `guests` answers with `guestsReply`; every other table is empty.
 */
function fakeDb(guestsReply: Reply, extra: Record<string, Reply> = {}): Db {
  const ok: Reply = { data: [], error: null };
  const from = (table: string) => {
    const reply = table === "guests" ? guestsReply : (extra[table] ?? ok);
    const b: Record<string, unknown> = {};
    for (const name of ["select", "order", "range", "limit", "eq"]) b[name] = () => b;
    b["maybeSingle"] = async () => ({
      data: table === "weddings" ? { id: "w1" } : null,
      error: null,
    });
    b["then"] = (resolve: (r: Reply) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(reply).then(resolve, reject);
    return b;
  };
  return { from, rpc: async () => ({ data: null, error: null }) } as unknown as Db;
}

const PERSONAL = "Mario Segretissimo 333-0000000";

afterEach(() => vi.restoreAllMocks());

describe("gatherGuests (T14)", () => {
  it("a missing guests table is an empty list, not an error", async () => {
    for (const code of ["42P01", "PGRST205"]) {
      const db = fakeDb({ data: null, error: { code, message: "relation does not exist" } });
      expect(await gatherGuests(db)).toEqual({ guests: [], guestGroups: [], guestTables: [] });
    }
  });

  it("maps rows, marks the deleted ones and keeps the stored side letter", async () => {
    const db = fakeDb({
      data: [
        {
          id: "g1",
          first_name: "Anna",
          last_name: null,
          category: "child",
          side: "B",
          phone: null,
          email: null,
          notes: null,
          group_id: null,
          table_id: null,
          deleted_at: "2026-11-20T10:00:00Z",
          version: 2,
        },
      ],
      error: null,
    });
    const { guests } = await gatherGuests(db);
    expect(guests).toEqual([
      expect.objectContaining({ id: "g1", side: "B", deleted: true, category: "child" }),
    ]);
  });

  it("another failure throws a fixed error without the database text or any cause", async () => {
    const db = fakeDb({ data: null, error: { code: "XX000", message: `boom ${PERSONAL}` } });
    const error = await gatherGuests(db).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ExportLoadError);
    const failure = error as ExportLoadError;
    expect(failure.message).toBe("Esportazione: invitati");
    expect(failure.cause).toBeUndefined();
    expect(JSON.stringify(failure)).not.toContain(PERSONAL);
  });
});

describe("prepareExport with a failing guests read (ADR-0002)", () => {
  it("returns a fixed message and logs nothing with personal values", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => undefined),
    );
    const db = fakeDb({ data: null, error: { code: "XX000", message: `boom ${PERSONAL}` } });
    const result = await prepareExport(db, new Date("2026-11-24T10:00:00Z"));
    expect(result).toEqual({
      ok: false,
      code: "unknown",
      message: "Non riesco a preparare il file. Riprova.",
    });
    expect(JSON.stringify(result)).not.toContain(PERSONAL);
    for (const spy of spies) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(PERSONAL);
    }
  });

  it("a paused service during the guests read is reported as such", async () => {
    const db = fakeDb({ data: null, error: { code: undefined, message: "project is paused" } });
    const result = await prepareExport(db, new Date("2026-11-24T10:00:00Z"));
    expect(result).toMatchObject({ ok: false, code: "unreachable" });
  });
});
