import { beforeAll, describe, expect, it } from "vitest";
import {
  addGroup,
  addGuest,
  assignGuest,
  bulkGuests,
  canReadGuests,
  createFamily,
  emptyDeleted,
  GuestsLoadError,
  loadGuests,
  mapDbError,
  purgeEntity,
  removeEntity,
  restoreEntity,
  undoBulk,
  updateGroup,
  updateGuest,
  type Db,
  type GuestValues,
} from "@/features/guests/data";
import {
  addPartnerB,
  createUser,
  createWedding,
  serviceClient,
  signInAs,
  type TestClient,
  type TestPartnerB,
  type TestWedding,
} from "../support/supabase";

/**
 * T4: the guests data layer against the local stack, with the users' own clients (RLS is the only
 * authorization). Nothing here imports Next.js. All names are invented, emails @example.test.
 */
const values = (overrides: Partial<GuestValues> = {}): GuestValues => ({
  firstName: "Mario",
  lastName: "Rossi",
  category: "adult",
  side: "A",
  phone: "+39 000 000 0001",
  email: "mario.rossi@example.test",
  notes: null,
  ...overrides,
});

describe("guests data", () => {
  let wedding: TestWedding;
  let partnerB: TestPartnerB;
  let family: TestClient;
  const db = () => wedding.founderClient as Db;
  const me = () => wedding.founder.id;

  const ok = <T>(result: { ok: boolean; data?: T }): T => {
    expect(result.ok).toBe(true);
    return result.data as T;
  };

  beforeAll(async () => {
    wedding = await createWedding();
    partnerB = await addPartnerB(wedding);
    const fam = await createUser();
    const { error } = await serviceClient()
      .from("memberships")
      .insert({ wedding_id: wedding.weddingId, user_id: fam.id, role: "family" });
    if (error) throw new Error("family membership failed");
    family = await signInAs(fam);
  }, 60_000);

  it("reads nothing at first, and knows who may read", async () => {
    expect(await loadGuests(db())).toEqual({ guests: [], groups: [], tables: [] });
    expect(await canReadGuests(db())).toBe(true);
    expect(await canReadGuests(family as Db)).toBe(false);
    expect(await loadGuests(family as Db)).toEqual({ guests: [], groups: [], tables: [] });
  });

  it("adds people and groups, edits them, and reads them back (AC2, AC5)", async () => {
    const group = ok(await addGroup(db(), { name: "Famiglia Rossi" }));
    const guest = ok(await addGuest(db(), { guest: values(), groupId: group.groupId }));
    const snapshot = await loadGuests(db());
    expect(snapshot.groups).toMatchObject([
      { name: "Famiglia Rossi", deletedAt: null, version: 1 },
    ]);
    expect(snapshot.guests).toMatchObject([
      {
        id: guest.guestId,
        firstName: "Mario",
        lastName: "Rossi",
        category: "adult",
        side: "A",
        groupId: group.groupId,
        tableId: null,
        version: 1,
      },
    ]);
    const edited = await updateGuest(db(), me(), {
      guestId: guest.guestId,
      version: 1,
      guest: values({ firstName: "Marco", lastName: null, side: null }),
    });
    expect(edited).toEqual({ ok: true, data: { version: 2 } });
    const renamed = await updateGroup(db(), me(), {
      groupId: group.groupId,
      version: 1,
      name: "Rossi",
    });
    expect(renamed).toEqual({ ok: true, data: { version: 2 } });
  });

  it("a person with invalid values is refused by the database with a fixed message", async () => {
    const result = await addGuest(db(), { guest: values({ firstName: "   " }) });
    expect(result).toMatchObject({ ok: false, code: "invalid" });
    expect(JSON.stringify(result)).not.toMatch(/Failing row|first_name|Mario|example\.test/);
  });

  it("a conflict never overwrites and names who changed it (AC6)", async () => {
    const guest = ok(await addGuest(db(), { guest: values({ firstName: "Conflitto" }) }));
    const mine = await updateGuest(partnerB.client as Db, partnerB.user.id, {
      guestId: guest.guestId,
      version: 1,
      guest: values({ firstName: "Dell'altro", lastName: "Verdi" }),
    });
    expect(mine).toEqual({ ok: true, data: { version: 2 } });
    const stale = await updateGuest(db(), me(), {
      guestId: guest.guestId,
      version: 1,
      guest: values({ firstName: "Mio" }),
    });
    expect(stale).toMatchObject({
      ok: false,
      code: "conflict",
      conflict: { current: { firstName: "Dell'altro", lastName: "Verdi", version: 2 } },
    });
    const row = (await loadGuests(db())).guests.find((g) => g.id === guest.guestId);
    expect(row?.firstName).toBe("Dell'altro");
    // "Save anyway" = the same write with the version the other left
    const forced = await updateGuest(db(), me(), {
      guestId: guest.guestId,
      version: 2,
      guest: values({ firstName: "Mio" }),
    });
    expect(forced).toEqual({ ok: true, data: { version: 3 } });
    // the same conflict on a group
    const group = ok(await addGroup(db(), { name: "Gruppo conteso" }));
    await updateGroup(partnerB.client as Db, partnerB.user.id, {
      groupId: group.groupId,
      version: 1,
      name: "Cambiato",
    });
    expect(
      await updateGroup(db(), me(), { groupId: group.groupId, version: 1, name: "Altro" }),
    ).toMatchObject({ ok: false, code: "conflict" });
  });

  it("a new family is one atomic save (AC5)", async () => {
    const before = (await loadGuests(db())).guests.length;
    const bad = await createFamily(db(), {
      name: "Famiglia Rotta",
      side: "B",
      guests: [values({ firstName: "Uno" }), values({ firstName: "" })],
    });
    expect(bad).toMatchObject({ ok: false, code: "invalid_row" });
    const snapshot = await loadGuests(db());
    expect(snapshot.guests).toHaveLength(before);
    expect(snapshot.groups.find((g) => g.name === "Famiglia Rotta")).toBeUndefined();

    const created = ok(
      await createFamily(db(), {
        name: "Famiglia Bianchi",
        side: "B",
        guests: [
          values({ firstName: "Anna", lastName: "Bianchi", side: null }),
          values({ firstName: "Gigi", category: "child", phone: null, email: null }),
        ],
      }),
    );
    expect(created.guestIds).toHaveLength(2);
    const members = (await loadGuests(db())).guests.filter((g) => g.groupId === created.groupId);
    expect(members.map((g) => g.side)).toEqual(["B", "B"]);
    expect(
      await createFamily(family as Db, { name: "Vietata", side: null, guests: [values()] }),
    ).toMatchObject({ ok: false, code: "forbidden" });
    const big = await createFamily(db(), {
      name: "Troppo grande",
      side: null,
      guests: Array.from({ length: 101 }, (_, i) => values({ firstName: `P${i}` })),
    });
    expect(big).toMatchObject({ ok: false, code: "too_many_rows" });
  });

  it("quick assignment of one person; a deleted group is refused (AC10)", async () => {
    const group = ok(await addGroup(db(), { name: "Da assegnare" }));
    const guest = ok(await addGuest(db(), { guest: values({ firstName: "Solo" }) }));
    expect(await assignGuest(db(), { guestId: guest.guestId, groupId: group.groupId })).toEqual({
      ok: true,
      data: undefined,
    });
    expect((await loadGuests(db())).guests.find((g) => g.id === guest.guestId)?.groupId).toBe(
      group.groupId,
    );
    expect(await assignGuest(db(), { guestId: guest.guestId, groupId: null })).toMatchObject({
      ok: true,
    });
    await removeEntity(db(), me(), { kind: "group", id: group.groupId, version: 1 });
    expect(
      await assignGuest(db(), { guestId: guest.guestId, groupId: group.groupId }),
    ).toMatchObject({ ok: false, code: "group_deleted" });
    expect(await assignGuest(db(), { guestId: crypto.randomUUID(), groupId: null })).toMatchObject({
      ok: false,
      code: "not_found",
    });
  });

  it("delete, restore, delete for good and Svuota work for guests, groups and tables (AC10, AC11)", async () => {
    const service = serviceClient();
    const group = ok(await addGroup(db(), { name: "Gruppo effimero" }));
    const guest = ok(
      await addGuest(db(), { guest: values({ firstName: "Effimero" }), groupId: group.groupId }),
    );
    const tableRow = await service
      .from("guest_tables")
      .insert({ wedding_id: wedding.weddingId, name: "Tavolo effimero" })
      .select("id")
      .single();
    const tableId = tableRow.data!.id;

    // purge of a LIVE row removes nothing
    expect(await purgeEntity(db(), { kind: "guest", id: guest.guestId })).toMatchObject({
      ok: false,
      code: "not_deleted",
    });
    // soft delete keeps the pointer; restore brings the member back
    expect(
      await removeEntity(db(), me(), { kind: "group", id: group.groupId, version: 1 }),
    ).toEqual({ ok: true, data: { version: 2 } });
    let snapshot = await loadGuests(db());
    expect(snapshot.groups.find((g) => g.id === group.groupId)?.deletedAt).not.toBeNull();
    expect(snapshot.guests.find((g) => g.id === guest.guestId)?.groupId).toBe(group.groupId);
    expect(
      await restoreEntity(db(), me(), { kind: "group", id: group.groupId, version: 2 }),
    ).toEqual({ ok: true, data: { version: 3 } });

    // delete the three, then a stale version is a conflict
    ok(await removeEntity(db(), me(), { kind: "guest", id: guest.guestId, version: 1 }));
    ok(await removeEntity(db(), me(), { kind: "group", id: group.groupId, version: 3 }));
    ok(await removeEntity(db(), me(), { kind: "table", id: tableId, version: 1 }));
    expect(
      await restoreEntity(db(), me(), { kind: "table", id: tableId, version: 1 }),
    ).toMatchObject({ ok: false, code: "conflict" });

    // another role cannot delete for good
    expect(await purgeEntity(family as Db, { kind: "guest", id: guest.guestId })).toMatchObject({
      ok: false,
    });
    expect(await purgeEntity(db(), { kind: "group", id: group.groupId })).toEqual({
      ok: true,
      data: undefined,
    });
    snapshot = await loadGuests(db());
    expect(snapshot.groups.find((g) => g.id === group.groupId)).toBeUndefined();

    // Svuota per section, then all
    const counts = ok(await emptyDeleted(db(), { scope: "guests" }));
    expect(counts.guests).toBeGreaterThanOrEqual(1);
    expect((await loadGuests(db())).tables.some((t) => t.id === tableId)).toBe(true);
    expect(ok(await emptyDeleted(db(), { scope: "all" })).tables).toBe(1);
    snapshot = await loadGuests(db());
    expect(snapshot.guests.every((g) => g.deletedAt === null)).toBe(true);
    expect(snapshot.groups.every((g) => g.deletedAt === null)).toBe(true);
    expect(snapshot.tables).toEqual([]);
    expect(await emptyDeleted(family as Db, { scope: "all" })).toMatchObject({
      ok: true,
      data: { guests: 0, groups: 0, tables: 0 },
    });
  });

  it("deleting a group for good frees its LIVE members (Senza gruppo)", async () => {
    const group = ok(await addGroup(db(), { name: "Gruppo da cancellare" }));
    const guest = ok(
      await addGuest(db(), { guest: values({ firstName: "Membro" }), groupId: group.groupId }),
    );
    ok(await removeEntity(db(), me(), { kind: "group", id: group.groupId, version: 1 }));
    ok(await purgeEntity(db(), { kind: "group", id: group.groupId }));
    const row = (await loadGuests(db())).guests.find((g) => g.id === guest.guestId);
    expect(row).toMatchObject({ groupId: null, deletedAt: null });
  });

  describe("bulk actions and their undo (AC7, P6), above the 1000-per-call cap", () => {
    let ids: string[];
    let groupId: string;

    beforeAll(async () => {
      const rowsToInsert = Array.from({ length: 1200 }, (_, i) => ({
        wedding_id: wedding.weddingId,
        first_name: `Ospite${i}`,
      }));
      ids = [];
      for (let from = 0; from < rowsToInsert.length; from += 500) {
        const inserted = await serviceClient()
          .from("guests")
          .insert(rowsToInsert.slice(from, from + 500))
          .select("id");
        ids.push(...inserted.data!.map((r) => r.id));
      }
      groupId = ok(await addGroup(db(), { name: "Tutti" })).groupId;
    }, 60_000);

    it("1200 ids: assigned in batches, undone with the previous received, unchanged", async () => {
      const assigned = ok(await bulkGuests(db(), { ids, op: "assign_group", target: groupId }));
      expect(assigned.changed).toBe(1200);
      expect(assigned.previous).toHaveLength(1200);
      expect(assigned.previous[0]).toMatchObject({ op: "assign_group", group_id: null });
      let snapshot = await loadGuests(db());
      expect(snapshot.guests.filter((g) => g.groupId === groupId)).toHaveLength(1200);
      expect(snapshot.guests.length).toBeGreaterThanOrEqual(1200); // all read, past max_rows 1000

      expect(ok(await undoBulk(db(), { previous: assigned.previous })).restored).toBe(1200);
      snapshot = await loadGuests(db());
      expect(snapshot.guests.filter((g) => g.groupId === groupId)).toHaveLength(0);
    });

    it("delete then restore then undo, for 1200", async () => {
      const deleted = ok(await bulkGuests(db(), { ids, op: "delete" }));
      expect(deleted.changed).toBe(1200);
      let snapshot = await loadGuests(db());
      expect(snapshot.guests.filter((g) => ids.includes(g.id) && g.deletedAt)).toHaveLength(1200);
      expect(ok(await undoBulk(db(), { previous: deleted.previous })).restored).toBe(1200);
      snapshot = await loadGuests(db());
      expect(snapshot.guests.filter((g) => ids.includes(g.id) && g.deletedAt)).toHaveLength(0);
      const again = ok(await bulkGuests(db(), { ids: ids.slice(0, 5), op: "delete" }));
      const restored = ok(await bulkGuests(db(), { ids: ids.slice(0, 5), op: "restore" }));
      expect(restored.changed).toBe(5);
      expect(again.changed).toBe(5);
    });

    it("a bad target changes nothing and says why; another role changes nothing", async () => {
      expect(
        await bulkGuests(db(), {
          ids: ids.slice(0, 3),
          op: "assign_group",
          target: crypto.randomUUID(),
        }),
      ).toMatchObject({ ok: false, code: "invalid_target" });
      expect(
        ok(await bulkGuests(family as Db, { ids: ids.slice(0, 3), op: "delete" })).changed,
      ).toBe(0);
    });
  });

  describe("failures halfway (REV-17, REV-19, REV-20, Svuota)", () => {
    type Hooks = {
      rpc?: (fn: string, args: unknown) => Promise<unknown> | undefined;
      from?: (table: string) => unknown;
    };
    const wrap = (real: Db, hooks: Hooks): Db =>
      new Proxy(real, {
        get(target, prop) {
          if (prop === "rpc" && hooks.rpc) {
            return (fn: string, args: unknown) =>
              hooks.rpc!(fn, args) ?? target.rpc(fn as never, args as never);
          }
          if (prop === "from" && hooks.from) {
            return (table: string) => hooks.from!(table) ?? target.from(table as never);
          }
          const value = Reflect.get(target, prop);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    const boom = Promise.resolve({ data: null, error: { code: "XX000", message: "boom Mario" } });
    let ids: string[];
    const live = async () => {
      const snapshot = await loadGuests(db());
      return snapshot.guests.filter((g) => ids.includes(g.id) && g.deletedAt === null).length;
    };

    beforeAll(async () => {
      const inserted = await serviceClient()
        .from("guests")
        .insert(
          Array.from({ length: 1100 }, (_, i) => ({
            wedding_id: wedding.weddingId,
            first_name: `Meta${i}`,
          })),
        )
        .select("id");
      ids = inserted.data!.map((r) => r.id);
    }, 60_000);

    it("a later batch fails and the earlier one is rolled back: a plain failure", async () => {
      let calls = 0;
      const flaky = wrap(db(), {
        rpc: (fn) => (fn === "guests_bulk" && ++calls === 2 ? boom : undefined),
      });
      const result = await bulkGuests(flaky, { ids, op: "delete" });
      expect(result).toMatchObject({ ok: false, code: "unknown" });
      expect(JSON.stringify(result)).not.toContain("Mario");
      expect(await live()).toBe(1100); // the first batch was put back
    });

    it("the rollback fails too: `partial`, with a message to reload and check", async () => {
      let calls = 0;
      const broken = wrap(db(), {
        rpc: (fn) =>
          fn === "guests_bulk" && ++calls === 2
            ? boom
            : fn === "guests_bulk_undo"
              ? boom
              : undefined,
      });
      const result = await bulkGuests(broken, { ids, op: "delete" });
      expect(result).toEqual({
        ok: false,
        code: "partial",
        message: "Ne ho cambiati solo alcuni. Ricarica la pagina e controlla.",
      });
      expect(await live()).toBe(100); // the first 1000 stayed deleted
      ok(await bulkGuests(db(), { ids, op: "restore" }));
      expect(await live()).toBe(1100);
    });

    it("an undo that stops after the first batch is `partial` too", async () => {
      const done = ok(await bulkGuests(db(), { ids, op: "delete" }));
      let calls = 0;
      const broken = wrap(db(), {
        rpc: (fn) => (fn === "guests_bulk_undo" && ++calls === 2 ? boom : undefined),
      });
      expect(await undoBulk(broken, { previous: done.previous })).toMatchObject({
        ok: false,
        code: "partial",
      });
      expect(await live()).toBe(1000);
      ok(await undoBulk(db(), { previous: done.previous })); // the user can replay it
      expect(await live()).toBe(1100);
    });

    it("Svuota that stops partway says what was removed and what is left", async () => {
      const guest = ok(await addGuest(db(), { guest: values({ firstName: "Da svuotare" }) }));
      const group = ok(await addGroup(db(), { name: "Gruppo da svuotare" }));
      ok(await removeEntity(db(), me(), { kind: "guest", id: guest.guestId, version: 1 }));
      ok(await removeEntity(db(), me(), { kind: "group", id: group.groupId, version: 1 }));
      const stopped = wrap(db(), {
        from: (table) =>
          table === "guest_groups"
            ? {
                delete: () => ({
                  not: async () => ({ error: { code: "XX000", message: "boom" }, count: null }),
                }),
              }
            : undefined,
      });
      const result = await emptyDeleted(stopped, { scope: "all" });
      expect(result).toMatchObject({ ok: false, code: "partial" });
      const message = (result as { message: string }).message;
      expect(message).toMatch(/Ho eliminato per sempre \d+ person[ae]/);
      expect(message).toMatch(/Ricarica la pagina/);
      const snapshot = await loadGuests(db());
      expect(snapshot.guests.some((g) => g.id === guest.guestId)).toBe(false);
      expect(snapshot.groups.some((g) => g.id === group.groupId)).toBe(true); // still among the deleted
      // the first section failing is a plain failure: nothing was removed
      const first = wrap(db(), {
        from: (table) =>
          table === "guests"
            ? {
                delete: () => ({
                  not: async () => ({ error: { code: "XX000", message: "boom" }, count: null }),
                }),
              }
            : undefined,
      });
      expect(await emptyDeleted(first, { scope: "all" })).toMatchObject({
        ok: false,
        code: "unknown",
      });
    });

    it("a write denied by RLS (zero rows, same version) is `forbidden`, not a conflict", async () => {
      const guest = ok(await addGuest(db(), { guest: values({ firstName: "Negato" }) }));
      const denied = wrap(db(), {
        from: (table) =>
          table === "guests"
            ? {
                update: () => ({
                  eq: () => ({
                    eq: () => ({
                      select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
                    }),
                  }),
                }),
                select: (...args: unknown[]) =>
                  (db().from("guests").select as (...a: unknown[]) => unknown)(...args),
              }
            : undefined,
      });
      expect(
        await updateGuest(denied, me(), { guestId: guest.guestId, version: 1, guest: values() }),
      ).toMatchObject({ ok: false, code: "forbidden" });
    });

    it("a row repeated between two pages is listed once", async () => {
      const row = {
        id: "00000000-0000-4000-8000-0000000000aa",
        first_name: "Doppio",
        last_name: null,
        category: "adult",
        side: null,
        phone: null,
        email: null,
        notes: null,
        group_id: null,
        table_id: null,
        deleted_at: null,
        version: 1,
      };
      const stub = {
        from: (table: string) => ({
          select: () => ({
            order: () => ({
              range: async () => ({ data: table === "guests" ? [row, row] : [], error: null }),
            }),
          }),
        }),
      } as unknown as Db;
      expect((await loadGuests(stub)).guests).toHaveLength(1);
    });
  });

  describe("errors and a schema that is not there", () => {
    const missing = (code: string) =>
      ({
        from: () => ({
          select: () => ({
            order: () => ({ range: async () => ({ data: null, error: { code, message: "x" } }) }),
          }),
        }),
      }) as unknown as Db;

    it("a missing table is the code not_migrated, not a crash", async () => {
      for (const code of ["42P01", "PGRST205"]) {
        const error = await loadGuests(missing(code)).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(GuestsLoadError);
        expect(error).toMatchObject({ code: "not_migrated" });
      }
      const other = await loadGuests(missing("57014")).catch((e: unknown) => e);
      expect(other).toMatchObject({ code: "unknown" });
    });

    it("mapDbError reads the SQLSTATE and exact business codes only, never the text", () => {
      const leaky = "Failing row contains (Mario, Rossi, +39 000 000 0001, mario@example.test)";
      for (const error of [
        { code: "23514", message: leaky },
        { code: "XX000", message: leaky },
        { code: "P0001", message: leaky },
        { code: "23505", message: leaky, details: leaky } as { code: string; message: string },
      ]) {
        const mapped = mapDbError(error);
        expect(mapped.message).not.toContain("Mario");
        expect(mapped.message).not.toContain("example.test");
      }
      expect(mapDbError({ code: "P0001", message: "group_deleted" }).code).toBe("group_deleted");
      expect(mapDbError({ code: "42501" }).code).toBe("forbidden");
      expect(mapDbError({ code: "PGRST202" }).code).toBe("not_migrated");
      expect(mapDbError({ code: "P0001", message: "constructor" }).code).toBe("unknown");
    });
  });
});
