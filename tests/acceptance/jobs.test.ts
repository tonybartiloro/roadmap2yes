import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/cron/daily/route";
import {
  addPartnerB,
  createWedding,
  createUser,
  serviceClient,
  stackEnv,
  type TestWedding,
} from "../support/supabase";
import {
  APP_MAILPIT_URL,
  listMessagesTo,
  getMessage,
  extractLinks,
} from "../../e2e/support/mailbox";

/**
 * QA T17c: the daily job as the scheduler runs it: the REAL route handler, the REAL SMTP transport
 * into the local Mailpit, judged from the recipient's mailbox (not from the job's own counters).
 *
 * AC map
 *  - AC50  one grouped email per person per day with "tra 7 giorni" and "oggi" blocks; assignee
 *          rules; no reminder for a done, deleted or switched-off task (AC61); a partner who has not
 *          entered yet gets nothing (the shared tasks go to A only)
 *  - AC52  every reminder carries the unsubscribe link and the one-click headers
 *  - AC53  two runs the same day, and two OVERLAPPING runs, deliver ONE email each; the quota cap is
 *          recorded and flagged
 *  - AC44  the route answers 401 without the secret and records a heartbeat
 * Mailpit is shared: every assertion is scoped to this test's own fake addresses.
 */

const SECRET = "qa-cron-secret-0123456789";
const today = new Date().toISOString().slice(0, 10);
const plus = (days: number): string => {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

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
  vi.stubEnv("MAILPIT_API_URL", APP_MAILPIT_URL);
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

const run = () =>
  GET(
    new Request("http://localhost/api/cron/daily", {
      headers: { authorization: `Bearer ${SECRET}` },
    }),
  );

async function task(
  w: TestWedding,
  title: string,
  due: string,
  extra: { assignee?: string; reminders?: boolean } = {},
) {
  const inserted = await w.founderClient.from("tasks").insert({
    wedding_id: w.weddingId,
    title,
    due_date: due,
    assignee: extra.assignee ?? "both",
    reminders_enabled: extra.reminders ?? true,
  });
  expect(inserted.error).toBeNull();
}

/** The daily reminder mails of an address (the Monday-Wednesday digest has its own subject). */
async function remindersTo(to: string) {
  return (await listMessagesTo(to)).filter((m) => !/riepilogo/i.test(m.Subject));
}

async function waitFor(to: string, count: number) {
  const deadline = Date.now() + 8_000;
  for (;;) {
    const found = await remindersTo(to);
    if (found.length >= count || Date.now() > deadline) return found;
    await new Promise((r) => setTimeout(r, 250));
  }
}

async function settle(): Promise<void> {
  // a late duplicate would show up a moment after the run
  await new Promise((r) => setTimeout(r, 800));
}

describe("the route (AC44)", () => {
  it("answers 401 without the secret and with a wrong one, and 200 with it", async () => {
    expect((await GET(new Request("http://localhost/api/cron/daily"))).status).toBe(401);
    expect(
      (
        await GET(
          new Request("http://localhost/api/cron/daily", {
            headers: { authorization: "Bearer nope" },
          }),
        )
      ).status,
    ).toBe(401);
    const ok = await run();
    expect(ok.status).toBe(200);
    const heartbeat = await serviceClient()
      .from("heartbeats")
      .select("id", { count: "exact", head: true })
      .eq("source", "daily_job");
    expect(heartbeat.count).toBeGreaterThan(0);
  });
});

describe("reminders reach the mailbox once (AC50, AC52, AC53, AC61)", () => {
  it("one grouped mail per partner: 7-day and today blocks, no done/deleted/switched-off task, unsubscribe link and one-click headers", async () => {
    const w = await createWedding();
    const b = await addPartnerB(w);
    await w.founderClient.from("wedding_partners").update({ first_name: "Tony" }).eq("slot", "A");
    await task(w, "Prenotare la sala prove", plus(7));
    await task(w, "Ritirare le bomboniere", plus(0));
    await task(w, "Solo per lei", plus(0), { assignee: "B" });
    await task(w, "Senza promemoria", plus(0), { reminders: false });
    const done = await w.founderClient
      .from("tasks")
      .insert({ wedding_id: w.weddingId, title: "Gia fatto", due_date: plus(0) })
      .select("id")
      .single();
    await w.founderClient.from("tasks").update({ status: "done" }).eq("id", done.data!.id);
    const gone = await w.founderClient
      .from("tasks")
      .insert({ wedding_id: w.weddingId, title: "Eliminato", due_date: plus(0) })
      .select("id")
      .single();
    await w.founderClient
      .from("tasks")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", gone.data!.id);

    const response = await run();
    expect(response.status).toBe(200);
    const toA = await waitFor(w.founder.email, 1);
    const toB = await waitFor(b.user.email, 1);
    expect(toA).toHaveLength(1);
    expect(toB).toHaveLength(1);

    const mailA = await getMessage(toA[0]!.ID);
    for (const text of [mailA.Text, mailA.HTML]) {
      // D38: a due date set TODAY for a day inside the 7-day window gets no "tra 7 giorni" mail
      expect(text).not.toContain("Prenotare la sala prove");
      expect(text).toContain("Ritirare le bomboniere");
      expect(text).toContain("Oggi");
      expect(text).not.toContain("Senza promemoria");
      expect(text).not.toContain("Gia fatto");
      expect(text).not.toContain("Eliminato");
      expect(text).not.toContain("Solo per lei"); // assigned to B only
    }
    const mailB = await getMessage(toB[0]!.ID);
    expect(mailB.Text).toContain("Solo per lei");
    expect(mailB.Text).toContain("Ritirare le bomboniere");
    expect(mailB.Text).not.toContain("Prenotare la sala prove");

    // the unsubscribe link and the RFC 8058 one-click headers
    expect(extractLinks(mailA).some((l) => l.includes("/email/disattiva"))).toBe(true);
    const headers = (await (
      await fetch(`${APP_MAILPIT_URL}/api/v1/message/${toA[0]!.ID}/headers`)
    ).json()) as Record<string, string[]>;
    const names = Object.keys(headers).map((h) => h.toLowerCase());
    expect(names).toContain("list-unsubscribe");
    expect(names).toContain("list-unsubscribe-post");

    // a second run, and two overlapping runs, deliver nothing more
    await run();
    await Promise.all([run(), run()]);
    await settle();
    expect(await remindersTo(w.founder.email)).toHaveLength(1);
    expect(await remindersTo(b.user.email)).toHaveLength(1);
    // the weekly digest (Mon-Wed) is also sent at most once per person, whatever the run count
    expect((await listMessagesTo(w.founder.email)).length - 1).toBeLessThanOrEqual(1);
  });

  it("a partner who has not entered yet gets nothing: the shared tasks go to A only", async () => {
    const w = await createWedding();
    const pendingEmail = `pending.${Math.random().toString(16).slice(2, 10)}@example.test`;
    const pending = await createUser({ email: pendingEmail });
    expect(
      (await w.founderClient.rpc("upsert_partner_b", { p_email: pending.email })).error,
    ).toBeNull();
    expect(
      (
        await w.founderClient.rpc("create_invitation", {
          p_email: pending.email,
          p_method: "code",
          p_invitee_user_id: pending.id,
        })
      ).error,
    ).toBeNull();
    await task(w, "Compito condiviso", plus(0));

    expect((await run()).status).toBe(200);
    const toA = await waitFor(w.founder.email, 1);
    expect(toA).toHaveLength(1);
    await settle();
    expect(await listMessagesTo(pending.email)).toHaveLength(0);
  });

  it("over the daily cap a mail is skipped, recorded and flagged, never silently dropped (AC53)", async () => {
    vi.stubEnv("EMAIL_DAILY_CAP", "0");
    const w = await createWedding();
    await task(w, "Oltre il limite", plus(0));
    const response = await run();
    const body = (await response.json()) as Record<string, unknown>;
    expect(JSON.stringify(body)).toMatch(/quota/i);
    expect(await listMessagesTo(w.founder.email)).toHaveLength(0);
    const log = await serviceClient()
      .from("notification_log")
      .select("status")
      .eq("user_id", w.founder.id);
    expect(log.data?.some((row) => row.status === "skipped_quota")).toBe(true);
  });
});
