import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailMessage, EmailSender, EmailSendResult } from "@/lib/email";
import type { PlanTask } from "@/domain/reminders";
import { heartbeatDetails, runDailyJob } from "./run-daily-job";
import type {
  ClaimRequest,
  ClaimResult,
  JobDb,
  JobRecipient,
  QuotaStatus,
  WeddingJobData,
} from "./types";

const SECRET = "unit-test-link-secret-0123456789abcdef";
const SITE = "https://app.example.test";
const WEDDING = "w1";
const MIN = 60_000;

const at = (iso: string) => ({ now: () => new Date(iso) });
const WED = "2027-03-10T10:00:00Z"; // Wednesday: digest catch-up day
const THU = "2027-03-11T10:00:00Z"; // Thursday: reminders only
const MON = "2027-03-08T05:00:00Z"; // Monday

function recipient(slot: "A" | "B", extra: Partial<JobRecipient> = {}): JobRecipient {
  return {
    weddingId: WEDDING,
    userId: `user-${slot}`,
    slot,
    email: `${slot.toLowerCase()}@example.test`,
    firstName: slot === "A" ? "Anna" : "Bruno",
    label: null,
    remindersEnabled: true,
    digestEnabled: true,
    ...extra,
  };
}

function task(id: string, dueDate: string, extra: Partial<PlanTask> = {}): PlanTask {
  return {
    id,
    title: `Compito ${id}`,
    dueDate,
    status: "todo",
    assignee: "both",
    remindersEnabled: true,
    deletedAt: null,
    ...extra,
  };
}

interface LogRow {
  id: number;
  userId: string;
  kind: string;
  batchKey: string;
  status: "claimed" | "sent" | "failed" | "skipped_quota";
  itemKeys: string[];
  claimedAt: Date | null;
  attempts: number;
}

/** In-memory twin of the ledger functions (same status machine as `job_claim_notification`). */
class FakeDb implements JobDb {
  rows: LogRow[] = [];
  claimCalls: ClaimRequest[] = [];
  heartbeats: Record<string, unknown>[] = [];
  synced = 0;
  failSync = false;
  failMarkSent = false;
  private seq = 0;

  constructor(
    public members: JobRecipient[],
    public data: Partial<WeddingJobData> = {},
  ) {}

  async syncTimeline() {
    if (this.failSync) throw new Error("boom");
    this.synced += 1;
    return 1;
  }
  async recordHeartbeat(details: Record<string, unknown>) {
    this.heartbeats.push(details);
  }
  async recipients() {
    return this.members;
  }
  async loadWeddingData(): Promise<WeddingJobData> {
    return {
      tasks: [],
      payments: [],
      dateDecided: true,
      dueChangedOn: new Map(),
      people: this.members.map((m) => ({
        userId: m.userId,
        firstName: m.firstName,
        label: m.label,
      })),
      audit: [],
      decisionEvents: [],
      ...this.data,
    };
  }
  async doneItemKeys(userId: string, except: string, since: Date) {
    return this.rows
      .filter(
        (r) =>
          r.userId === userId &&
          r.kind === "reminder" &&
          (r.status === "claimed" || r.status === "sent") &&
          r.batchKey !== except &&
          r.claimedAt !== null &&
          r.claimedAt >= since,
      )
      .flatMap((r) => r.itemKeys);
  }
  async claim(req: ClaimRequest): Promise<ClaimResult> {
    this.claimCalls.push(req);
    const member = this.members.find((m) => m.userId === req.userId)!;
    const enabled = req.kind === "reminder" ? member.remindersEnabled : member.digestEnabled;
    if (!enabled) return { status: "opted_out" };
    const existing = this.rows.find((r) => r.batchKey === req.batchKey);
    let previous: string | undefined;
    if (existing) {
      if (existing.status === "sent") return { status: "already_sent", id: existing.id };
      if (
        existing.status === "claimed" &&
        existing.claimedAt!.getTime() > req.now.getTime() - 15 * MIN
      ) {
        return { status: "in_progress", id: existing.id };
      }
      if (
        (existing.status === "claimed" || existing.status === "failed") &&
        existing.attempts >= 5
      ) {
        existing.status = "failed";
        return { status: "failed_final", id: existing.id };
      }
      previous = existing.status;
    }
    const day = req.now.toISOString().slice(0, 10);
    const counted = this.rows.filter(
      (r) =>
        r !== existing &&
        (r.status === "claimed" || r.status === "sent") &&
        r.claimedAt!.toISOString().slice(0, 10) === day,
    ).length;
    if (counted >= req.dailyCap) {
      if (!existing) {
        this.rows.push({
          id: ++this.seq,
          userId: req.userId,
          kind: req.kind,
          batchKey: req.batchKey,
          status: "skipped_quota",
          itemKeys: [...req.itemKeys],
          claimedAt: null,
          attempts: 0,
        });
      }
      return { status: "skipped_quota", reason: "daily" };
    }
    if (existing) {
      existing.status = "claimed";
      existing.attempts += 1;
      existing.claimedAt = req.now;
      return {
        status: previous === "claimed" || previous === "failed" ? "resumed" : "claimed",
        id: existing.id,
      };
    }
    const row: LogRow = {
      id: ++this.seq,
      userId: req.userId,
      kind: req.kind,
      batchKey: req.batchKey,
      status: "claimed",
      itemKeys: [...req.itemKeys],
      claimedAt: req.now,
      attempts: 1,
    };
    this.rows.push(row);
    return { status: "claimed", id: row.id };
  }
  async markSent(id: number) {
    if (this.failMarkSent) throw new Error("db down");
    this.rows.find((r) => r.id === id)!.status = "sent";
  }
  async fail(id: number) {
    const row = this.rows.find((r) => r.id === id)!;
    if (row.status === "claimed") row.status = "failed";
  }
  async quotaStatus(now: Date): Promise<QuotaStatus> {
    const day = now.toISOString().slice(0, 10);
    const sent = this.rows.filter((r) => r.status === "claimed" || r.status === "sent").length;
    const skipped = this.rows.filter((r) => r.status === "skipped_quota").length;
    void day;
    return { sentToday: sent, sentMonth: sent, skippedToday: skipped, skippedMonth: skipped };
  }
}

class FakeSender implements EmailSender {
  readonly transport = "smtp" as const;
  sent: EmailMessage[] = [];
  attempts: EmailMessage[] = [];
  outcomes: EmailSendResult[] = [];
  async send(message: EmailMessage): Promise<EmailSendResult> {
    this.attempts.push(message);
    const outcome = this.outcomes.shift() ?? { ok: true as const };
    if (outcome.ok) this.sent.push(message);
    return outcome;
  }
}

const caps = { daily: 50, monthly: 1500 };
const run = (db: FakeDb, sender: FakeSender, clock = at(THU), overrides = {}) =>
  runDailyJob({ clock, sender, db, caps, emailEnabled: true, siteUrl: SITE, ...overrides });

beforeEach(() => {
  vi.stubEnv("EMAIL_LINK_SECRET", SECRET);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// THU is 2027-03-11: t1 is due in 2 days, t2 today.
const dueSoon = [task("t1", "2027-03-13"), task("t2", "2027-03-11")];

describe("runDailyJob: emails off (AC44, AC59)", () => {
  it("records the heartbeat and syncs the timeline, but never claims nor sends", async () => {
    const db = new FakeDb([recipient("A")], { tasks: dueSoon });
    const sender = new FakeSender();
    const summary = await run(db, sender, at(WED), { emailEnabled: false });
    expect(db.synced).toBe(1);
    expect(db.claimCalls).toHaveLength(0);
    expect(db.rows).toHaveLength(0);
    expect(sender.attempts).toHaveLength(0);
    expect(db.heartbeats).toHaveLength(1);
    expect(db.heartbeats[0]).toMatchObject({ ok: true, email_enabled: false });
    expect(summary.ok).toBe(true);
  });

  it("a sender with transport 'none' counts as off even if the flag says on", async () => {
    const db = new FakeDb([recipient("A")], { tasks: dueSoon });
    const sender = { transport: "none", send: vi.fn() } as unknown as EmailSender;
    await runDailyJob({ clock: at(WED), sender, db, caps, emailEnabled: true, siteUrl: SITE });
    expect(db.claimCalls).toHaveLength(0);
    expect(sender.send).not.toHaveBeenCalled();
  });

  it("switching emails on does not replay the past: only today's window is planned", async () => {
    const db = new FakeDb([recipient("A")], {
      tasks: [task("old", "2027-03-01"), task("now", "2027-03-13")],
    });
    const sender = new FakeSender();
    await run(db, sender, at(WED), { emailEnabled: false });
    await run(db, sender, at(THU));
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]?.subject).toContain("Compito now");
  });
});

describe("runDailyJob: reminders (AC50)", () => {
  it("sends ONE grouped email per user per day with unsubscribe headers", async () => {
    const db = new FakeDb([recipient("A"), recipient("B")], { tasks: dueSoon });
    const sender = new FakeSender();
    const summary = await run(db, sender);
    expect(summary.reminders.sent).toBe(2);
    expect(sender.sent.map((m) => m.to).sort()).toEqual(["a@example.test", "b@example.test"]);
    const first = sender.sent[0]!;
    expect(first.headers?.["List-Unsubscribe"]).toContain(
      `${SITE}/email/disattiva?tipo=reminders&t=`,
    );
    expect(first.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(first.idempotencyKey).toBe("reminder:user-A:2027-03-11");
    expect(first.html).toContain("Compito t1");
    expect(first.html).toContain("Compito t2");
  });

  it("does not send to a user whose reminders are off, and never claims for them", async () => {
    const db = new FakeDb([recipient("A", { remindersEnabled: false })], { tasks: dueSoon });
    const sender = new FakeSender();
    await run(db, sender);
    expect(db.claimCalls).toHaveLength(0);
    expect(sender.attempts).toHaveLength(0);
  });

  it("only the shared task reaches A when B has no membership (D44)", async () => {
    const db = new FakeDb([recipient("A")], {
      tasks: [task("shared", "2027-03-13"), task("forB", "2027-03-13", { assignee: "B" })],
    });
    const sender = new FakeSender();
    await run(db, sender);
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]?.html).toContain("Compito shared");
    expect(sender.sent[0]?.html).not.toContain("Compito forB");
  });
});

describe("runDailyJob: idempotency (AC53)", () => {
  it("two runs on the same day send once", async () => {
    const db = new FakeDb([recipient("A")], { tasks: dueSoon });
    const sender = new FakeSender();
    await run(db, sender);
    const second = await run(db, sender, at("2027-03-11T15:00:00Z"));
    expect(sender.sent).toHaveLength(1);
    expect(second.reminders.sent).toBe(0);
  });

  it("two overlapping runs send once", async () => {
    const db = new FakeDb([recipient("A"), recipient("B")], { tasks: dueSoon });
    const sender = new FakeSender();
    await Promise.all([run(db, sender), run(db, sender)]);
    expect(sender.sent).toHaveLength(2);
  });

  it("the 7-day reminder of the next day does not repeat what was already sent", async () => {
    const db = new FakeDb([recipient("A")], { tasks: [task("t", "2027-03-15")] });
    const sender = new FakeSender();
    await run(db, sender, at(THU));
    await run(db, sender, at("2027-03-12T10:00:00Z"));
    expect(sender.sent).toHaveLength(1);
  });

  it("a failed send is resumed the same day with the SAME batch key and sent once", async () => {
    const db = new FakeDb([recipient("A")], { tasks: dueSoon });
    const sender = new FakeSender();
    sender.outcomes = [{ ok: false, error: "provider_5xx", retryable: true }];
    const first = await run(db, sender);
    expect(first.ok).toBe(false);
    expect(first.reminders.failed).toBe(1);
    expect(db.rows[0]?.status).toBe("failed");

    const second = await run(db, sender, at("2027-03-11T11:00:00Z"));
    expect(second.ok).toBe(true);
    expect(sender.sent).toHaveLength(1);
    expect(sender.attempts.map((m) => m.idempotencyKey)).toEqual([
      "reminder:user-A:2027-03-11",
      "reminder:user-A:2027-03-11",
    ]);
  });

  it("a sender that throws is treated as a failed send", async () => {
    const db = new FakeDb([recipient("A")], { tasks: dueSoon });
    const sender = new FakeSender();
    sender.send = async () => {
      throw new Error("socket hang up");
    };
    const summary = await run(db, sender);
    expect(summary.reminders.failed).toBe(1);
    expect(db.rows[0]?.status).toBe("failed");
  });

  it("crash after the send, before 'sent': the claim expires and is resumed with the same key", async () => {
    const db = new FakeDb([recipient("A")], { tasks: dueSoon });
    const sender = new FakeSender();
    db.failMarkSent = true;
    const first = await run(db, sender);
    expect(first.ok).toBe(false);
    expect(db.rows[0]?.status).toBe("claimed");

    // within 15 minutes nobody else touches it
    db.failMarkSent = false;
    const early = await run(db, sender, at("2027-03-11T10:05:00Z"));
    expect(early.reminders.skippedOther).toBe(1);
    expect(sender.attempts).toHaveLength(1);

    // after expiry: resumed, same idempotency key (the provider drops the duplicate)
    await run(db, sender, at("2027-03-11T10:20:00Z"));
    expect(sender.attempts.map((m) => m.idempotencyKey)).toEqual([
      "reminder:user-A:2027-03-11",
      "reminder:user-A:2027-03-11",
    ]);
    expect(db.rows[0]?.status).toBe("sent");
  });

  it("an error BEFORE the claim (no link secret) claims nothing and fails the run", async () => {
    vi.stubEnv("EMAIL_LINK_SECRET", "");
    const db = new FakeDb([recipient("A")], { tasks: dueSoon });
    const sender = new FakeSender();
    const summary = await run(db, sender);
    expect(db.claimCalls).toHaveLength(0);
    expect(sender.attempts).toHaveLength(0);
    expect(summary.errors).toBe(1);
    expect(summary.ok).toBe(false);
  });

  it("one user's failure does not stop the others", async () => {
    const db = new FakeDb([recipient("A"), recipient("B")], { tasks: dueSoon });
    const sender = new FakeSender();
    sender.outcomes = [{ ok: false, error: "provider_5xx", retryable: true }];
    const summary = await run(db, sender);
    expect(summary.reminders).toMatchObject({ sent: 1, failed: 1 });
  });
});

describe("runDailyJob: caps (AC53)", () => {
  it("skips over the daily cap, flags it in the summary and the heartbeat, and retries later", async () => {
    const db = new FakeDb([recipient("A"), recipient("B")], { tasks: dueSoon });
    const sender = new FakeSender();
    const summary = await run(db, sender, at(THU), { caps: { daily: 1, monthly: 1500 } });
    expect(summary.reminders).toMatchObject({ sent: 1, skippedQuota: 1 });
    expect(summary.overQuota).toBe(true);
    expect(db.heartbeats[0]).toMatchObject({ over_quota: true });
    expect(db.rows.filter((r) => r.status === "skipped_quota")).toHaveLength(1);
    // the cap passes the DB the injected values
    expect(db.claimCalls[0]).toMatchObject({ dailyCap: 1, monthlyCap: 1500 });

    // next day the skipped user is reminded, if the window still includes the task
    const next = await run(db, sender, at("2027-03-12T10:00:00Z"), {
      caps: { daily: 1, monthly: 1500 },
    });
    expect(next.reminders.sent).toBe(1);
    expect(sender.sent.map((m) => m.to).sort()).toEqual(["a@example.test", "b@example.test"]);
  });

  it("40 tasks moved into the window still make a single email per user", async () => {
    const tasks = Array.from({ length: 40 }, (_, i) => task(`m${i}`, "2027-03-13"));
    const db = new FakeDb([recipient("A")], { tasks });
    const sender = new FakeSender();
    await run(db, sender);
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]?.html).toContain("e altri 35");
  });
});

describe("runDailyJob: Monday digest (AC51, D41)", () => {
  const overdue = [task("late", "2027-03-01")];

  it("is sent on Monday, with the digest unsubscribe header", async () => {
    const db = new FakeDb([recipient("A")], { tasks: overdue });
    const sender = new FakeSender();
    const summary = await run(db, sender, at(MON));
    expect(summary.digests.sent).toBe(1);
    const message = sender.sent[0]!;
    expect(message.subject).toBe("Il tuo riepilogo della settimana");
    expect(message.html).toContain("da recuperare");
    expect(message.headers?.["List-Unsubscribe"]).toContain("tipo=digest");
    expect(message.idempotencyKey).toBe("digest:user-A:2027-W10");
  });

  it("Monday, Tuesday and Wednesday runs deliver it only once per ISO week", async () => {
    const db = new FakeDb([recipient("A")], { tasks: overdue });
    const sender = new FakeSender();
    await run(db, sender, at(MON));
    await run(db, sender, at("2027-03-09T05:00:00Z"));
    await run(db, sender, at("2027-03-10T05:00:00Z"));
    expect(sender.sent).toHaveLength(1);
  });

  it("catches up on Tuesday or Wednesday when Monday did not run", async () => {
    const db = new FakeDb([recipient("A")], { tasks: overdue });
    const sender = new FakeSender();
    await run(db, sender, at("2027-03-10T05:00:00Z"));
    expect(sender.sent).toHaveLength(1);
  });

  it("is not sent from Thursday on", async () => {
    const db = new FakeDb([recipient("A")], { tasks: overdue });
    const sender = new FakeSender();
    await run(db, sender, at("2027-03-11T05:00:00Z"));
    expect(sender.sent).toHaveLength(0);
  });

  it("comes again the following week", async () => {
    const db = new FakeDb([recipient("A")], { tasks: overdue });
    const sender = new FakeSender();
    await run(db, sender, at(MON));
    await run(db, sender, at("2027-03-15T05:00:00Z"));
    expect(sender.sent).toHaveLength(2);
  });

  it("writes nothing and claims nothing when there is nothing to report", async () => {
    const db = new FakeDb([recipient("A")], { tasks: [] });
    const sender = new FakeSender();
    await run(db, sender, at(MON));
    expect(sender.attempts).toHaveLength(0);
    expect(db.claimCalls).toHaveLength(0);
  });

  it("respects the digest switch", async () => {
    const db = new FakeDb([recipient("A", { digestEnabled: false })], { tasks: overdue });
    const sender = new FakeSender();
    await run(db, sender, at(MON));
    expect(sender.attempts).toHaveLength(0);
  });

  it("2027-W01 and 2026-W53 are different batches", async () => {
    const db = new FakeDb([recipient("A")], { tasks: [task("late", "2026-12-01")] });
    const sender = new FakeSender();
    await run(db, sender, at("2026-12-28T05:00:00Z")); // Monday, 2026-W53
    await run(db, sender, at("2027-01-04T05:00:00Z")); // Monday, 2027-W01
    expect(sender.sent.map((m) => m.idempotencyKey)).toEqual([
      "digest:user-A:2026-W53",
      "digest:user-A:2027-W01",
    ]);
  });
});

describe("runDailyJob: heartbeat", () => {
  it("is recorded even when the timeline sync fails, and the failure is rethrown", async () => {
    const db = new FakeDb([recipient("A")]);
    db.failSync = true;
    await expect(run(db, new FakeSender())).rejects.toThrow("boom");
    expect(db.heartbeats).toHaveLength(1);
    expect(db.heartbeats[0]).toMatchObject({ ok: false, error: "Error" });
  });

  it("carries counters and quota, never addresses or names", async () => {
    const db = new FakeDb([recipient("A")], { tasks: dueSoon });
    await run(db, new FakeSender());
    const text = JSON.stringify(db.heartbeats[0]);
    expect(text).not.toContain("example.test");
    expect(text).not.toContain("Anna");
    expect(db.heartbeats[0]).toMatchObject({ ok: true, email_enabled: true, over_quota: false });
  });

  it("heartbeatDetails maps the summary", () => {
    expect(
      heartbeatDetails({
        ranAt: "x",
        today: "2027-03-10",
        emailEnabled: false,
        weddingsSynced: 3,
        reminders: { sent: 0, skippedQuota: 0, skippedOther: 0, failed: 0 },
        digests: { sent: 0, skippedQuota: 0, skippedOther: 0, failed: 0 },
        errors: 0,
        quota: null,
        overQuota: false,
        ok: true,
      }),
    ).toMatchObject({ weddings_synced: 3, email_enabled: false });
  });
});
