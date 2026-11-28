import { randomUUID } from "node:crypto";
import { inspect } from "node:util";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { deriveRsvpToken, hashRsvpToken } from "@/features/rsvp/token";
import {
  cleanupAttempts,
  fakeIp,
  newGroup,
  newLink,
  newPerson,
  newWedding,
  RSVP_SECRET,
  type TestLink,
} from "../acceptance/support/rsvp";
import { serviceClient, stackEnv } from "../support/supabase";

/**
 * QA T10 (QA-7): what the public RSVP server code logs and what the browser is told when the
 * database fails. FEAT-2026-004.
 *
 * AC map
 *  - AC14  a Postgres error that carries the token hash, a note and ids (in its message, details and
 *          hint) or a thrown error with the same text: `console` gets no token, hash, note, id or
 *          answer, and the browser-facing result holds only closed codes (`retry`, `error/save`)
 *  - REV-2 a NUL (\u0000) in a note, on the real database, is the generic `retry`: no message, no
 *          write, no log
 * The database is real except in the "fake failure" block, where only the admin client is replaced
 * by one that fails with an error stuffed with the secrets we then look for.
 */
const mode = vi.hoisted(() => ({
  kind: "real" as "real" | "error" | "p0001" | "throw" | "reject",
  real: null as unknown,
  leak: "",
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    if (mode.kind === "real") return mode.real;
    const failure = { code: "XX000", message: mode.leak, details: mode.leak, hint: mode.leak };
    const result =
      mode.kind === "p0001"
        ? {
            data: null,
            error: { ...failure, code: "P0001", message: `invalid_answers ${mode.leak}` },
          }
        : { data: null, error: failure };
    return {
      rpc: () => {
        if (mode.kind === "throw") throw new Error(mode.leak);
        const promise =
          mode.kind === "reject" ? Promise.reject(new Error(mode.leak)) : Promise.resolve(result);
        return Object.assign(promise, { abortSignal: () => promise });
      },
    };
  },
}));

const ip = fakeIp();
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": ip }),
  cookies: async () => ({ get: () => undefined }),
}));

import { rsvpGate, rsvpLoadPage, rsvpSubmit } from "@/features/rsvp/public-rpc";
import { submitRsvp } from "@/features/rsvp/public-actions";

const NOTE = "nota-privata-QA-5521";
const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
  vi.spyOn(console, level).mockImplementation(() => undefined),
);
const logged = () =>
  // `inspect` shows objects and errors (message, stack, fields), not `[object Object]` (REV-130)
  spies
    .flatMap((s) => s.mock.calls.map((c) => c.map((a) => inspect(a, { depth: 4 })).join(" ")))
    .join("\n");

describe("public RSVP code: logs and browser-facing results (QA-7, AC14)", () => {
  const personId = randomUUID();
  const token = deriveRsvpToken(RSVP_SECRET, randomUUID());
  const hash = hashRsvpToken(token);
  const secrets = [token, hash, hash.slice(2), NOTE, personId, "LEAK-MARKER"];
  const answers = [
    { id: personId, status: "yes" as const, diet: ["vegan"], diet_note: NOTE, seen_at: null },
  ];
  const now = new Date();

  const expectSilent = (extra: readonly string[] = []) => {
    const out = logged();
    for (const secret of [...secrets, ...extra]) expect(out, secret).not.toContain(secret);
  };
  const form = () => {
    const f = new FormData();
    f.append("p", personId);
    f.set(`status:${personId}`, "yes");
    f.set(`note:${personId}`, NOTE);
    f.append(`diet:${personId}`, "vegan");
    return f;
  };

  beforeAll(() => {
    const env = stackEnv();
    process.env["NEXT_PUBLIC_SUPABASE_URL"] = env.url;
    process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] = env.publishableKey;
    process.env["SUPABASE_SECRET_KEY"] = env.secretKey;
    mode.real = serviceClient();
  });
  beforeEach(() => {
    for (const spy of spies) spy.mockClear();
    mode.leak = `LEAK-MARKER hash=${hash} token=${token} note=${NOTE} id=${personId} status=yes diet=vegan`;
  });
  afterEach(() => {
    mode.kind = "real";
  });
  afterAll(() => {
    for (const spy of spies) spy.mockRestore();
    cleanupAttempts([ip]);
  });

  describe.each(["error", "throw", "reject"] as const)(
    "the database fails (%s) with the secrets in its text",
    (kind) => {
      beforeEach(() => {
        mode.kind = kind;
      });

      it("rsvpGate is `null` (fail-open) and logs nothing sensitive", async () => {
        expect(await rsvpGate({ token, ip, now, timeoutMs: 1000 })).toBeNull();
        expectSilent();
      });

      it("rsvpLoadPage is the generic `retry`, with or without a timeout", async () => {
        expect(await rsvpLoadPage({ token, ip, now })).toEqual({ state: "retry" });
        expect(await rsvpLoadPage({ token, ip, now, timeoutMs: 1000 })).toEqual({ state: "retry" });
        expectSilent();
      });

      it("rsvpSubmit is the generic `retry`: no message, no code, no id in the result", async () => {
        const result = await rsvpSubmit({ token, ip, answers, now });
        expect(result).toEqual({ state: "retry" });
        expect(JSON.stringify(result)).not.toContain("LEAK");
        expectSilent();
      });

      it("the server action answers the browser with codes only: error/save and the guest's own values", async () => {
        const state = await submitRsvp(token, { status: "idle" } as never, form());
        expect(state).toMatchObject({ status: "error", kind: "save" });
        expect(Object.keys(state).sort()).toEqual(["kind", "status", "values"]);
        const sent = JSON.stringify(state);
        for (const secret of [token, hash, hash.slice(2), "LEAK", "XX000", "hash="]) {
          expect(sent, secret).not.toContain(secret);
        }
        expectSilent();
      });
    },
  );

  it("a P0001 that is not exactly `invalid_answers` (extra text with the secrets) is `retry`, not `invalid`", async () => {
    mode.kind = "p0001";
    expect(await rsvpSubmit({ token, ip, answers, now })).toEqual({ state: "retry" });
    expectSilent();
  });

  it("`invalid_answers` exactly is the only database error forwarded, as the closed state `invalid`", async () => {
    const w = await newWedding();
    const group = await newGroup(w);
    const id = await newPerson(w, "Ida", group);
    const link = await newLink(w, { groupId: group });
    const mine = fakeIp();
    try {
      const result = await rsvpSubmit({
        token: link.token,
        ip: mine,
        answers: [{ id, status: "maybe" as never, diet: [], diet_note: null, seen_at: null }],
        now,
      });
      expect(result).toEqual({ state: "invalid" });
      expectSilent();
    } finally {
      cleanupAttempts([mine], [link.linkId]);
    }
  });

  describe("real database: a NUL in a note (REV-2)", () => {
    let w: Awaited<ReturnType<typeof newWedding>>;
    let link: TestLink;
    let id: string;
    const mine = fakeIp();
    beforeAll(async () => {
      w = await newWedding();
      const group = await newGroup(w);
      id = await newPerson(w, "Nora", group);
      link = await newLink(w, { groupId: group });
    });
    afterAll(() => cleanupAttempts([mine], [link.linkId]));

    const rowNotes = async () =>
      (await serviceClient().from("rsvp_responses").select("diet_note").eq("id", id)).data ?? [];

    it("rsvpSubmit answers the generic `retry`, writes nothing and logs nothing", async () => {
      const result = await rsvpSubmit({
        token: link.token,
        ip: mine,
        answers: [
          { id, status: "yes", diet: [], diet_note: "nota-nul-QA-8812\u0000fine", seen_at: null },
        ],
        now,
      });
      expect(result).toEqual({ state: "retry" });
      expect(await rowNotes()).toEqual([]);
      const out = logged();
      for (const s of [link.token, link.hash, link.hash.slice(2), "nota-nul-QA-8812", id])
        expect(out, s).not.toContain(s);
    });

    it("the same link takes a normal answer afterwards (the NUL did not poison anything), still silent", async () => {
      const result = await rsvpSubmit({
        token: link.token,
        ip: mine,
        answers: [{ id, status: "yes", diet: ["vegan"], diet_note: NOTE, seen_at: null }],
        now,
      });
      expect(result.state).toBe("ok");
      expect(await rowNotes()).toEqual([{ diet_note: NOTE }]);
      const out = logged();
      for (const s of [link.token, link.hash.slice(2), NOTE, id]) expect(out, s).not.toContain(s);
    });
  });
});
