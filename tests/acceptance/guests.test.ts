import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import {
  addPartnerB,
  anonClient,
  createUser,
  createWedding,
  serviceClient,
  signInAs,
  type TestClient,
  type TestPartnerB,
  type TestWedding,
} from "../support/supabase";
import { loose, rows } from "./support/matrix";

/**
 * QA T8 (FEAT-2026-003 AC13, AC11, AC7): the guests module through the API a client really has
 * (PostgREST + real JWTs, local stack). The table-level denials for every role are already in the
 * generated matrix (rls-api.test.ts); this file proves the feature rules around personal data:
 *  - no personal value (name, phone, email, note, group/table name) reaches `audit_log` after
 *    insert, update, soft delete, family, bulk, undo and hard delete, and the Home "Novita" feed
 *    (which reads `audit_log` by table name) never carries guests;
 *  - family and anon can neither read nor write guests, groups, tables, nor use the 3 RPCs;
 *  - hard DELETE only works on rows already soft-deleted.
 * Every value is invented; the sentinels are random so a leak cannot match by chance.
 */

const tag = randomBytes(4).toString("hex");
const S = {
  first: `Zeta${tag}`,
  last: `Quarto${tag}`,
  phone: `+39 000 ${String(parseInt(tag, 16) % 1_000_000).padStart(6, "0")}`,
  email: `zeta.${tag}@example.test`,
  notes: `Allergia ai kiwi ${tag}`,
  group: `Famiglia Segreta ${tag}`,
  table: `Tavolo Segreto ${tag}`,
  first2: `Beta${tag}`,
  phone2: `+39 000 ${String((parseInt(tag, 16) + 7) % 1_000_000).padStart(6, "0")}`,
  notes2: `Vegano rigoroso ${tag}`,
  group2: `Gruppo Rinominato ${tag}`,
  famFirst: `Gamma${tag}`,
  famEmail: `gamma.${tag}@example.test`,
  famNotes: `Celiaco ${tag}`,
  famGroup: `Famiglia ${tag}`,
  famChild: `Delta${tag}`,
};
const PERSONAL_COLUMNS = ["first_name", "last_name", "phone", "email", "notes", "name"];
const GUEST_TABLES = ["guests", "guest_groups", "guest_tables"];
/** the tables the Home "Novita" feed reads (src/features/home/data.ts AUDIT_TABLES) */
const NEWS_TABLES = ["tasks", "budget_versions", "payments"];

type Row = Record<string, unknown>;
const ok = <R extends { data: unknown; error: { message: string } | null }>(
  result: R,
  what: string,
): NonNullable<R["data"]> => {
  if (result.error || result.data === null) throw new Error(`${what}: ${result.error?.message}`);
  return result.data as NonNullable<R["data"]>;
};

describe("guests through the API (AC13, AC11, AC7)", () => {
  let w: TestWedding;
  let b: TestPartnerB;
  let family: { client: TestClient; id: string };
  let stranger: TestClient;
  let guestId: string;
  let groupId: string;
  let tableId: string;
  let familyGroupId: string;
  let familyIds: string[];

  beforeAll(async () => {
    w = await createWedding("sposo");
    b = await addPartnerB(w);
    const fam = await createUser();
    const member = await serviceClient()
      .from("memberships")
      .insert({ wedding_id: w.weddingId, user_id: fam.id, role: "family" });
    if (member.error) throw new Error(`family membership: ${member.error.message}`);
    family = { client: await signInAs(fam), id: fam.id };
    stranger = await signInAs(await createUser());

    const db = w.founderClient;
    groupId = ok(
      await db.from("guest_groups").insert({ wedding_id: w.weddingId, name: S.group }).select("id").single(),
      "group",
    ).id;
    tableId = ok(
      await db
        .from("guest_tables")
        .insert({ wedding_id: w.weddingId, name: S.table, capacity: 8 })
        .select("id")
        .single(),
      "table",
    ).id;
    guestId = ok(
      await db
        .from("guests")
        .insert({
          wedding_id: w.weddingId,
          first_name: S.first,
          last_name: S.last,
          phone: S.phone,
          email: S.email,
          notes: S.notes,
          side: "both",
          group_id: groupId,
          table_id: tableId,
        })
        .select("id")
        .single(),
      "guest",
    ).id;

    // update (guest, group, table), the family RPC, bulk ops and their undo, soft delete, hard delete
    ok(
      await db
        .from("guests")
        .update({ first_name: S.first2, phone: S.phone2, notes: S.notes2 })
        .eq("id", guestId)
        .select("id"),
      "update guest",
    );
    ok(await db.from("guest_groups").update({ name: S.group2 }).eq("id", groupId).select("id"), "update group");
    ok(await db.from("guest_tables").update({ name: `${S.table} bis`, capacity: 6 }).eq("id", tableId).select("id"), "update table");
    const created = ok(
      await db.rpc("create_guest_family", {
        p_name: S.famGroup,
        p_side: "A",
        p_rows: [
          { first_name: S.famFirst, last_name: S.last, email: S.famEmail, notes: S.famNotes },
          { first_name: S.famChild, category: "child" },
        ],
      }),
      "family",
    ) as { group_id: string; guest_ids: string[] };
    familyGroupId = created.group_id;
    familyIds = created.guest_ids;
    const bulk = ok(
      await db.rpc("guests_bulk", { p_ids: familyIds, p_op: "assign_group", p_target: groupId }),
      "bulk assign",
    ) as { previous: unknown[] };
    ok(await db.rpc("guests_bulk_undo", { p_previous: bulk.previous as never }), "undo assign");
    const del = ok(await db.rpc("guests_bulk", { p_ids: familyIds, p_op: "delete" }), "bulk delete") as {
      previous: unknown[];
    };
    ok(await db.rpc("guests_bulk_undo", { p_previous: del.previous as never }), "undo delete");
    ok(await db.rpc("guests_bulk", { p_ids: familyIds, p_op: "delete" }), "bulk delete again");
    ok(await db.rpc("guests_bulk", { p_ids: familyIds, p_op: "restore" }), "bulk restore");
    // soft then hard delete of the first guest and of the group
    ok(await db.from("guests").update({ deleted_at: new Date().toISOString() }).eq("id", guestId).select("id"), "soft delete");
    ok(await db.from("guests").delete().eq("id", guestId).select("id"), "hard delete");
    ok(await db.from("guest_groups").update({ deleted_at: new Date().toISOString() }).eq("id", familyGroupId).select("id"), "soft delete group");
  }, 90_000);

  describe("AC13: no personal data in the audit log or in Novita", () => {
    let audit: Row[];
    beforeAll(async () => {
      // the partner reads the wedding's audit log exactly as it would (RLS: audit/read)
      const result = await b.client.from("audit_log").select("*").eq("wedding_id", w.weddingId);
      audit = ok(result, "audit") as Row[];
    });

    it("the guest tables DO leave a trace: who, when, which operation (not vacuous)", () => {
      for (const table of GUEST_TABLES) {
        const own = audit.filter((r) => r["table_name"] === table);
        expect(own.length, table).toBeGreaterThan(0);
      }
      const ops = new Set(audit.filter((r) => r["table_name"] === "guests").map((r) => r["op"]));
      expect([...ops].sort()).toEqual(["DELETE", "INSERT", "UPDATE"]);
      for (const r of audit.filter((r) => GUEST_TABLES.includes(r["table_name"] as string))) {
        expect(r["actor_id"]).not.toBeNull();
        expect(r["row_id"]).not.toBeNull();
      }
    });

    it("no sentinel value (first and last name, phone, email, notes, group and table name) appears anywhere in the audit log", () => {
      const text = JSON.stringify(audit);
      for (const [label, value] of Object.entries(S)) {
        expect(text.includes(value), `audit_log leaks ${label}`).toBe(false);
      }
    });

    it("no personal column is a key of old_data/new_data, on any op", () => {
      for (const r of audit.filter((r) => GUEST_TABLES.includes(r["table_name"] as string))) {
        for (const data of [r["old_data"], r["new_data"]] as (Row | null)[]) {
          for (const column of PERSONAL_COLUMNS) {
            expect(Object.keys(data ?? {}), `${r["table_name"]} ${r["op"]}`).not.toContain(column);
          }
        }
      }
    });

    it("the Novita feed reads only tables that are not guest tables, and its real query returns no guest row", async () => {
      const source = readFileSync("src/features/home/data.ts", "utf8");
      const declared = /const AUDIT_TABLES = \[([^\]]*)\]/.exec(source)?.[1] ?? "";
      expect([...declared.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]).sort()).toEqual(
        [...NEWS_TABLES].sort(),
      );
      // the same query shape as newsSection(): partner B looks at what the founder did
      const feed = await b.client
        .from("audit_log")
        .select("id, at, actor_id, table_name, op, old_data, new_data")
        .in("table_name", NEWS_TABLES)
        .gt("at", "2000-01-01T00:00:00Z")
        .neq("actor_id", b.user.id)
        .order("at", { ascending: false })
        .limit(200);
      const items = ok(feed, "feed") as Row[];
      expect(items.every((r) => !GUEST_TABLES.includes(r["table_name"] as string))).toBe(true);
      for (const value of Object.values(S)) expect(JSON.stringify(items)).not.toContain(value);
    });

    it("a `family` member and a stranger read no audit row at all", async () => {
      for (const client of [family.client, stranger]) {
        const result = await client.from("audit_log").select("*").eq("wedding_id", w.weddingId);
        expect(result.error).toBeNull();
        expect(result.data).toEqual([]);
      }
    });
  });

  describe("AC13: family and anon are denied (read, write, RPC)", () => {
    const create = (client: TestClient) =>
      client.rpc("create_guest_family", { p_name: "X", p_side: "A", p_rows: [{ first_name: "Y" }] });
    const bulk = (client: TestClient) =>
      client.rpc("guests_bulk", { p_ids: familyIds, p_op: "delete" });
    const undo = (client: TestClient) =>
      client.rpc("guests_bulk_undo", { p_previous: [] as never });

    it("family: sees no guest, group or table, and cannot insert", async () => {
      for (const table of GUEST_TABLES) {
        const read = await loose(family.client).from(table).select("*").eq("wedding_id", w.weddingId);
        expect(read.error, table).toBeNull();
        expect(rows(read), table).toEqual([]);
      }
      const insert = await family.client
        .from("guests")
        .insert({ wedding_id: w.weddingId, first_name: "Intruso" });
      expect(insert.error?.code).toBe("42501");
    });

    it("family: create_guest_family is refused (42501); bulk and undo change nothing", async () => {
      expect((await create(family.client)).error?.code).toBe("42501");
      const bulked = await bulk(family.client);
      expect(bulked.error).toBeNull();
      expect((bulked.data as { changed: number }).changed).toBe(0);
      const undone = await undo(family.client);
      expect(undone.error).toBeNull();
      expect((undone.data as { restored: number }).restored).toBe(0);
      const still = await serviceClient().from("guests").select("deleted_at").in("id", familyIds);
      expect(still.data?.every((r) => r.deleted_at === null)).toBe(true);
    });

    it("family: cannot restore or hard-delete rows through the table either", async () => {
      const upd = await family.client.from("guests").update({ first_name: "Hack" }).in("id", familyIds).select("id");
      expect(upd.data).toEqual([]);
      const del = await family.client.from("guests").delete().in("id", familyIds).select("id");
      expect(del.data).toEqual([]);
    });

    it("anon: every table and every RPC is refused (42501)", async () => {
      const anon = anonClient();
      for (const table of GUEST_TABLES) {
        expect((await loose(anon).from(table).select("*").limit(1)).error?.code, table).toBe("42501");
      }
      for (const call of [create, bulk, undo]) {
        expect((await call(anon)).error?.code).toBe("42501");
      }
    });

    it("a stranger (no membership): reads nothing, create_guest_family refused", async () => {
      const read = await stranger.from("guests").select("*").eq("wedding_id", w.weddingId);
      expect(read.data).toEqual([]);
      expect((await create(stranger)).error?.code).toBe("42501");
    });
  });

  describe("AC11: hard DELETE only works on rows that were already deleted", () => {
    it("a live guest cannot be deleted through the API; once soft-deleted it can, and it is gone", async () => {
      const db = w.founderClient;
      const created = ok(
        await db.from("guests").insert({ wedding_id: w.weddingId, first_name: `Epsilon${tag}` }).select("id").single(),
        "extra",
      );
      const live = await db.from("guests").delete().eq("id", created.id).select("id");
      expect(live.data).toEqual([]);
      expect(
        (await serviceClient().from("guests").select("id").eq("id", created.id)).data,
      ).toHaveLength(1);
      ok(await db.from("guests").update({ deleted_at: new Date().toISOString() }).eq("id", created.id).select("id"), "soft");
      const gone = await db.from("guests").delete().eq("id", created.id).select("id");
      expect(gone.data).toHaveLength(1);
      expect((await serviceClient().from("guests").select("id").eq("id", created.id)).data).toEqual([]);
    });

    it("the hard-deleted guest of the setup is gone, and a group member loses only the pointer", async () => {
      expect((await serviceClient().from("guests").select("id").eq("id", guestId)).data).toEqual([]);
      const groupOf = async () =>
        ok(
          await serviceClient().from("guests").select("group_id").eq("id", familyIds[0]!).single(),
          "member",
        ).group_id;
      // the family group was soft-deleted in the setup: the pointer is kept until the hard delete
      expect(await groupOf()).toBe(familyGroupId);
      const hard = await w.founderClient.from("guest_groups").delete().eq("id", familyGroupId).select("id");
      expect(hard.data).toHaveLength(1);
      expect(await groupOf()).toBeNull();
      const alive = await serviceClient().from("guests").select("deleted_at").eq("id", familyIds[0]!).single();
      expect(alive.data?.deleted_at).toBeNull();
    });
  });

  describe("AC7: bulk Annulla puts the real previous values back", () => {
    it("assign_group then undo restores the previous group; delete then undo restores the guests", async () => {
      const db = w.founderClient;
      const solo = ok(
        await db.from("guests").insert({ wedding_id: w.weddingId, first_name: `Zhi${tag}` }).select("id").single(),
        "solo",
      ).id;
      const assign = ok(
        await db.rpc("guests_bulk", { p_ids: [solo], p_op: "assign_group", p_target: groupId }),
        "assign",
      ) as { previous: { group_id: string | null }[]; changed: number };
      expect(assign.changed).toBe(1);
      expect(assign.previous[0]!.group_id).toBeNull();
      ok(await db.rpc("guests_bulk_undo", { p_previous: assign.previous as never }), "undo");
      expect(ok(await db.from("guests").select("group_id").eq("id", solo).single(), "g").group_id).toBeNull();

      const del = ok(await db.rpc("guests_bulk", { p_ids: [solo], p_op: "delete" }), "del") as {
        previous: unknown[];
      };
      expect(ok(await db.from("guests").select("deleted_at").eq("id", solo).single(), "d").deleted_at).not.toBeNull();
      const undone = ok(await db.rpc("guests_bulk_undo", { p_previous: del.previous as never }), "undo2") as {
        restored: number;
      };
      expect(undone.restored).toBe(1);
      expect(ok(await db.from("guests").select("deleted_at").eq("id", solo).single(), "d2").deleted_at).toBeNull();
    });
  });
});
