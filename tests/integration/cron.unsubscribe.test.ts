import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUnsubscribeToken } from "@/lib/email/unsubscribe-token";
import {
  createUser,
  createWedding,
  serviceClient,
  stackEnv,
  type TestWedding,
} from "../support/supabase";
import { GET, POST } from "@/app/(public)/email/disattiva/route";

/**
 * T16 (AC52, code-5 REV-8): `/email/disattiva` against the local stack. GET changes nothing;
 * POST is the one-click request of the mail client (no session, no cookies); tokens are bound to
 * kind and user; the response never lets the token leak through Referer.
 */

const LINK_SECRET = "integration-test-link-secret-0123456789";
const service = serviceClient();
let wedding: TestWedding;

const url = (kind: string, token: string) =>
  `http://localhost/email/disattiva?tipo=${kind}&t=${encodeURIComponent(token)}`;

async function prefs(w: TestWedding) {
  const { data, error } = await service
    .from("notification_preferences")
    .select("reminders_enabled, digest_enabled")
    .eq("user_id", w.founder.id)
    .eq("wedding_id", w.weddingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

beforeEach(async () => {
  const stack = stackEnv();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", stack.url);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", stack.publishableKey);
  vi.stubEnv("SUPABASE_SECRET_KEY", stack.secretKey);
  vi.stubEnv("EMAIL_LINK_SECRET", LINK_SECRET);
  wedding = await createWedding();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /email/disattiva", () => {
  it("shows a confirmation and changes nothing", async () => {
    const token = createUnsubscribeToken({ userId: wedding.founder.id, kind: "reminders" });
    const response = await GET(new Request(url("reminders", token)));
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Vuoi disattivare i promemoria");
    expect(html).toContain('method="post"');
    expect(await prefs(wedding)).toBeNull();
  });

  it("sends no-referrer and no-store headers, and does not echo the token outside the form action", async () => {
    const token = createUnsubscribeToken({ userId: wedding.founder.id, kind: "digest" });
    const response = await GET(new Request(url("digest", token)));
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html.split(token).length - 1).toBe(1); // only inside the form action
    expect(html).toContain("riepilogo del lunedì");
  });

  it("refuses tampered, other-kind, other-user, malformed and missing tokens with one neutral page", async () => {
    const other = await createUser();
    const good = createUnsubscribeToken({ userId: wedding.founder.id, kind: "reminders" });
    const cases = [
      url("reminders", good.slice(0, -2) + "xx"),
      url("digest", good), // token for another kind
      url("reminders", createUnsubscribeToken({ userId: other.id, kind: "digest" })),
      url("reminders", "garbage"),
      url("sconosciuto", good),
      "http://localhost/email/disattiva",
      "http://localhost/email/disattiva?tipo=reminders",
    ];
    const bodies = new Set<string>();
    for (const target of cases) {
      const response = await GET(new Request(target));
      expect(response.status).toBe(400);
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      bodies.add(await response.text());
    }
    expect(bodies.size).toBe(1);
    expect(await prefs(wedding)).toBeNull();
  });

  it("refuses everything when the link secret is not configured", async () => {
    const token = createUnsubscribeToken({ userId: wedding.founder.id, kind: "reminders" });
    vi.stubEnv("EMAIL_LINK_SECRET", "");
    expect((await GET(new Request(url("reminders", token)))).status).toBe(400);
    expect((await POST(new Request(url("reminders", token), { method: "POST" }))).status).toBe(400);
    expect(await prefs(wedding)).toBeNull();
  });
});

describe("POST /email/disattiva (one-click)", () => {
  it("switches off only that kind, without any session, and is idempotent", async () => {
    const token = createUnsubscribeToken({ userId: wedding.founder.id, kind: "reminders" });
    const oneClick = () =>
      POST(
        new Request(url("reminders", token), {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: "List-Unsubscribe=One-Click",
        }),
      );
    const first = await oneClick();
    expect(first.status).toBe(200);
    expect(first.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await first.text()).toContain("disattivati");
    expect(await prefs(wedding)).toEqual({ reminders_enabled: false, digest_enabled: true });

    expect((await oneClick()).status).toBe(200);
    expect(await prefs(wedding)).toEqual({ reminders_enabled: false, digest_enabled: true });
  });

  it("the digest token switches off the digest and keeps the reminders", async () => {
    const token = createUnsubscribeToken({ userId: wedding.founder.id, kind: "digest" });
    const response = await POST(new Request(url("digest", token), { method: "POST" }));
    expect(response.status).toBe(200);
    expect(await prefs(wedding)).toEqual({ reminders_enabled: true, digest_enabled: false });
  });

  it("unsubscribing both kinds one after the other keeps both off", async () => {
    for (const kind of ["reminders", "digest"] as const) {
      const token = createUnsubscribeToken({ userId: wedding.founder.id, kind });
      expect((await POST(new Request(url(kind, token), { method: "POST" }))).status).toBe(200);
    }
    expect(await prefs(wedding)).toEqual({ reminders_enabled: false, digest_enabled: false });
  });

  it("refuses tampered and other-kind tokens and changes nothing", async () => {
    const good = createUnsubscribeToken({ userId: wedding.founder.id, kind: "reminders" });
    for (const target of [url("reminders", good + "x"), url("digest", good)]) {
      expect((await POST(new Request(target, { method: "POST" }))).status).toBe(400);
    }
    expect(await prefs(wedding)).toBeNull();
  });

  it("a token for an account without a wedding gets the same neutral answer", async () => {
    const orphan = await createUser();
    const token = createUnsubscribeToken({ userId: orphan.id, kind: "reminders" });
    const response = await POST(new Request(url("reminders", token), { method: "POST" }));
    expect(response.status).toBe(400);
  });

  it("answers 500 with a neutral page when the database fails", async () => {
    const token = createUnsubscribeToken({ userId: wedding.founder.id, kind: "reminders" });
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    const response = await POST(new Request(url("reminders", token), { method: "POST" }));
    expect(response.status).toBe(500);
    expect(await response.text()).toContain("Qualcosa non ha funzionato");
  });
});
