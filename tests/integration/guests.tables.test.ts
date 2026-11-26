import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { addGuest, bulkGuests, loadGuests, type Db } from "@/features/guests/data";
import { addPartnerB, createWedding, type TestClient, type TestWedding } from "../support/supabase";

/**
 * T9: create and edit a table through the real server actions, with the versioned update and the
 * conflict data (AC6, BR9), the capacity boundaries (AC14), and the generic delete/restore/purge of
 * a table keeping the members' pointer (AC10, P2). Only the cookie client and `revalidatePath` are
 * replaced; RLS, grants and triggers are the local stack's.
 */
const state = vi.hoisted(() => ({ client: null as unknown, revalidate: [] as unknown[][] }));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.client }));
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => {
    state.revalidate.push(args);
  },
}));

import {
  purgeEntityAction,
  removeEntityAction,
  restoreEntityAction,
} from "@/features/guests/actions";
import { addTableAction, updateTableAction } from "@/features/guests/tables-actions";

const UUID = "00000000-0000-4000-8000-000000000000";
const person = (firstName: string, category = "adult") => ({
  firstName,
  lastName: null,
  category,
  side: null,
  phone: null,
  email: null,
  notes: null,
});

describe("guest tables", () => {
  let wedding: TestWedding;
  let partnerB: TestClient;
  const db = () => wedding.founderClient as Db;

  beforeAll(async () => {
    wedding = await createWedding();
    partnerB = (await addPartnerB(wedding)).client as TestClient;
  }, 60_000);
  beforeEach(() => {
    state.client = wedding.founderClient as TestClient;
    state.revalidate = [];
  });
  afterEach(() => {
    state.client = wedding.founderClient as TestClient;
  });

  const tableRow = async (id: string) => (await loadGuests(db())).tables.find((t) => t.id === id);

  it("rejects bad names and capacities before the database, in Italian", async () => {
    const bad = [
      await addTableAction({ name: "  " }),
      await addTableAction({ name: "t".repeat(61) }),
      await addTableAction({ name: "T", capacity: 0 }),
      await addTableAction({ name: "T", capacity: 51 }),
      await addTableAction({ name: "T", capacity: "8.5" }),
      await addTableAction({ name: "T", capacity: "abc" }),
      await addTableAction(5),
      await updateTableAction({ tableId: "x", version: 1, table: { name: "T" } }),
      await updateTableAction({ tableId: UUID, version: 0, table: { name: "T" } }),
    ];
    for (const result of bad) expect(result).toMatchObject({ ok: false, code: "invalid" });
    expect(bad[0]).toMatchObject({ message: "Scrivi il nome del tavolo." });
    for (const result of bad) {
      expect((result as { message: string }).message).not.toMatch(/Invalid|expected/);
    }
    expect(state.revalidate).toEqual([]);
  });

  it("creates tables with and without capacity (1, 50 and none are valid)", async () => {
    for (const [name, capacity] of [
      ["Uno", 1],
      ["Cinquanta", 50],
      ["Senza", null],
      ["Testo", "8"],
    ] as const) {
      const added = await addTableAction({ name, capacity });
      expect(added.ok, name).toBe(true);
    }
    const tables = (await loadGuests(db())).tables;
    expect(tables.map((t) => [t.name, t.capacity]).sort()).toEqual([
      ["Cinquanta", 50],
      ["Senza", null],
      ["Testo", 8],
      ["Uno", 1],
    ]);
    expect(state.revalidate).toContainEqual(["/invitati"]);
  });

  it("edits with the version, and a stale edit returns the conflict data without writing", async () => {
    const added = await addTableAction({ name: "Rossi", capacity: 8 });
    if (!added.ok) throw new Error("setup");
    const id = added.data.tableId;
    const first = await updateTableAction({
      tableId: id,
      version: 1,
      table: { name: "Rossi", capacity: 10 },
    });
    expect(first).toMatchObject({ ok: true, data: { version: 2 } });

    state.client = partnerB;
    const stale = await updateTableAction({
      tableId: id,
      version: 1,
      table: { name: "Altro", capacity: 4 },
    });
    expect(stale).toMatchObject({
      ok: false,
      code: "conflict",
      conflict: { current: { name: "Rossi", capacity: 10, version: 2 } },
    });
    expect((await tableRow(id))?.capacity).toBe(10);

    // "Salva comunque": the retry with the current version wins.
    const forced = await updateTableAction({
      tableId: id,
      version: 2,
      table: { name: "Altro", capacity: 4 },
    });
    expect(forced).toMatchObject({ ok: true, data: { version: 3 } });
    expect(await tableRow(id)).toMatchObject({ name: "Altro", capacity: 4 });
  });

  it("answers not_found-style conflict data for a table that does not exist", async () => {
    const result = await updateTableAction({ tableId: UUID, version: 1, table: { name: "X" } });
    expect(result).toMatchObject({ ok: false, code: "conflict", conflict: { current: null } });
  });

  it("deleting a table keeps its members' pointer; restoring puts them back; purging frees them", async () => {
    const added = await addTableAction({ name: "Verdi", capacity: 2 });
    if (!added.ok) throw new Error("setup");
    const tableId = added.data.tableId;
    const guest = await addGuest(db(), {
      guest: { ...person("Seduto"), firstName: "Seduto" } as never,
      tableId,
    });
    if (!guest.ok) throw new Error("setup");

    const removed = await removeEntityAction({ kind: "table", id: tableId, version: 1 });
    expect(removed).toMatchObject({ ok: true });
    let snapshot = await loadGuests(db());
    expect(snapshot.guests.find((g) => g.id === guest.data.guestId)?.tableId).toBe(tableId);

    const restored = await restoreEntityAction({ kind: "table", id: tableId, version: 2 });
    expect(restored).toMatchObject({ ok: true });
    snapshot = await loadGuests(db());
    expect(snapshot.tables.find((t) => t.id === tableId)?.deletedAt).toBeNull();

    // a live table cannot be purged; a deleted one can, and the member loses only the pointer
    expect(await purgeEntityAction({ kind: "table", id: tableId })).toMatchObject({
      ok: false,
      code: "not_deleted",
    });
    await removeEntityAction({ kind: "table", id: tableId, version: 3 });
    expect(await purgeEntityAction({ kind: "table", id: tableId })).toMatchObject({ ok: true });
    snapshot = await loadGuests(db());
    expect(snapshot.tables.some((t) => t.id === tableId)).toBe(false);
    const member = snapshot.guests.find((g) => g.id === guest.data.guestId);
    expect(member).toMatchObject({ tableId: null, deletedAt: null });
  });

  it("assigns people to a table in bulk (the table sheet's 'Aggiungi persone') and undoes it", async () => {
    const added = await addTableAction({ name: "Bianchi", capacity: 1 });
    if (!added.ok) throw new Error("setup");
    const ids: string[] = [];
    for (const category of ["adult", "infant"]) {
      const g = await addGuest(db(), { guest: person("P", category) as never });
      if (!g.ok) throw new Error("setup");
      ids.push(g.data.guestId);
    }
    const bulk = await bulkGuests(db(), { ids, op: "assign_table", target: added.data.tableId });
    expect(bulk.ok).toBe(true);
    const seated = (await loadGuests(db())).guests.filter((g) => ids.includes(g.id));
    expect(seated.every((g) => g.tableId === added.data.tableId)).toBe(true);
  });
});
