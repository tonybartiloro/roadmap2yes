import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as cron } from "@/app/api/cron/daily/route";
import { emailEnabled, getEmailSender } from "@/lib/email";
import { createWedding, serviceClient, stackEnv } from "../support/supabase";
import { listMessagesTo } from "../../e2e/support/mailbox";

/**
 * QA T17c: "emails off" (plan row "Email spente"), AC59 and AC44.
 * The browser side (banner, explanations, hidden options) is e2e/email-off.spec.ts on the
 * `email-off` project; this file proves the SERVER side: nothing is ever sent or claimed.
 *
 * AC map
 *  - AC59  emailEnabled() for {absent, none, resend without key, resend complete, smtp}; with the
 *          emails off the sender is the null sender: it never sends
 *  - AC44  the daily job still runs a real query and records the heartbeat with the emails off
 *  - AC59/AC53  with the emails off: zero claims in the ledger, zero mails; switching the emails on
 *          later does NOT replay what was skipped
 */

const SECRET = "qa-cron-secret-0123456789";
const today = new Date().toISOString().slice(0, 10);

describe("emailEnabled() and the sender (AC59)", () => {
  const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;
  it.each([
    ["absent", {}, false],
    ["none", { EMAIL_TRANSPORT: "none" }, false],
    ["unknown value", { EMAIL_TRANSPORT: "carrier-pigeon" }, false],
    ["resend without a key", { EMAIL_TRANSPORT: "resend", EMAIL_FROM: "a@example.test" }, false],
    ["resend without a sender", { EMAIL_TRANSPORT: "resend", RESEND_API_KEY: "re_test" }, false],
    [
      "resend complete",
      { EMAIL_TRANSPORT: "resend", RESEND_API_KEY: "re_test", EMAIL_FROM: "App <a@example.test>" },
      true,
    ],
    [
      "smtp with a host",
      { EMAIL_TRANSPORT: "smtp", SMTP_HOST: "127.0.0.1", SMTP_PORT: "54425" },
      true,
    ],
    ["smtp without a host", { EMAIL_TRANSPORT: "smtp" }, false],
    [
      "smtp on Vercel production (clear text is refused there)",
      { EMAIL_TRANSPORT: "smtp", SMTP_HOST: "127.0.0.1", VERCEL_ENV: "production" },
      false,
    ],
  ])("%s -> %s", (_label, input, expected) => {
    expect(emailEnabled(env(input))).toBe(expected);
  });

  it("with the emails off the sender never sends", async () => {
    const sender = getEmailSender(env({}));
    const result = await sender.send({
      to: "nobody@example.test",
      subject: "x",
      text: "x",
      html: "<p>x</p>",
    } as never);
    expect(result.ok).toBe(false);
  });
});

describe("the daily job with the emails off (AC44, AC59)", () => {
  beforeEach(() => {
    const stack = stackEnv();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", stack.url);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", stack.publishableKey);
    vi.stubEnv("SUPABASE_SECRET_KEY", stack.secretKey);
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("EMAIL_LINK_SECRET", "qa-email-link-secret-0123456789-abcdef");
    vi.stubEnv("EMAIL_TRANSPORT", "");
    vi.stubEnv("EMAIL_DAILY_CAP", "100000");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const run = () =>
    cron(
      new Request("http://localhost/api/cron/daily", {
        headers: { authorization: `Bearer ${SECRET}` },
      }),
    );

  it("records the heartbeat, claims nothing, sends nothing; turning the emails on later replays nothing", async () => {
    const w = await createWedding();
    const added = await w.founderClient
      .from("tasks")
      .insert({ wedding_id: w.weddingId, title: "Compito di oggi", due_date: today });
    expect(added.error).toBeNull();

    const heartbeats = async () =>
      (
        await serviceClient()
          .from("heartbeats")
          .select("id", { count: "exact", head: true })
          .eq("source", "daily_job")
      ).count ?? 0;
    const before = await heartbeats();
    const response = await run();
    expect(response.status).toBe(200);
    expect(await heartbeats()).toBeGreaterThan(before);

    // the ledger: no claim for this person, no mail in the catcher
    const ledger = await serviceClient()
      .from("notification_log")
      .select("id")
      .eq("user_id", w.founder.id);
    expect(ledger.data).toEqual([]);
    expect(await listMessagesTo(w.founder.email)).toHaveLength(0);

    // switch the emails ON: what was skipped while off is not replayed for the past day
    vi.stubEnv("EMAIL_TRANSPORT", "smtp");
    vi.stubEnv("SMTP_HOST", "127.0.0.1");
    vi.stubEnv("SMTP_PORT", "54425");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://127.0.0.1:3000");
    const next = await run();
    expect(next.status).toBe(200);
    // the task is due today: the "oggi" reminder is legitimately sent once the emails are on, but a
    // second on-run never doubles it
    await new Promise((r) => setTimeout(r, 1500));
    const after = (await listMessagesTo(w.founder.email)).filter(
      (m) => !/riepilogo/i.test(m.Subject),
    );
    expect(after.length).toBeLessThanOrEqual(1);
    await run();
    await new Promise((r) => setTimeout(r, 1000));
    expect(
      (await listMessagesTo(w.founder.email)).filter((m) => !/riepilogo/i.test(m.Subject)).length,
    ).toBe(after.length);
  });
});
