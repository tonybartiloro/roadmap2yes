import { afterEach, describe, expect, it, vi } from "vitest";
import { ExportLoadError, gatherGuests, gatherRsvp, prepareExport, type Db } from "./data";

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

describe("gatherRsvp (AC13, QA-16)", () => {
  const empty: Reply = { data: [], error: null };

  it("maps answers and link states without ever selecting token_hash", async () => {
    const selected: string[] = [];
    const db = fakeDb(empty, {
      rsvp_responses: {
        data: [
          {
            id: "g1",
            status: "yes",
            diet: ["vegan"],
            diet_note: "no noci",
            source: "guest",
            answered_at: "2027-01-01T10:00:00Z",
          },
        ],
        error: null,
      },
      rsvp_links: {
        data: [
          {
            id: "l1",
            group_id: "gr1",
            guest_id: null,
            created_at: "2027-01-01T09:00:00Z",
            revoked_at: null,
            shared_at: null,
          },
        ],
        error: null,
      },
    });
    const from = db.from.bind(db);
    db.from = ((table: string) => {
      const builder = from(table as never) as unknown as Record<string, unknown>;
      const select = builder["select"] as (cols: string) => unknown;
      builder["select"] = (cols: string) => {
        selected.push(cols);
        return select(cols);
      };
      return builder;
    }) as never;
    const out = await gatherRsvp(db);
    expect(out.rsvpResponses).toEqual([
      {
        guestId: "g1",
        status: "yes",
        diet: ["vegan"],
        dietNote: "no noci",
        source: "guest",
        answeredAt: "2027-01-01T10:00:00Z",
      },
    ]);
    expect(out.rsvpLinks[0]).toMatchObject({ id: "l1", groupId: "gr1", guestId: null });
    expect(selected.join(" ")).not.toMatch(/token_hash|\*/);
  });

  it("missing tables give empty lists; another failure is a fixed error without cause", async () => {
    const missing: Reply = { data: null, error: { code: "42P01", message: "x" } };
    expect(
      await gatherRsvp(fakeDb(empty, { rsvp_responses: missing, rsvp_links: missing })),
    ).toEqual({ rsvpResponses: [], rsvpLinks: [] });
    const boom: Reply = { data: null, error: { code: "XX000", message: `boom ${PERSONAL}` } };
    const error = await gatherRsvp(fakeDb(empty, { rsvp_responses: boom })).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ExportLoadError);
    expect((error as ExportLoadError).cause).toBeUndefined();
    expect(JSON.stringify(error)).not.toContain(PERSONAL);
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
