import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { blockedHtml } from "@/features/rsvp/blocked-html";
import { NEUTRAL_HEADING, NEUTRAL_TEXT, neutralHtml } from "@/features/rsvp/neutral-html";
import { APPROVED_THEME_IDS, DEFAULT_THEME_ID } from "@/themes/approved";
import { anonClient, serviceClient, type TestWedding } from "../support/supabase";
import {
  APP_BUILT,
  ageIp,
  chooseDate,
  cleanupAttempts,
  fakeIp,
  fingerprint,
  hiddenFields,
  ipAttempt,
  newGroup,
  newLink,
  newPerson,
  newWedding,
  request,
  revoke,
  setSeparate,
  softDeletePerson,
  stableHeaders,
  startApp,
  submitRpc,
  unknownToken,
  type AppServer,
  type Reply,
  type TestLink,
} from "./support/rsvp";
import { sql } from "./support/sql";

/**
 * QA T10: the public RSVP edge over HTTP, on the BUILT app (`next start` on its own port, no
 * `E2E_CLOCK`) and the real local database. FEAT-2026-004.
 *
 * AC map
 *  - AC2   a working link opens the page (200, wedding theme only from the proxy, a forged
 *          `x-r2y-theme` ignored); opening writes nothing but the limiter (QA-11)
 *  - AC6   every dead link opens the SAME neutral 404 (unknown, revoked, expired, no living member,
 *          dormant) and the same neutral content after a submit; one BR9 failure per dead open
 *  - AC10  10 invalid links per IP then 429 with Retry-After in (0, 900]; a working token is never
 *          blocked; unblocked by moving the row; no IP = no limit (P5)
 *  - AC11  the clock cookie does not move time on a server without E2E_CLOCK (QA-1)
 *  - AC14  PostgREST gives anon and authenticated no way to the public RPCs, the limiter or answers;
 *          the server's own output carries no token, hash or note
 *  - D15   Referrer-Policy per page type: form `same-origin`, neutral 404 and 429 `no-referrer`
 * Needs `npm run build` (skipped, and reported as skipped, without it; CI sets HEADERS_REQUIRED=1).
 * Every test uses its own wedding, links and synthetic IP, and removes its limiter rows (QA-2).
 */

if (process.env["HEADERS_REQUIRED"] === "1" && !APP_BUILT) {
  throw new Error("HEADERS_REQUIRED=1 but there is no .next/BUILD_ID: run `npm run build`");
}

const THEME = APPROVED_THEME_IDS.find((id) => id !== DEFAULT_THEME_ID)!;
const NEUTRAL_BYTES = Buffer.from(neutralHtml());
const NOTE = "senza-arachidi-QA-NOTE-7731";
const day = (offset: number): string =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

type Open = { name: string; token: string };

describe.skipIf(!APP_BUILT)("RSVP public edge (built app)", () => {
  let app: AppServer;
  const ips: string[] = [];
  const linkIds: string[] = [];
  const secrets: string[] = [];
  const ip = () => {
    const v = fakeIp();
    ips.push(v);
    return v;
  };
  const track = (link: TestLink): TestLink => {
    linkIds.push(link.linkId);
    secrets.push(link.token, link.hash.slice(2));
    return link;
  };
  const open = (token: string, init: Parameters<typeof request>[2] = {}) =>
    request(app.base, `/rsvp/${token}`, init);

  let themed: TestWedding;
  let live: TestLink;
  let liveNames: string[];
  const dead: Open[] = [];

  beforeAll(async () => {
    app = await startApp();
    themed = await newWedding({ themeId: THEME });
    // A working link: a "together" group of two.
    const group = await newGroup(themed, "Famiglia QA");
    await newPerson(themed, "Alba", group);
    await newPerson(themed, "Bruno", group, "child");
    liveNames = ["Alba", "Bruno"];
    live = track(await newLink(themed, { groupId: group }));

    // Dead cause: revoked.
    const g1 = await newGroup(themed);
    await newPerson(themed, "Carla", g1);
    const revokedLink = track(await newLink(themed, { groupId: g1 }));
    await revoke(themed, revokedLink.linkId);
    dead.push({ name: "revoked", token: revokedLink.token });

    // Dead cause: no living member.
    const g2 = await newGroup(themed);
    const gone = await newPerson(themed, "Dario", g2);
    const emptyLink = track(await newLink(themed, { groupId: g2 }));
    await softDeletePerson(themed, gone);
    dead.push({ name: "no living member", token: emptyLink.token });

    // Dead cause: dormant (the group became "ognuno per sé", its own link covers nobody).
    const g3 = await newGroup(themed);
    await newPerson(themed, "Elia", g3);
    const dormant = track(await newLink(themed, { groupId: g3 }));
    await setSeparate(themed, g3);
    dead.push({ name: "dormant", token: dormant.token });

    // Dead cause: expired (date chosen long ago: +30 days is past).
    const old = await newWedding({ themeId: THEME });
    const g4 = await newGroup(old);
    await newPerson(old, "Fabia", g4);
    const expired = track(await newLink(old, { groupId: g4 }));
    await chooseDate(old, "2026-01-01");
    dead.push({ name: "expired", token: expired.token });

    // Dead cause: unknown (right shape, no link).
    dead.push({ name: "unknown", token: unknownToken() });
  }, 120_000);

  afterAll(() => {
    app?.stop();
    cleanupAttempts(ips, linkIds);
  });

  describe("a working link", () => {
    it("opens the page: 200, wedding theme from the proxy, same-origin referrer, no limiter row", async () => {
      const mine = ip();
      const r = await open(live.token, { ip: mine });
      expect(r.status).toBe(200);
      expect(r.headers.get("referrer-policy")).toBe("same-origin");
      expect(r.headers.get("cache-control")).toBe("private, no-store");
      expect(r.headers.get("x-robots-tag")).toMatch(/noindex/);
      expect(r.headers.get("x-r2y-theme")).toBeNull();
      expect(r.text).toContain(`data-theme="${THEME}"`);
      for (const name of liveNames) expect(r.text).toContain(name);
      expect(r.text).toContain('content="noindex, nofollow"');
      expect(ipAttempt(mine)).toBeNull();
    });

    it("a client-sent x-r2y-theme never repaints the page or a neutral answer", async () => {
      const forged = APPROVED_THEME_IDS.find((id) => id !== THEME && id !== DEFAULT_THEME_ID)!;
      const page = await open(live.token, { ip: ip(), headers: { "x-r2y-theme": forged } });
      expect(page.text).toContain(`data-theme="${THEME}"`);
      expect(page.text).not.toContain(`data-theme="${forged}"`);
      const neutral = await open(dead[0]!.token, { ip: ip(), headers: { "x-r2y-theme": forged } });
      expect(Buffer.compare(neutral.bytes, NEUTRAL_BYTES)).toBe(0);
    });

    it("a trailing slash is a redirect to the canonical path, never a page", async () => {
      const r = await request(app.base, `/rsvp/${live.token}/`, { ip: ip() });
      expect([307, 308]).toContain(r.status);
      expect(new URL(r.headers.get("location") ?? "", app.base).pathname).toBe(
        `/rsvp/${live.token}`,
      );
    });

    it("the clock cookie does not move time on a server without E2E_CLOCK (QA-1)", async () => {
      const w = await newWedding({ date: day(400) });
      const g = await newGroup(w);
      await newPerson(w, "Gina", g);
      const link = track(await newLink(w, { groupId: g }));
      const farFuture = new Date(Date.now() + 900 * 86_400_000).toISOString();
      // Control: the database does expire this link at that instant...
      const direct = await serviceClient().rpc("rsvp_page", {
        p_token_hash: link.hash,
        p_now: farFuture,
      });
      expect(direct.data).toEqual({ ok: false });
      // ...but the cookie changes nothing here.
      const mine = ip();
      const r = await open(link.token, {
        ip: mine,
        headers: { cookie: `r2y-test-now=${farFuture}` },
      });
      expect(r.status).toBe(200);
      expect(r.text).toContain("Gina");
      expect(ipAttempt(mine)).toBeNull();
    });
  });

  describe("the neutral 404 at open (AC6, Arbitrato S3)", () => {
    const malformed: Open[] = [
      { name: "too short", token: "abc" },
      { name: "43 chars with a forbidden character", token: `${"a".repeat(42)}!` },
      { name: "44 characters", token: "a".repeat(44) },
      { name: "broken percent escape", token: "%E0%A4%A" },
    ];

    it.each(malformed)("malformed ($name): 404 neutral, no database, no counter", async (c) => {
      const mine = ip();
      const r = await open(c.token, { ip: mine });
      expect(r.status).toBe(404);
      expect(Buffer.compare(r.bytes, NEUTRAL_BYTES)).toBe(0);
      expect(ipAttempt(mine)).toBeNull();
    });

    it("the 5 causes: same status, same bytes, same headers; one failure counted per open (BR9)", async () => {
      const reference = await open("abc", { ip: ip() });
      const results: { name: string; reply: Reply; ip: string }[] = [];
      for (const cause of dead) {
        const mine = ip();
        results.push({ name: cause.name, reply: await open(cause.token, { ip: mine }), ip: mine });
      }
      expect(results.map((r) => r.name).sort()).toEqual(
        ["dormant", "expired", "no living member", "revoked", "unknown"].sort(),
      );
      for (const { name, reply, ip: mine } of results) {
        expect(reply.status, name).toBe(404);
        expect(Buffer.compare(reply.bytes, NEUTRAL_BYTES), `${name}: body`).toBe(0);
        expect(stableHeaders(reply.headers), `${name}: headers`).toEqual(
          stableHeaders(reference.headers),
        );
        expect(ipAttempt(mine), `${name}: exactly one failure`).toEqual({
          failed: 1,
          locked: false,
        });
      }
    });

    it("exact header set of the neutral 404, and nothing of the wedding in it", async () => {
      const r = await open(dead[0]!.token, { ip: ip() });
      const h = r.headers;
      expect(h.get("content-type")).toBe("text/html; charset=utf-8");
      expect(h.get("cache-control")).toBe("private, no-store");
      expect(h.get("x-robots-tag")).toBe("noindex, nofollow");
      expect(h.get("referrer-policy")).toBe("no-referrer");
      expect(h.get("x-r2y-theme")).toBeNull();
      expect(h.get("retry-after")).toBeNull();
      expect(r.text).not.toMatch(/<script/i);
      expect(r.text).not.toContain("__next_error__");
      expect(r.text).not.toContain("data-theme");
      expect(r.text).not.toContain(THEME);
      expect(r.text).toContain(NEUTRAL_HEADING);
      expect(r.text).toContain(NEUTRAL_TEXT);
    });

    it("Referrer-Policy per page type: form same-origin; dead-link and malformed 404 no-referrer", async () => {
      expect((await open(live.token, { ip: ip() })).headers.get("referrer-policy")).toBe(
        "same-origin",
      );
      for (const token of [dead[0]!.token, dead[4]!.token, "abc"]) {
        expect((await open(token, { ip: ip() })).headers.get("referrer-policy")).toBe(
          "no-referrer",
        );
      }
    });
  });

  describe("the same neutral content after a submit (no JS), whatever the cause (AC6)", () => {
    /** Opens the page of a fresh working link, kills the link, posts the form like a browser. */
    async function submitAfter(
      kill: (w: TestWedding, link: TestLink, groupId: string) => Promise<void>,
    ) {
      const w = await newWedding({ themeId: THEME });
      const g = await newGroup(w);
      const p1 = await newPerson(w, "Hana", g);
      const link = track(await newLink(w, { groupId: g }));
      const mine = ip();
      const page = await open(link.token, { ip: mine });
      expect(page.status).toBe(200);
      const form = new FormData();
      for (const [name, value] of hiddenFields(page.text)) form.append(name, value);
      form.set(`status:${p1}`, "yes");
      form.set(`note:${p1}`, NOTE);
      await kill(w, link, g);
      return request(app.base, `/rsvp/${link.token}`, {
        method: "POST",
        ip: mine,
        body: form,
        headers: { origin: app.base },
      });
    }

    const kills: [string, Parameters<typeof submitAfter>[0]][] = [
      ["revoked", (w, link) => revoke(w, link.linkId)],
      ["dormant", (w, _l, g) => setSeparate(w, g)],
      [
        "unknown",
        async (w, link) => void sql(`delete from public.rsvp_links where id = '${link.linkId}'`),
      ],
      ["expired", (w) => chooseDate(w, "2026-01-01")],
    ];

    it("revoked, dormant, unknown and expired links answer the same neutral view, no wedding data", async () => {
      const normalized: string[] = [];
      for (const [name, kill] of kills) {
        const r = await submitAfter(kill);
        expect(r.status, name).toBe(200);
        expect(r.text, name).toContain(NEUTRAL_HEADING);
        expect(r.text, name).toContain(NEUTRAL_TEXT);
        expect(r.text, name).not.toContain("Hana");
        expect(r.text, name).not.toContain(NOTE);
        expect(r.text, name).not.toContain(`data-theme="${THEME}"`);
        // what differs between two answers is only the framework's own opaque payload
        normalized.push(
          r.text
            .replace(/<script[\s\S]*?<\/script>/g, "")
            .replace(/<input[^>]*type="hidden"[^>]*>/g, "")
            .replace(/\/rsvp\/[A-Za-z0-9_-]{43}/g, "/rsvp/T"),
        );
      }
      for (const body of normalized.slice(1)) expect(body).toBe(normalized[0]);
    });
  });

  describe("opening does not modify (QA-11)", () => {
    it("counts and latest change of responses, links, guests and audit are the same after any GET", async () => {
      const first = (await open(live.token, { ip: ip() })).status;
      expect(first).toBe(200);
      // one real answer so the tables are not empty
      const people = await themed.founderClient
        .from("guests")
        .select("id")
        .eq("first_name", "Alba")
        .single();
      const answered = await submitRpc(live.hash, [
        { id: people.data!.id, status: "yes", diet: ["vegan"] },
      ]);
      expect(answered.data).toMatchObject({ ok: true });
      const before = fingerprint(themed.weddingId);
      expect(before).toContain("responses|1|");
      for (const token of [live.token, ...dead.map((d) => d.token), "abc"]) {
        await open(token, { ip: ip() });
      }
      expect(fingerprint(themed.weddingId)).toBe(before);
    });
  });

  describe("the temporary block (AC10)", () => {
    it("10 invalid links are 404, the next is a 429 with Retry-After in (0, 900]; a working token still opens; moving the row unblocks", async () => {
      const mine = ip();
      for (let i = 1; i <= 10; i += 1) {
        const r = await open(unknownToken(), { ip: mine });
        expect(r.status, `invalid link #${i}`).toBe(404);
      }
      expect(ipAttempt(mine)).toEqual({ failed: 10, locked: true });

      const blocked = await open(unknownToken(), { ip: mine });
      expect(blocked.status).toBe(429);
      const retryAfter = Number(blocked.headers.get("retry-after"));
      expect(Number.isInteger(retryAfter)).toBe(true);
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(900);
      expect(blocked.text).toBe(blockedHtml());
      expect(blocked.text).not.toMatch(/<script/i);
      expect(blocked.headers.get("referrer-policy")).toBe("no-referrer");
      expect(blocked.headers.get("cache-control")).toBe("private, no-store");
      expect(blocked.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      expect(blocked.headers.get("content-type")).toBe("text/html; charset=utf-8");
      // a blocked request is not counted again, and a dead link of the cause list is 429 too
      expect((await open(dead[0]!.token, { ip: mine })).status).toBe(429);
      expect(ipAttempt(mine)).toEqual({ failed: 10, locked: true });

      // a WORKING token is never blocked by the IP limit
      const ok = await open(live.token, { ip: mine });
      expect(ok.status).toBe(200);

      // the 15 minutes pass (row moved): the IP is a visitor again, the count restarts
      ageIp(mine, 16);
      const again = await open(unknownToken(), { ip: mine });
      expect(again.status).toBe(404);
      expect(ipAttempt(mine)).toEqual({ failed: 1, locked: false });
    });

    it("another address is not affected by a blocked one", async () => {
      const bad = ip();
      for (let i = 0; i < 11; i += 1) await open(unknownToken(), { ip: bad });
      expect((await open(unknownToken(), { ip: bad })).status).toBe(429);
      expect((await open(unknownToken(), { ip: ip() })).status).toBe(404);
    });

    // "No client address = no IP limit" (P5) cannot be driven over HTTP: Next itself puts the
    // socket address in `x-forwarded-for` when the client sends none. It stays a pgTAP case
    // (`rsvp_public.test.sql`, IP null).
  });

  describe("PostgREST gives the public no way to the RSVP internals (AC14, AC10)", () => {
    const args = () => ({ p_token_hash: live.hash, p_ip_key: undefined });
    const someone = async () =>
      (await themed.founderClient.from("guests").select("id").limit(1)).data![0]!.id;

    it.each(["rsvp_gate", "rsvp_page"] as const)(
      "%s: refused for anon and for a signed-in user",
      async (fn) => {
        const user = await themed.founderClient.rpc(fn, args() as never);
        const anon = await anonClient().rpc(fn, args() as never);
        for (const r of [user, anon]) {
          expect(r.error, fn).not.toBeNull();
          expect(r.data, fn).toBeNull();
        }
      },
    );

    it("rsvp_submit: refused for anon and for a signed-in user, nothing written", async () => {
      const id = await someone();
      const body = {
        p_token_hash: live.hash,
        p_ip_key: null as unknown as string,
        p_answers: [{ id, status: "yes", diet: [], diet_note: NOTE, seen_at: null }],
      };
      for (const client of [themed.founderClient, anonClient()]) {
        const r = await client.rpc("rsvp_submit", body as never);
        expect(r.error).not.toBeNull();
        expect(r.data).toBeNull();
      }
      const rows = await serviceClient()
        .from("rsvp_responses")
        .select("diet_note")
        .eq("diet_note", NOTE);
      expect(rows.data).toEqual([]);
    });

    it("the limiter table and the token hash are unreachable; answers are not readable by anon", async () => {
      const anon = anonClient();
      const limiter = await anon.from("rsvp_attempts" as never).select("*");
      expect(limiter.error).not.toBeNull();
      const hash = await themed.founderClient.from("rsvp_links").select("token_hash" as never);
      expect(hash.error).not.toBeNull();
      const answers = await anon.from("rsvp_responses").select("*");
      expect(answers.data ?? []).toEqual([]);
      const links = await anon.from("rsvp_links").select("id");
      expect(links.data ?? []).toEqual([]);
    });

    it("a NUL (\\u0000) in a note is refused by the database before the RPC body, and writes nothing (REV-2)", async () => {
      const id = await someone();
      const r = await submitRpc(live.hash, [{ id, status: "yes", diet_note: "ab\u0000cd" }], null);
      expect(r.error).not.toBeNull();
      expect(r.data).toBeNull();
      expect(r.error?.message ?? "").not.toContain(live.hash);
      const row = await serviceClient().from("rsvp_responses").select("diet_note").eq("id", id);
      expect((row.data ?? []).every((x) => x.diet_note === null)).toBe(true);
    });
  });

  describe("what the server says about itself", () => {
    it("its output holds no token, hash or note (QA-7)", async () => {
      const output = app.output();
      for (const secret of secrets) expect(output).not.toContain(secret);
      expect(output).not.toContain(NOTE);
      expect(output).not.toMatch(/\\x[0-9a-f]{64}/);
    });
  });
});

// Always-present marker so a skipped file shows its reason in the report.
describe.skipIf(APP_BUILT)("RSVP public edge (SKIPPED: no build)", () => {
  it.skip("needs `npm run build` (a built `.next`)", () => {});
});
