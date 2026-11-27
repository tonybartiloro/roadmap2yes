import { describe, expect, it } from "vitest";
import type { Db } from "@/features/guests/data";
import { LINK_ERROR } from "./constants";
import {
  CREATE_BATCH,
  createLinks,
  markShared,
  revokeLink,
  rotateLink,
  unmarkShared,
} from "./data";

type RpcReply = { data: unknown; error: { code?: string; message?: string } | null };

/** A `Db` whose `rpc` answers from a queue (or a function) and records every call. */
function fakeDb(reply: (name: string, args: Record<string, unknown>) => RpcReply) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const db = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return reply(name, args);
    },
  } as unknown as Db;
  return { db, calls };
}

const SECRET = "local-fake-rsvp-secret-0123456789abcdef";
const NOW = new Date("2027-01-10T10:00:00Z");
const LINK = "00000000-0000-4000-8000-0000000000a1";
const error = (code: string, message: string): RpcReply => ({
  data: null,
  error: { code, message },
});

describe("createLinks batching", () => {
  it(`sends ${CREATE_BATCH} items per call and adds up what was created`, async () => {
    const { db, calls } = fakeDb((_n, args) => ({
      data: { created: (args["p_items"] as unknown[]).map((_, i) => `id${i}`) },
      error: null,
    }));
    const targets = Array.from({ length: 1001 }, (_, i) => ({
      guestId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    }));
    const result = await createLinks(db, { secret: SECRET, now: NOW, targets });
    expect(result).toEqual({ ok: true, data: { created: 1001 } });
    expect(calls.map((c) => (c.args["p_items"] as unknown[]).length)).toEqual([1000, 1]);
    const first = (calls[0]!.args["p_items"] as Record<string, string>[])[0]!;
    expect(first["token_hash"]).toMatch(/^\\x[0-9a-f]{64}$/);
    expect(first).not.toHaveProperty("token");
  });

  it("stops at the first failing batch and reports it", async () => {
    let n = 0;
    const { db, calls } = fakeDb(() =>
      ++n === 1 ? { data: { created: [] }, error: null } : error("P0001", "link_expired"),
    );
    const targets = Array.from({ length: 1001 }, () => ({ groupId: LINK }));
    expect(await createLinks(db, { secret: SECRET, now: NOW, targets })).toMatchObject({
      ok: false,
      code: "link_expired",
    });
    expect(calls).toHaveLength(2);
  });
});

describe("error mapping (AC12): fixed texts by code, never the database message", () => {
  const leaky = "boom Zedmario zed@example.test";
  const run = (e: RpcReply) =>
    rotateLink(fakeDb(() => e).db, { secret: SECRET, now: NOW, linkId: LINK });

  it("link_expired and link_not_found keep their own code and Italian text", async () => {
    expect(await run(error("P0001", "link_expired"))).toMatchObject({
      ok: false,
      code: "link_expired",
      message: expect.stringContaining("scaduti"),
    });
    expect(await run(error("P0001", "link_not_found"))).toMatchObject({
      code: "link_not_found",
    });
  });
  it("invalid_* and unknown errors become the generic message, 42501 is forbidden", async () => {
    for (const message of ["invalid_link", "invalid_items", "too_many_items", leaky]) {
      const result = await run(error("P0001", message));
      expect(result).toMatchObject({ ok: false, code: "unknown", message: LINK_ERROR });
      expect(JSON.stringify(result)).not.toContain("Zedmario");
    }
    expect(await run(error("42501", leaky))).toMatchObject({ ok: false, code: "forbidden" });
  });
  it("a missing function (code before the migration) is not_migrated", async () => {
    expect(await run(error("PGRST202", "not found"))).toMatchObject({
      ok: false,
      code: "not_migrated",
    });
  });
  it("a business code raised under another SQLSTATE is not trusted", async () => {
    expect(await run(error("XX000", "link_expired"))).toMatchObject({ code: "unknown" });
  });
  it("revoke and mark map their codes too", async () => {
    const { db } = fakeDb(() => error("P0001", "link_not_working"));
    expect(await markShared(db, { linkId: LINK, now: NOW })).toMatchObject({
      ok: false,
      code: "link_not_working",
    });
    expect(await revokeLink(db, { linkId: LINK })).toMatchObject({
      ok: false,
      code: "link_not_working",
    });
  });
});

describe("unmarkShared", () => {
  it("hands the previous snapshot over unchanged", async () => {
    const previous = {
      shared_at: "2027-01-05T09:00:00Z",
      shared_by: "00000000-0000-4000-8000-0000000000b1",
      people: ["00000000-0000-4000-8000-0000000000c1"],
    };
    const { db, calls } = fakeDb(() => ({ data: { link_id: LINK }, error: null }));
    expect(await unmarkShared(db, { linkId: LINK, previous })).toEqual({
      ok: true,
      data: { linkId: LINK },
    });
    expect(calls[0]).toEqual({
      name: "rsvp_unmark_shared",
      args: { p_link_id: LINK, p_previous: previous },
    });
  });
});
