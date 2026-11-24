import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as cron } from "@/app/api/cron/daily/route";
import { GET, POST } from "@/app/(public)/email/disattiva/route";
import { createWedding, serviceClient, stackEnv, type TestWedding } from "../support/supabase";
import {
  APP_MAILPIT_URL,
  extractLinks,
  getMessage,
  listMessagesTo,
} from "../../e2e/support/mailbox";

/**
 * QA T17c: unsubscribing from the mailbox (plan row "Disattivazione"), AC52.
 * The link is taken from a REAL reminder mail (job -> SMTP -> Mailpit), then used the way a mail
 * client and a scanner would.
 *
 * AC map
 *  - AC52  GET changes nothing (scanners open links); POST one-click works with NO session and no
 *          cookies; only that kind is switched off; a tampered, other-kind or other-user token gets
 *          the same neutral answer; no-referrer/no-store headers; after unsubscribing the job
 *          sends no more reminders to that person while the partner keeps getting them
 *  (the invitation mail has no unsubscribe link: asserted in e2e/partner.spec.ts)
 */

const SECRET = "qa-cron-secret-0123456789";
const today = new Date().toISOString().slice(0, 10);

beforeEach(() => {
  const stack = stackEnv();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", stack.url);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", stack.publishableKey);
  vi.stubEnv("SUPABASE_SECRET_KEY", stack.secretKey);
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.stubEnv("EMAIL_LINK_SECRET", "qa-email-link-secret-0123456789-abcdef");
  vi.stubEnv("EMAIL_TRANSPORT", "smtp");
  vi.stubEnv("SMTP_HOST", "127.0.0.1");
  vi.stubEnv("SMTP_PORT", "54425");
  vi.stubEnv("EMAIL_DAILY_CAP", "100000");
  vi.stubEnv("EMAIL_MONTHLY_CAP", "1000000");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://127.0.0.1:3000");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const runJob = () =>
  cron(
    new Request("http://localhost/api/cron/daily", {
      headers: { authorization: `Bearer ${SECRET}` },
    }),
  );

async function reminderLink(w: TestWedding, kind = "reminders"): Promise<string> {
  const inserted = await w.founderClient
    .from("tasks")
    .insert({ wedding_id: w.weddingId, title: "Compito di prova", due_date: today });
  expect(inserted.error).toBeNull();
  expect((await runJob()).status).toBe(200);
  const deadline = Date.now() + 10_000;
  for (;;) {
    const mails = (await listMessagesTo(w.founder.email)).filter(
      (m) => !/riepilogo/i.test(m.Subject),
    );
    if (mails[0]) {
      const link = extractLinks(await getMessage(mails[0].ID)).find((l) =>
        l.includes(`tipo=${kind}`),
      );
      if (link) return link;
    }
    if (Date.now() > deadline) throw new Error("no reminder mail with an unsubscribe link");
    await new Promise((r) => setTimeout(r, 250));
  }
}

const asRequest = (link: string, init?: RequestInit) =>
  new Request(link.replace("127.0.0.1:3000", "localhost"), init);

async function preference(w: TestWedding, kind = "reminders") {
  const row = await serviceClient()
    .from("notification_preferences")
    .select("*")
    .eq("user_id", w.founder.id)
    .maybeSingle();
  return (row.data as Record<string, unknown> | null)?.[
    kind === "reminders" ? "reminders_enabled" : "digest_enabled"
  ];
}

describe("one-click unsubscribe from a real reminder (AC52)", () => {
  it("GET changes nothing; POST with no session switches off reminders only; the job then stops sending", async () => {
    const w = await createWedding();
    const link = await reminderLink(w);
    expect(link).toContain("/email/disattiva");

    const before = await preference(w);
    const page = await GET(asRequest(link));
    expect(page.status).toBe(200);
    expect(page.headers.get("referrer-policy")).toBe("no-referrer");
    expect(page.headers.get("cache-control")).toMatch(/no-store/);
    expect(await preference(w)).toEqual(before);

    // the one-click POST of the mail client: no cookies, no session, the token is the only credential
    const done = await POST(
      asRequest(link, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
      }),
    );
    expect(done.status).toBe(200);
    expect(await preference(w, "reminders")).toBe(false);
    expect(await preference(w, "digest")).not.toBe(false);
    // idempotent
    expect((await POST(asRequest(link, { method: "POST" }))).status).toBe(200);

    // a new task due today: no new reminder mail for the one who opted out
    const sentBefore = (await listMessagesTo(w.founder.email)).filter(
      (m) => !/riepilogo/i.test(m.Subject),
    ).length;
    await w.founderClient
      .from("tasks")
      .insert({ wedding_id: w.weddingId, title: "Un altro compito", due_date: today });
    expect((await runJob()).status).toBe(200);
    await new Promise((r) => setTimeout(r, 1000));
    const sentAfter = (await listMessagesTo(w.founder.email)).filter(
      (m) => !/riepilogo/i.test(m.Subject),
    ).length;
    expect(sentAfter).toBe(sentBefore);
  });

  it("a tampered token, a token of the other kind and a token of another person get one neutral answer and change nothing", async () => {
    const w = await createWedding();
    const other = await createWedding();
    const link = await reminderLink(w);
    const url = new URL(link);
    const token = url.searchParams.get("t")!;

    const tampered = `${url.origin}${url.pathname}?tipo=reminders&t=${token.slice(0, -2)}xx`;
    const otherKind = `${url.origin}${url.pathname}?tipo=digest&t=${token}`;
    const missing = `${url.origin}${url.pathname}?tipo=reminders`;
    const garbage = `${url.origin}${url.pathname}?tipo=reminders&t=not-a-token`;
    const answers: string[] = [];
    for (const bad of [tampered, otherKind, missing, garbage]) {
      for (const handler of [GET, POST]) {
        const response = await handler(
          asRequest(bad, handler === POST ? { method: "POST" } : undefined),
        );
        expect(response.status).toBe(400);
        answers.push(await response.text());
      }
    }
    expect(new Set(answers).size).toBe(1); // the same neutral page every time
    expect(await preference(w)).not.toBe(false);

    // the other person's own link cannot switch THIS person off
    const theirLink = await reminderLink(other);
    expect(theirLink).not.toBe(link);
    expect(await preference(w)).not.toBe(false);
  });
});
