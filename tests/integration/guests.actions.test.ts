import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { validateGuest } from "@/domain/guests";
import { addGroup, addGuest, loadGuests, type Db } from "@/features/guests/data";
import {
  addPartnerB,
  anonClient,
  createUser,
  createWedding,
  serviceClient,
  signInAs,
  type TestClient,
  type TestWedding,
} from "../support/supabase";

/**
 * T4: the server actions are the trust boundary. They run for real (zod, session, data layer, RLS)
 * against the local stack; only the cookie client and `revalidatePath` are replaced. QA-5: a spy on
 * every `console` method proves that no personal value reaches a log or a returned error.
 */
const state = vi.hoisted(() => ({ client: null as unknown, revalidate: [] as unknown[][] }));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.client }));
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => {
    state.revalidate.push(args);
  },
}));

import {
  addGroupAction,
  addGuestAction,
  assignGuestAction,
  bulkGuestsAction,
  createFamilyAction,
  emptyDeletedAction,
  purgeEntityAction,
  removeEntityAction,
  restoreEntityAction,
  undoBulkAction,
  updateGroupAction,
  updateGuestAction,
} from "@/features/guests/actions";
import {
  guestInputSchema,
  MAX_SELECTION,
  schemas,
  SELECTION_TOO_LARGE,
} from "@/features/guests/schemas";

const UUID = "00000000-0000-4000-8000-000000000000";
const REFRESH = [["/invitati"], ["/altro/impostazioni"]];
// Invented personal values that must never appear in a log or a returned error.
const SECRET_NAME = "Zedmario";
const SECRET_PHONE = "+39 000 000 7777";
const SECRET_MAIL = "zed.secret@example.test";
const SECRET_NOTE = "allergia segretissima";
const person = (extra: Record<string, unknown> = {}) => ({
  firstName: SECRET_NAME,
  lastName: "Zetarossi",
  category: "adult",
  side: "A",
  phone: SECRET_PHONE,
  email: SECRET_MAIL,
  notes: SECRET_NOTE,
  ...extra,
});

describe("guests server actions", () => {
  let wedding: TestWedding;
  let family: TestClient;
  const logs = {
    log: vi.spyOn(console, "log"),
    info: vi.spyOn(console, "info"),
    warn: vi.spyOn(console, "warn"),
    error: vi.spyOn(console, "error"),
    debug: vi.spyOn(console, "debug"),
  };
  const logged = () => JSON.stringify(Object.values(logs).flatMap((spy) => spy.mock.calls)) ?? "";

  beforeAll(async () => {
    wedding = await createWedding();
    await addPartnerB(wedding);
    const fam = await createUser();
    await serviceClient()
      .from("memberships")
      .insert({ wedding_id: wedding.weddingId, user_id: fam.id, role: "family" });
    family = await signInAs(fam);
  }, 60_000);

  beforeEach(() => {
    state.client = wedding.founderClient as TestClient;
    state.revalidate = [];
    for (const spy of Object.values(logs)) spy.mockClear();
  });
  afterEach(() => {
    for (const spy of Object.values(logs)) spy.mockClear();
  });

  const results: unknown[] = [];
  const keep = async <T>(promise: Promise<T>): Promise<T> => {
    const result = await promise;
    results.push(result);
    return result;
  };

  it("rejects malformed input before touching the database, with Italian domain messages", async () => {
    const bad = [
      await addGuestAction({ guest: person({ firstName: "   " }) }),
      await addGuestAction({ guest: person({ firstName: "x".repeat(81) }) }),
      await addGuestAction({ guest: person({ phone: "12345" }) }),
      await addGuestAction({ guest: person({ phone: "abc123456" }) }),
      await addGuestAction({ guest: person({ email: "senza-chiocciola" }) }),
      await addGuestAction({ guest: person({ notes: "n".repeat(501) }) }),
      await addGuestAction({ guest: person({ category: "senior" }) }),
      await addGuestAction({ guest: person({ side: "C" }) }),
      await addGuestAction({ guest: 5 }),
      await addGroupAction({ name: "  " }),
      await addGroupAction({ name: "g".repeat(81) }),
      await updateGuestAction({ guestId: "nope", version: 1, guest: person() }),
      await updateGuestAction({ guestId: UUID, version: 0, guest: person() }),
      await updateGroupAction({ groupId: UUID, version: 1, name: "" }),
      await createFamilyAction({ name: "F", side: "A", guests: [] }),
      await createFamilyAction({ name: "F", side: "Z", guests: [person()] }),
      await createFamilyAction({
        name: "F",
        side: null,
        guests: Array.from({ length: 101 }, () => person()),
      }),
      await assignGuestAction({ guestId: "x" }),
      await removeEntityAction({ kind: "robot", id: UUID, version: 1 }),
      await purgeEntityAction({ kind: "guest" }),
      await emptyDeletedAction({ scope: "everything" }),
      await bulkGuestsAction({ ids: [], op: "delete" }),
      await bulkGuestsAction({ ids: [UUID], op: "assign_group" }),
      await bulkGuestsAction({ ids: ["x"], op: "delete" }),
      await bulkGuestsAction({ ids: [UUID], op: "purge" }),
      await bulkGuestsAction({ ids: Array.from({ length: 5_001 }, () => UUID), op: "delete" }),
      await undoBulkAction({ previous: [{ id: UUID, op: "nuke" }] }),
      await undoBulkAction({ previous: "x" }),
    ];
    for (const result of bad) expect(result).toMatchObject({ ok: false, code: "invalid" });
    expect(bad[0]).toMatchObject({ message: "Scrivi il nome." });
    expect(bad[9]).toMatchObject({ message: "Scrivi il nome del gruppo." });
    // never zod's English defaults
    for (const result of bad)
      expect((result as { message: string }).message).not.toMatch(/Invalid|expected/);
    expect(state.revalidate).toEqual([]);
    expect((await loadGuests(wedding.founderClient as Db)).guests).toEqual([]);
  });

  it("the schema and validateGuest (the single source) agree on the boundaries (code-1 REV-1)", () => {
    const text = (n: number) => "x".repeat(n);
    const cases: Record<string, unknown>[] = [
      { firstName: "" },
      { firstName: "   " },
      { firstName: text(80) },
      { firstName: text(81) },
      { lastName: text(80) },
      { lastName: text(81) },
      { lastName: "" },
      { phone: "12345" },
      { phone: "123456" },
      { phone: `+${"1".repeat(19)}` },
      { phone: `+${"1".repeat(20)}` },
      { phone: "+39 (02) 12.34/56-7" },
      { phone: "12345a" },
      { phone: "" },
      { email: "a@b.c" },
      { email: "a@b" },
      { email: "a b@c.d" },
      { email: `${text(250)}@b.c` },
      { email: "" },
      { notes: text(500) },
      { notes: text(501) },
      { category: "adult" },
      { category: "child" },
      { category: "infant" },
      { category: "senior" },
      { side: "A" },
      { side: "B" },
      { side: "both" },
      { side: "C" },
      { side: null },
    ];
    for (const overrides of cases) {
      const input = { firstName: "Ok", ...overrides };
      const domain = validateGuest(input as Parameters<typeof validateGuest>[0]);
      const parsed = guestInputSchema.safeParse(input);
      expect(parsed.success, JSON.stringify(overrides)).toBe(Object.keys(domain).length === 0);
      if (!parsed.success) {
        // same message, same field
        const messages = parsed.error.issues.map((i) => i.message).sort();
        expect(messages).toEqual(Object.values(domain).sort());
      }
    }
    // normalization: empty optional text is null (the DB refuses ''), values are trimmed
    expect(
      guestInputSchema.parse({ firstName: "  Ada ", lastName: "  ", phone: "", email: " " }),
    ).toMatchObject({
      firstName: "Ada",
      lastName: null,
      phone: null,
      email: null,
      category: "adult",
      side: null,
    });
    expect(
      schemas.createFamily.safeParse({ name: "F", side: "A", guests: [{ firstName: "A" }] })
        .success,
    ).toBe(true);
  });

  it("the selection bound is per action, safely under the 1 MB body, and has its own message (REV-18)", async () => {
    const entry = { id: UUID, op: "delete", group_id: UUID, table_id: UUID, deleted: false };
    const ids = (n: number) => Array.from({ length: n }, () => UUID);
    expect(schemas.bulk.safeParse({ ids: ids(MAX_SELECTION), op: "delete" }).success).toBe(true);
    expect(
      schemas.undo.safeParse({ previous: Array.from({ length: MAX_SELECTION }, () => entry) })
        .success,
    ).toBe(true);
    // the largest legitimate payloads stay well under the 1 MB Server Action limit
    expect(
      JSON.stringify({ previous: Array.from({ length: MAX_SELECTION }, () => entry) }).length,
    ).toBeLessThan(900_000);
    expect(JSON.stringify({ ids: ids(MAX_SELECTION), op: "delete" }).length).toBeLessThan(900_000);
    for (const result of [
      await bulkGuestsAction({ ids: ids(MAX_SELECTION + 1), op: "delete" }),
      await undoBulkAction({ previous: Array.from({ length: MAX_SELECTION + 1 }, () => entry) }),
    ]) {
      expect(result).toEqual({ ok: false, code: "invalid", message: SELECTION_TOO_LARGE });
      expect((result as { message: string }).message).not.toMatch(/Riprova/);
    }
    expect(state.revalidate).toEqual([]);
  });

  it("without a session nothing is written and nothing is revalidated", async () => {
    state.client = anonClient();
    const result = await addGuestAction({ guest: person() });
    expect(result).toMatchObject({ ok: false, code: "session" });
    expect(state.revalidate).toEqual([]);
  });

  it("writes revalidate Invitati and the settings band, and only on success", async () => {
    const added = await keep(addGuestAction({ guest: person() }));
    expect(added).toMatchObject({ ok: true });
    expect(state.revalidate).toEqual(REFRESH);
    state.revalidate = [];
    expect(await keep(removeEntityAction({ kind: "guest", id: UUID, version: 1 }))).toMatchObject({
      ok: false,
      code: "conflict",
    });
    expect(state.revalidate).toEqual([]);
  });

  it("the whole life of a person, a group and a family goes through the actions", async () => {
    const group = await addGroupAction({ name: "Famiglia Prova" });
    expect(group).toMatchObject({ ok: true });
    const groupId = (group as { data: { groupId: string } }).data.groupId;
    expect(await updateGroupAction({ groupId, version: 1, name: "Prova" })).toEqual({
      ok: true,
      data: { version: 2 },
    });
    const family2 = await createFamilyAction({
      name: "Famiglia Nuova",
      side: "both",
      guests: [{ firstName: "Uno" }, { firstName: "Due", category: "infant" }],
    });
    expect(family2).toMatchObject({ ok: true });
    const guestId = (family2 as { data: { guestIds: string[] } }).data.guestIds[0]!;
    expect(await assignGuestAction({ guestId, groupId })).toMatchObject({ ok: true });
    expect(
      await updateGuestAction({ guestId, version: 2, guest: person({ firstName: "Uno" }) }),
    ).toEqual({
      ok: true,
      data: { version: 3 },
    });
    expect(await removeEntityAction({ kind: "guest", id: guestId, version: 3 })).toMatchObject({
      ok: true,
    });
    expect(await restoreEntityAction({ kind: "guest", id: guestId, version: 4 })).toMatchObject({
      ok: true,
    });
    expect(await removeEntityAction({ kind: "guest", id: guestId, version: 5 })).toMatchObject({
      ok: true,
    });
    expect(await purgeEntityAction({ kind: "guest", id: guestId })).toMatchObject({ ok: true });
    expect(await purgeEntityAction({ kind: "group", id: groupId })).toMatchObject({
      ok: false,
      code: "not_deleted",
    });
    expect(await emptyDeletedAction({ scope: "all" })).toMatchObject({ ok: true });
  });

  it("bulk above 1000 ids: batched, and the undo replays the previous it received", async () => {
    const service = serviceClient();
    const rows = Array.from({ length: 1100 }, (_, i) => ({
      wedding_id: wedding.weddingId,
      first_name: `Massa${i}`,
    }));
    const ids: string[] = [];
    for (let from = 0; from < rows.length; from += 500) {
      const inserted = await service
        .from("guests")
        .insert(rows.slice(from, from + 500))
        .select("id");
      ids.push(...inserted.data!.map((r) => r.id));
    }
    const done = await bulkGuestsAction({ ids, op: "delete" });
    expect(done).toMatchObject({ ok: true, data: { changed: 1100 } });
    const previous = (done as { data: { previous: unknown[] } }).data.previous;
    expect(previous).toHaveLength(1100);
    expect(await undoBulkAction({ previous })).toEqual({ ok: true, data: { restored: 1100 } });
    const snapshot = await loadGuests(wedding.founderClient as Db);
    expect(snapshot.guests.filter((g) => ids.includes(g.id) && g.deletedAt)).toHaveLength(0);
    // another role: nothing changes, and no error text
    state.client = family;
    expect(await bulkGuestsAction({ ids: ids.slice(0, 5), op: "delete" })).toMatchObject({
      ok: true,
      data: { changed: 0 },
    });
  });

  it("QA-5: no personal value in any log or any returned error, even when the database refuses", async () => {
    // 1. refusals the actions return
    state.client = family;
    results.push(await addGuestAction({ guest: person() }));
    results.push(await createFamilyAction({ name: "Vietata", side: "A", guests: [person()] }));
    state.client = wedding.founderClient;
    const group = (await addGroup(wedding.founderClient as Db, { name: "Gruppo eliminato" })) as {
      data: { groupId: string };
    };
    await removeEntityAction({ kind: "group", id: group.data.groupId, version: 1 });
    results.push(await addGuestAction({ guest: person(), groupId: group.data.groupId }));
    results.push(await addGuestAction({ guest: person(), groupId: UUID }));
    results.push(
      await updateGuestAction({ guestId: UUID, version: 1, guest: person({ firstName: "Altro" }) }),
    );
    // 2. a value the schema lets through but the database refuses: the raw PostgREST error carries
    //    the failing row in `details`; the data layer must drop it (invalid CHECK bypassing zod)
    const direct = await addGuest(wedding.founderClient as Db, {
      guest: {
        firstName: SECRET_NAME,
        lastName: null,
        category: "adult",
        side: null,
        phone: "no", // violates the phone CHECK
        email: SECRET_MAIL,
        notes: SECRET_NOTE,
      },
    });
    results.push(direct);
    expect(direct).toMatchObject({ ok: false, code: "invalid" });
    // 3. a bulk with a bad target and an undo with an unknown id
    results.push(await bulkGuestsAction({ ids: [UUID], op: "assign_group", target: UUID }));
    results.push(
      await undoBulkAction({
        previous: [{ id: UUID, op: "delete", group_id: null, table_id: null, deleted: false }],
      }),
    );

    const text = JSON.stringify(results);
    for (const secret of [SECRET_NAME, SECRET_PHONE, SECRET_MAIL, SECRET_NOTE, "Zetarossi"]) {
      expect(text, `result leaks ${secret}`).not.toContain(secret);
      expect(logged(), `log leaks ${secret}`).not.toContain(secret);
    }
    expect(text).not.toMatch(/Failing row|violates|details|first_name|guests_/);
    expect(logged()).not.toMatch(/Failing row|violates/);
    for (const result of results as { ok: boolean; message?: string }[]) {
      if (!result.ok) expect(typeof result.message).toBe("string");
    }
  });
});
