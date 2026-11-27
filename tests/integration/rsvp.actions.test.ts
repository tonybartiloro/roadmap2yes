import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prepareExport } from "@/features/export/data";
import type { Db } from "@/features/guests/data";
import { addGroup, addGuest, loadGuests } from "@/features/guests/data";
import {
  createLinks,
  getLinkUrl,
  loadRsvp,
  markShared,
  revokeLink,
  rotateLink,
  setGroupMode,
  unmarkShared,
} from "@/features/rsvp/data";
import { deriveRsvpToken, rsvpUrl } from "@/features/rsvp/token";
import { FAKE_RSVP_LINK_SECRET } from "@/lib/app-config";
import {
  addPartnerB,
  createUser,
  createWedding,
  serviceClient,
  signInAs,
  type TestClient,
  type TestWedding,
} from "../support/supabase";

/**
 * T6: the couple side of RSVP against the local stack: links (derived token, never stored), the
 * "Condiviso il" stamp and its Annulla, the group mode with its version, the JSON export. The
 * action layer runs for real too (zod, session, secret); only the cookie client and
 * `revalidatePath` are replaced.
 */
const state = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

import { createLinksAction, getLinkUrlAction } from "@/features/rsvp/actions";

const SECRET = FAKE_RSVP_LINK_SECRET;
const SITE = "https://r2y.example.test";
const NOW = new Date("2027-01-10T10:00:00Z");
const person = (firstName: string) => ({
  firstName,
  lastName: "Rossi",
  category: "adult" as const,
  side: null,
  phone: null,
  email: null,
  notes: null,
});

describe("rsvp couple side", () => {
  let wedding: TestWedding;
  let db: Db;
  let family: Db;
  let groupId: string;
  let loneId: string;
  const logs = (["log", "info", "warn", "error", "debug"] as const).map((l) =>
    vi.spyOn(console, l),
  );

  beforeAll(async () => {
    wedding = await createWedding();
    await addPartnerB(wedding);
    db = wedding.founderClient as unknown as Db;
    const fam = await createUser();
    await serviceClient()
      .from("memberships")
      .insert({ wedding_id: wedding.weddingId, user_id: fam.id, role: "family" });
    family = (await signInAs(fam)) as unknown as Db;

    const group = await addGroup(db, { name: "Famiglia Rossi" });
    if (!group.ok) throw new Error("addGroup");
    groupId = group.data.groupId;
    for (const name of ["Anna", "Luca"]) {
      await addGuest(db, { guest: person(name), groupId });
    }
    const lone = await addGuest(db, { guest: person("Mario") });
    if (!lone.ok) throw new Error("addGuest");
    loneId = lone.data.guestId;
  }, 60_000);

  beforeEach(() => {
    state.client = wedding.founderClient as TestClient;
    for (const spy of logs) spy.mockClear();
  });
  afterEach(() => {
    const logged = JSON.stringify(logs.flatMap((s) => s.mock.calls));
    expect(logged).not.toContain(SECRET);
    expect(logged).not.toMatch(/\\x[0-9a-f]{64}/);
  });

  const snapshot = async () => (await loadRsvp(db, NOW))!;

  it("starts with no link, no answer and no expiry", async () => {
    expect(await snapshot()).toEqual({
      expiresOn: null,
      links: [],
      resendGuestIds: [],
      responses: [],
    });
  });

  it("refuses without guests/write (forbidden) and never creates anything", async () => {
    const denied = await createLinks(family, {
      secret: SECRET,
      now: NOW,
      targets: [{ groupId }],
    });
    expect(denied).toMatchObject({ ok: false, code: "forbidden" });
    expect(
      await getLinkUrl(family, { secret: SECRET, siteUrl: SITE, linkId: groupId }),
    ).toMatchObject({
      ok: false,
      code: "forbidden",
    });
    expect((await snapshot()).links).toEqual([]);
  });

  it("creates a link per target, skips a person covered by the group, and recomputes the URL", async () => {
    const guests = (await loadGuests(db)).guests;
    const anna = guests.find((g) => g.firstName === "Anna")!;
    const result = await createLinks(db, {
      secret: SECRET,
      now: NOW,
      targets: [{ groupId }, { guestId: loneId }, { guestId: anna.id }],
    });
    // Anna is covered by the together group: not a recipient of her own link.
    expect(result).toEqual({ ok: true, data: { created: 2 } });
    const links = (await snapshot()).links;
    expect(links).toHaveLength(2);
    expect(links.every((l) => l.working && l.sharedAt === null)).toBe(true);

    const groupLink = links.find((l) => l.groupId === groupId)!;
    const url = await getLinkUrl(db, { secret: SECRET, siteUrl: SITE, linkId: groupLink.id });
    expect(url).toEqual({
      ok: true,
      data: { url: rsvpUrl(SITE, deriveRsvpToken(SECRET, groupLink.id)) },
    });
    // Creating again changes nothing: they already have a link.
    expect(
      await createLinks(db, {
        secret: SECRET,
        now: NOW,
        targets: [{ groupId }, { guestId: loneId }],
      }),
    ).toEqual({ ok: true, data: { created: 0 } });
  });

  it("marks as shared and Annulla restores the previous stamp and snapshot", async () => {
    const link = (await snapshot()).links.find((l) => l.guestId === loneId)!;
    const marked = await markShared(db, { linkId: link.id, now: NOW });
    if (!marked.ok) throw new Error("markShared");
    expect(marked.data.previous).toMatchObject({ shared_at: null, people: [] });
    expect((await snapshot()).links.find((l) => l.id === link.id)?.sharedAt).not.toBeNull();

    expect(await unmarkShared(db, { linkId: link.id, previous: marked.data.previous })).toEqual({
      ok: true,
      data: { linkId: link.id },
    });
    expect((await snapshot()).links.find((l) => l.id === link.id)?.sharedAt).toBeNull();
    expect(
      await unmarkShared(db, {
        linkId: link.id,
        previous: { shared_at: null, shared_by: null, people: ["x"] },
      }),
    ).toMatchObject({ ok: false });
  });

  it("a new link revokes the old one and gives another URL; revoke ends the last", async () => {
    const old = (await snapshot()).links.find((l) => l.guestId === loneId)!;
    const rotated = await rotateLink(db, { secret: SECRET, now: NOW, linkId: old.id });
    if (!rotated.ok) throw new Error("rotateLink");
    const after = (await snapshot()).links;
    expect(after.find((l) => l.id === old.id)?.revokedAt).not.toBeNull();
    expect(after.find((l) => l.id === rotated.data.linkId)).toMatchObject({
      working: true,
      revokedAt: null,
    });
    expect(await getLinkUrl(db, { secret: SECRET, siteUrl: SITE, linkId: old.id })).toMatchObject({
      ok: false,
      code: "link_not_found",
    });
    expect(await rotateLink(db, { secret: SECRET, now: NOW, linkId: old.id })).toMatchObject({
      ok: false,
      code: "link_not_found",
    });
    expect(await revokeLink(db, { linkId: rotated.data.linkId })).toEqual({
      ok: true,
      data: { linkId: rotated.data.linkId },
    });
    expect(await revokeLink(db, { linkId: rotated.data.linkId })).toMatchObject({
      ok: false,
      code: "link_not_found",
    });
  });

  it("sets the group mode with its version: a stale version is a conflict", async () => {
    const group = (await loadGuests(db)).groups.find((g) => g.id === groupId)!;
    expect(group.rsvpMode).toBe("together");
    const first = await setGroupMode(db, wedding.founder.id, {
      groupId,
      version: group.version,
      mode: "separate",
    });
    expect(first.ok).toBe(true);
    const stale = await setGroupMode(db, wedding.founder.id, {
      groupId,
      version: group.version,
      mode: "together",
    });
    expect(stale).toMatchObject({ ok: false, code: "conflict" });
    expect((await loadGuests(db)).groups.find((g) => g.id === groupId)?.rsvpMode).toBe("separate");
    // The group link no longer works (BR1): nobody is covered by it now.
    expect((await snapshot()).links.find((l) => l.groupId === groupId)?.working).toBe(false);
    const back = await setGroupMode(db, wedding.founder.id, {
      groupId,
      version: group.version + 1,
      mode: "together",
    });
    expect(back.ok).toBe(true);
  });

  it("the actions read the secret at call time: refused when it is missing or too short", async () => {
    const link = (await snapshot()).links.find((l) => l.groupId === groupId)!;
    expect(await getLinkUrlAction({ linkId: link.id })).toMatchObject({
      ok: true,
      data: { url: expect.stringContaining("/rsvp/") },
    });
    vi.stubEnv("RSVP_LINK_SECRET", "too-short");
    try {
      expect(await getLinkUrlAction({ linkId: link.id })).toMatchObject({
        ok: false,
        code: "secret",
      });
      expect(await createLinksAction({ targets: [{ guestId: loneId }] })).toMatchObject({
        ok: false,
        code: "secret",
      });
    } finally {
      vi.unstubAllEnvs();
    }
    expect(await createLinksAction({ targets: [] })).toMatchObject({ ok: false, code: "invalid" });
    expect(await createLinksAction({ targets: [{ guestId: "x" }] })).toMatchObject({
      ok: false,
      code: "invalid",
    });
  });

  it("exports answers and link states, with no token, no hash and no secret (AC13)", async () => {
    const anna = (await loadGuests(db)).guests.find((g) => g.firstName === "Anna")!;
    const written = await serviceClient()
      .from("rsvp_responses")
      .insert({
        id: anna.id,
        wedding_id: wedding.weddingId,
        status: "yes",
        diet: ["vegan"],
        diet_note: "niente noci",
      });
    expect(written.error).toBeNull();

    const exported = await prepareExport(db, NOW);
    if (!exported.ok) throw new Error("prepareExport");
    const doc = JSON.parse(exported.bundle.json) as {
      rsvpResponses: { guestId: string; status: string; diet: string[] }[];
      rsvpLinks: { id: string; groupId: string | null }[];
    };
    expect(doc.rsvpResponses).toEqual([
      expect.objectContaining({ guestId: anna.id, status: "yes", diet: ["vegan"] }),
    ]);
    expect(doc.rsvpLinks.length).toBeGreaterThanOrEqual(2);
    const text = exported.bundle.json;
    for (const link of doc.rsvpLinks) {
      expect(text).not.toContain(deriveRsvpToken(SECRET, link.id));
    }
    expect(text).not.toContain(SECRET);
    expect(text).not.toMatch(/token/i);
    expect(text).not.toMatch(/\b[0-9a-f]{64}\b/);
    expect(exported.bundle.guestsCsv).not.toMatch(/niente noci|yes/);
  });

  it("without the RSVP functions the list opens with no states (not migrated)", async () => {
    const old = {
      rpc: async () => ({ data: null, error: { code: "PGRST202", message: "not found" } }),
    } as unknown as Db;
    expect(await loadRsvp(old, NOW)).toBeNull();
  });
});
