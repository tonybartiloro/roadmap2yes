import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { EmailMessage, EmailSender, EmailSendResult } from "@/lib/email";
import { addDays, todayInRome, type PlainDate } from "@/lib/dates/plain-date";
import { isoWeekday } from "@/domain/reminders";
import { runDailyJob } from "@/features/jobs/run-daily-job";
import { createSupabaseJobDb } from "@/features/jobs/supabase-job-db";
import type { JobDb } from "@/features/jobs/types";
import {
  addPartnerB,
  createUser,
  createWedding,
  serviceClient,
  signInAs,
  type TestWedding,
} from "../support/supabase";

/**
 * T16: the daily job against the REAL local database (ledger functions, RLS-free service key,
 * audit log) with a fake email sender. Every test runs on a random day in 2040-2094 so ledger rows,
 * caps (counted per UTC day) and batch keys never collide with other tests or earlier runs; the
 * job is scoped to the weddings of the test (`scopedDb`) so leftovers cannot add noise.
 */

const SITE = "https://app.example.test";
const service = serviceClient();
const BIG_CAPS = { daily: 100_000, monthly: 100_000 };

/** A random day with an ISO weekday in `weekdays`, at 10:00 UTC (same Rome date). */
function freshDay(weekdays: readonly number[]): { today: PlainDate; now: Date } {
  for (;;) {
    const today = addDays("2040-01-01", Math.floor(Math.random() * 19_000));
    if (weekdays.includes(isoWeekday(today))) return { today, now: new Date(`${today}T10:00:00Z`) };
  }
}
// Thu-Sat: no digest that day, nor on the next one (Fri-Sun), so "next day" runs stay reminder-only.
const REMINDER_DAYS = [4, 5, 6];

class CaptureSender implements EmailSender {
  readonly transport = "smtp" as const;
  /** Every call, including the failed ones. */
  attempts: EmailMessage[] = [];
  /** Only the calls that succeeded. */
  sent: EmailMessage[] = [];
  outcomes: EmailSendResult[] = [];
  async send(message: EmailMessage): Promise<EmailSendResult> {
    this.attempts.push(message);
    const outcome = this.outcomes.shift() ?? { ok: true as const };
    if (outcome.ok) this.sent.push(message);
    return outcome;
  }
  to(email: string): EmailMessage[] {
    return this.sent.filter((m) => m.to === email);
  }
}

function scopedDb(weddingIds: string[], overrides: Partial<JobDb> = {}): JobDb {
  const base = createSupabaseJobDb(service);
  const ids = new Set(weddingIds);
  return {
    ...base,
    recipients: async () => (await base.recipients()).filter((r) => ids.has(r.weddingId)),
    ...overrides,
  };
}

function job(
  now: Date,
  sender: EmailSender,
  db: JobDb,
  extra: { caps?: { daily: number; monthly: number }; emailEnabled?: boolean } = {},
) {
  return runDailyJob({
    clock: { now: () => now },
    sender,
    db,
    caps: extra.caps ?? BIG_CAPS,
    emailEnabled: extra.emailEnabled ?? true,
    siteUrl: SITE,
  });
}

async function addTask(
  weddingId: string,
  title: string,
  due: PlainDate | null,
  extra: { assignee?: "both" | "A" | "B"; reminders?: boolean } = {},
): Promise<string> {
  const { data, error } = await service
    .from("tasks")
    .insert({
      wedding_id: weddingId,
      title,
      due_date: due,
      assignee: extra.assignee ?? "both",
      reminders_enabled: extra.reminders ?? true,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`addTask failed: ${error?.message}`);
  return data.id;
}

async function ledger(userIds: string[]) {
  const { data, error } = await service
    .from("notification_log")
    .select("user_id, kind, batch_key, status, attempts, item_keys")
    .in("user_id", userIds);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * `memberships.created_at` is immutable, and the test clock lives in 2040+: this pretends the
 * partner joined on `day` (the real value is checked separately against the real membership date).
 */
function joinedOn(weddingIds: string[], userId: string, day: PlainDate): JobDb {
  const base = scopedDb(weddingIds);
  return {
    ...base,
    recipients: async () =>
      (await base.recipients()).map((r) => (r.userId === userId ? { ...r, joinedOn: day } : r)),
  };
}

beforeAll(() => {
  vi.stubEnv("EMAIL_LINK_SECRET", "integration-test-link-secret-0123456789");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterAll(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("daily job: reminders against the real ledger (AC50, AC53)", () => {
  it("sends one grouped email per user, by assignee, and records it as sent", async () => {
    const w = await createWedding();
    const b = await addPartnerB(w);
    const { today, now } = freshDay(REMINDER_DAYS);
    await addTask(w.weddingId, "Per entrambi", addDays(today, 3));
    await addTask(w.weddingId, "Solo A", addDays(today, 3), { assignee: "A" });
    await addTask(w.weddingId, "Solo B", addDays(today, 3), { assignee: "B" });
    await addTask(w.weddingId, "Scade oggi", today);
    await addTask(w.weddingId, "Troppo lontano", addDays(today, 8));
    await addTask(w.weddingId, "Spento", addDays(today, 3), { reminders: false });

    const sender = new CaptureSender();
    const summary = await job(now, sender, scopedDb([w.weddingId]));

    expect(summary.ok).toBe(true);
    expect(summary.reminders.sent).toBe(2);
    const toA = sender.to(w.founder.email);
    const toB = sender.to(b.user.email);
    expect(toA).toHaveLength(1);
    expect(toB).toHaveLength(1);
    expect(toA[0]?.html).toContain("Per entrambi");
    expect(toA[0]?.html).toContain("Solo A");
    expect(toA[0]?.html).toContain("Scade oggi");
    expect(toA[0]?.html).not.toContain("Solo B");
    expect(toB[0]?.html).toContain("Solo B");
    expect(toB[0]?.html).not.toContain("Solo A");
    for (const html of [toA[0]!.html, toB[0]!.html]) {
      expect(html).not.toContain("Troppo lontano");
      expect(html).not.toContain("Spento");
    }
    expect(toA[0]?.idempotencyKey).toBe(`reminder:${w.founder.id}:${today}`);

    const rows = await ledger([w.founder.id, b.user.id]);
    expect(rows).toHaveLength(2);
    expect(
      rows.every((r) => r.status === "sent" && r.kind === "reminder" && r.attempts === 1),
    ).toBe(true);
  });

  it("two runs on the same day send once; two OVERLAPPING runs send once", async () => {
    const w = await createWedding();
    const b = await addPartnerB(w);
    const { today, now } = freshDay(REMINDER_DAYS);
    await addTask(w.weddingId, "Una volta sola", addDays(today, 2));
    expect(b.user.email).toBeTruthy();
    const db = scopedDb([w.weddingId]);

    const sender = new CaptureSender();
    await job(now, sender, db);
    await job(new Date(now.getTime() + 3_600_000), sender, db);
    expect(sender.sent).toHaveLength(2);

    // a different day with the same window: still nothing new for the same items
    const overlap = freshDay(REMINDER_DAYS);
    await addTask(w.weddingId, "Per la corsa", addDays(overlap.today, 2));
    const s1 = new CaptureSender();
    const s2 = new CaptureSender();
    await Promise.all([job(overlap.now, s1, db), job(overlap.now, s2, db)]);
    const total = [...s1.sent, ...s2.sent].filter((m) => m.html.includes("Per la corsa"));
    expect(total.map((m) => m.to).sort()).toEqual([b.user.email, w.founder.email].sort());
  });

  it("does not send the 7-day reminder again the next day", async () => {
    const w = await createWedding();
    const { today, now } = freshDay([4, 5, 6]);
    await addTask(w.weddingId, "Tra qualche giorno", addDays(today, 5));
    const db = scopedDb([w.weddingId]);
    const sender = new CaptureSender();
    await job(now, sender, db);
    await job(new Date(now.getTime() + 86_400_000), sender, db);
    expect(sender.sent).toHaveLength(1);
  });

  it("never reminds when emails are off: no claim, heartbeat yes; switching on replays nothing", async () => {
    const w = await createWedding();
    const { today, now } = freshDay(REMINDER_DAYS);
    await addTask(w.weddingId, "Ieri", addDays(today, -1));
    await addTask(w.weddingId, "Oggi", today);
    const db = scopedDb([w.weddingId]);
    const sender = new CaptureSender();

    const before = await service.from("heartbeats").select("id").eq("source", "daily_job");
    const off = await job(now, sender, db, { emailEnabled: false });
    expect(off.emailEnabled).toBe(false);
    expect(sender.attempts).toHaveLength(0);
    expect(await ledger([w.founder.id])).toHaveLength(0);
    const after = await service
      .from("heartbeats")
      .select("details, ran_at")
      .eq("source", "daily_job")
      .order("ran_at", { ascending: false })
      .limit(1);
    expect(after.data?.[0]?.details).toMatchObject({ ok: true, email_enabled: false });
    expect(
      (await service.from("heartbeats").select("id").eq("source", "daily_job")).data?.length,
    ).toBe((before.data?.length ?? 0) + 1);

    // emails on the next day: only what the window includes that day, nothing from the past
    await job(new Date(now.getTime() + 86_400_000), sender, db);
    expect(sender.sent).toHaveLength(0);
  });

  it("respects the per-user opt-out: no claim at all (AC52)", async () => {
    const w = await createWedding();
    const b = await addPartnerB(w);
    const { today, now } = freshDay(REMINDER_DAYS);
    await addTask(w.weddingId, "Per due", addDays(today, 2));
    const { error } = await service
      .from("notification_preferences")
      .insert({ user_id: b.user.id, wedding_id: w.weddingId, reminders_enabled: false });
    expect(error).toBeNull();

    const sender = new CaptureSender();
    await job(now, sender, scopedDb([w.weddingId]));
    expect(sender.to(w.founder.email)).toHaveLength(1);
    expect(sender.to(b.user.email)).toHaveLength(0);
    expect(await ledger([b.user.id])).toHaveLength(0);
  });

  it("a partner who never logged in gets nothing; after the first login no catch-up (D44)", async () => {
    const w = await createWedding();
    const bUser = await createUser();
    const invited = await w.founderClient.rpc("upsert_partner_b", { p_email: bUser.email });
    expect(invited.error).toBeNull();
    const invitation = await w.founderClient.rpc("create_invitation", {
      p_email: bUser.email,
      p_method: "code",
      p_invitee_user_id: bUser.id,
    });
    expect(invitation.error).toBeNull();

    const { today, now } = freshDay(REMINDER_DAYS);
    await addTask(w.weddingId, "Condiviso", addDays(today, 3));
    await addTask(w.weddingId, "Di B", addDays(today, 3), { assignee: "B" });

    const sender = new CaptureSender();
    await job(now, sender, scopedDb([w.weddingId]));
    expect(sender.to(bUser.email)).toHaveLength(0);
    expect(sender.to(w.founder.email)).toHaveLength(1);
    expect(sender.to(w.founder.email)[0]?.html).toContain("Condiviso");
    expect(sender.to(w.founder.email)[0]?.html).not.toContain("Di B");
    expect(await ledger([bUser.id])).toHaveLength(0);

    // B logs in; the membership dates from the day after the window opened for these tasks
    const client = await signInAs(bUser);
    const accepted = await client.rpc("accept_pending_invitation");
    expect(accepted.data).toBe("ok");
    const next = addDays(today, 1);
    const recipients = await scopedDb([w.weddingId]).recipients();
    expect(recipients.find((r) => r.userId === bUser.id)?.joinedOn).toBe(todayInRome(new Date()));
    await addTask(w.weddingId, "Scade presto", addDays(next, 0), { assignee: "B" });
    const later = new CaptureSender();
    await job(new Date(`${next}T10:00:00Z`), later, joinedOn([w.weddingId], bUser.id, next));
    const toB = later.to(bUser.email);
    expect(toB).toHaveLength(1);
    expect(toB[0]?.html).toContain("Scade presto"); // due today: always
    expect(toB[0]?.html).not.toContain("Di B"); // its 7-day window opened before B joined
  });

  it("40 tasks moved into the window still make one email per user", async () => {
    const w = await createWedding();
    const { today, now } = freshDay(REMINDER_DAYS);
    const { error } = await service.from("tasks").insert(
      Array.from({ length: 40 }, (_, i) => ({
        wedding_id: w.weddingId,
        title: `Spostato ${i}`,
        due_date: addDays(today, 4),
      })),
    );
    expect(error).toBeNull();
    const sender = new CaptureSender();
    await job(now, sender, scopedDb([w.weddingId]));
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]?.html).toContain("e altri 35");
  });

  it("no 7-day reminder for a date set or changed inside the window (D38)", async () => {
    const w = await createWedding();
    const today = todayInRome(new Date());
    const now = new Date();
    // inserted today with a date 3 days away: the window opened before the date existed
    await addTask(w.weddingId, "Impostata dentro", addDays(today, 3));
    // created far away, then moved inside the window
    const moved = await addTask(w.weddingId, "Spostata dentro", addDays(today, 40));
    const upd = await service
      .from("tasks")
      .update({ due_date: addDays(today, 2) })
      .eq("id", moved);
    expect(upd.error).toBeNull();
    const sender = new CaptureSender();
    await job(now, sender, scopedDb([w.weddingId]));
    const reminders = sender.sent.filter((m) => m.idempotencyKey?.startsWith("reminder:"));
    expect(reminders).toHaveLength(0);
  });
});

describe("daily job: failures and resume (AC53)", () => {
  async function singleUser(): Promise<{ w: TestWedding; today: PlainDate; now: Date }> {
    const w = await createWedding();
    const { today, now } = freshDay(REMINDER_DAYS);
    await addTask(w.weddingId, "Da ricordare", addDays(today, 2));
    return { w, today, now };
  }

  it("a failed send is resumed with the SAME batch key and ends as sent, once", async () => {
    const { w, today, now } = await singleUser();
    const db = scopedDb([w.weddingId]);
    const sender = new CaptureSender();
    sender.outcomes = [{ ok: false, error: "provider_5xx", retryable: true }];

    const first = await job(now, sender, db);
    expect(first.ok).toBe(false);
    expect((await ledger([w.founder.id]))[0]).toMatchObject({ status: "failed", attempts: 1 });

    const second = await job(new Date(now.getTime() + 600_000), sender, db);
    expect(second.ok).toBe(true);
    expect(sender.attempts.map((m) => m.idempotencyKey)).toEqual([
      `reminder:${w.founder.id}:${today}`,
      `reminder:${w.founder.id}:${today}`,
    ]);
    expect(sender.sent).toHaveLength(1);
    expect((await ledger([w.founder.id]))[0]).toMatchObject({ status: "sent", attempts: 2 });
  });

  it("an error after the send and before 'sent' resumes after the claim expires, with the same key", async () => {
    const { w, today, now } = await singleUser();
    const crashing = scopedDb([w.weddingId], {
      markSent: async () => {
        throw new Error("connection lost");
      },
    });
    const sender = new CaptureSender();
    const first = await job(now, sender, crashing);
    expect(first.ok).toBe(false);
    expect((await ledger([w.founder.id]))[0]).toMatchObject({ status: "claimed" });

    // inside the 15 minutes nobody resumes it
    const early = await job(new Date(now.getTime() + 5 * 60_000), sender, scopedDb([w.weddingId]));
    expect(early.reminders.skippedOther).toBe(1);
    expect(sender.attempts).toHaveLength(1);

    await job(new Date(now.getTime() + 20 * 60_000), sender, scopedDb([w.weddingId]));
    expect(sender.attempts.map((m) => m.idempotencyKey)).toEqual([
      `reminder:${w.founder.id}:${today}`,
      `reminder:${w.founder.id}:${today}`,
    ]);
    expect((await ledger([w.founder.id]))[0]).toMatchObject({ status: "sent", attempts: 2 });
  });

  it("an error before the claim (no unsubscribe secret) claims nothing and fails the run", async () => {
    const { w, now } = await singleUser();
    vi.stubEnv("EMAIL_LINK_SECRET", "");
    try {
      const sender = new CaptureSender();
      const summary = await job(now, sender, scopedDb([w.weddingId]));
      expect(summary.ok).toBe(false);
      expect(summary.errors).toBe(1);
      expect(sender.attempts).toHaveLength(0);
      expect(await ledger([w.founder.id])).toHaveLength(0);
    } finally {
      vi.stubEnv("EMAIL_LINK_SECRET", "integration-test-link-secret-0123456789");
    }
  });
});

describe("daily job: caps and quota flag (AC53)", () => {
  it("over the daily cap: skipped_quota row, flag in summary and heartbeat; next day it is sent", async () => {
    const w1 = await createWedding();
    const w2 = await createWedding();
    const { today, now } = freshDay(REMINDER_DAYS);
    await addTask(w1.weddingId, "Primo", addDays(today, 3));
    await addTask(w2.weddingId, "Secondo", addDays(today, 3));
    const db = scopedDb([w1.weddingId, w2.weddingId]);
    // Earlier runs may already have rows on this UTC day: the cap leaves room for exactly one more.
    const quota = await createSupabaseJobDb(service).quotaStatus(now);
    const caps = { daily: quota.sentToday + 1, monthly: 100_000 };

    const sender = new CaptureSender();
    const summary = await job(now, sender, db, { caps });
    expect(summary.reminders).toMatchObject({ sent: 1, skippedQuota: 1 });
    expect(summary.overQuota).toBe(true);
    expect(sender.sent).toHaveLength(1);

    const rows = await ledger([w1.founder.id, w2.founder.id]);
    expect(rows.map((r) => r.status).sort()).toEqual(["sent", "skipped_quota"]);
    const heartbeat = await service
      .from("heartbeats")
      .select("details")
      .eq("source", "daily_job")
      .order("ran_at", { ascending: false })
      .limit(1);
    expect(heartbeat.data?.[0]?.details).toMatchObject({ over_quota: true });

    const next = await job(new Date(now.getTime() + 86_400_000), sender, db, { caps });
    expect(next.reminders.sent).toBe(1);
    expect(sender.sent.map((m) => m.to).sort()).toEqual(
      [w1.founder.email, w2.founder.email].sort(),
    );
  });
});

describe("daily job: Monday digest (AC51, D41)", () => {
  it("is sent once per ISO week from Monday to Wednesday, with catch-up, and not from Thursday", async () => {
    const w = await createWedding();
    const monday = freshDay([1]);
    await addTask(w.weddingId, "In ritardo", addDays(monday.today, -5));
    const db = scopedDb([w.weddingId]);

    const sender = new CaptureSender();
    const digests = () => sender.sent.filter((m) => m.idempotencyKey?.startsWith("digest:"));

    await job(monday.now, sender, db);
    expect(digests()).toHaveLength(1);
    expect(digests()[0]?.html).toContain("da recuperare");
    expect(digests()[0]?.headers?.["List-Unsubscribe"]).toContain("tipo=digest");

    await job(new Date(monday.now.getTime() + 86_400_000), sender, db); // Tuesday
    await job(new Date(monday.now.getTime() + 2 * 86_400_000), sender, db); // Wednesday
    expect(digests()).toHaveLength(1);

    await job(new Date(monday.now.getTime() + 3 * 86_400_000), sender, db); // Thursday
    expect(digests()).toHaveLength(1);

    await job(new Date(monday.now.getTime() + 7 * 86_400_000), sender, db); // next Monday
    expect(digests()).toHaveLength(2);
  });

  it("catches up on Wednesday when Monday never ran, and stays silent when there is nothing", async () => {
    const w = await createWedding();
    const wednesday = freshDay([3]);
    await addTask(w.weddingId, "Da recuperare", addDays(wednesday.today, -3));
    const empty = await createWedding();
    const sender = new CaptureSender();
    await job(wednesday.now, sender, scopedDb([w.weddingId, empty.weddingId]));
    expect(sender.to(w.founder.email)).toHaveLength(1);
    expect(sender.to(empty.founder.email)).toHaveLength(0);
    expect(await ledger([empty.founder.id])).toHaveLength(0);
  });

  it("respects the digest switch", async () => {
    const w = await createWedding();
    const monday = freshDay([1]);
    await addTask(w.weddingId, "In ritardo", addDays(monday.today, -5));
    const { error } = await service
      .from("notification_preferences")
      .insert({ user_id: w.founder.id, wedding_id: w.weddingId, digest_enabled: false });
    expect(error).toBeNull();
    const sender = new CaptureSender();
    await job(monday.now, sender, scopedDb([w.weddingId]));
    expect(sender.attempts).toHaveLength(0);
  });
});
