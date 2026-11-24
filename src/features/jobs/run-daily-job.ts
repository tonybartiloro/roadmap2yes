import { emailEnabled as readEmailEnabled } from "@/lib/email";
import type { EmailSender, RenderedEmail } from "@/lib/email";
import { buildUnsubscribeUrl } from "@/lib/email/unsubscribe-token";
import { renderDigestEmail, renderReminderEmail } from "@/lib/email/templates";
import { readSiteUrl } from "@/lib/app-config";
import { buildNews } from "@/domain/news";
import { todayInRome } from "@/lib/dates/plain-date";
import {
  digestBatchKey,
  isDigestWindow,
  planDigest,
  planReminders,
  reminderBatchKey,
  type PlanRecipient,
} from "@/domain/reminders";
import type {
  BatchCounters,
  ClaimResult,
  JobCaps,
  JobClock,
  JobDb,
  JobRecipient,
  JobSummary,
  WeddingJobData,
} from "./types";

const DAY_MS = 86_400_000;
/** Item keys of previous batches are looked up this far back (a due date is at most 7 days away). */
const DONE_KEYS_LOOKBACK_DAYS = 14;
const DIGEST_NEWS_DAYS = 7;
const MAX_NEWS_ROWS = 20;
const SELF_FALLBACK = "a te";
const PARTNER_FALLBACK = "chi organizza con te";

export interface RunDailyJobInput {
  clock: JobClock;
  sender: EmailSender;
  db: JobDb;
  caps: JobCaps;
  /** Default: `emailEnabled()` of the runtime configuration. Injectable for tests. */
  emailEnabled?: boolean;
  /** Default: `readSiteUrl()`. Injectable for tests. */
  siteUrl?: string;
}

const emptyCounters = (): BatchCounters => ({
  sent: 0,
  skippedQuota: 0,
  skippedOther: 0,
  failed: 0,
});

/** Error text for logs and the ledger: class and code only, never a message that may carry data. */
function describe(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? `${error.name}:${code}` : error.name;
  }
  return "unknown_error";
}

function personName(
  person: { firstName?: string | null; label?: string | null },
  fallback: string,
) {
  return person.firstName?.trim() || person.label?.trim() || fallback;
}

/**
 * The daily job (plan §7, AC44, AC50-AC53). Order:
 *   1. `sync_timeline` (a real database query: this is also the keep-alive);
 *   2. if emails are off: nothing else, in particular NO claim, so nothing is "consumed" and a later
 *      switch-on never replays the past (AC59);
 *   3. per wedding, per user: the reminder email (max one per day), then the Monday digest
 *      (Mon-Wed catch-up, once per ISO week);
 *   4. the heartbeat is ALWAYS recorded at the end (also after an error), with the summary and the
 *      quota counters.
 *
 * Sending never repeats: every email is claimed in the ledger under a deterministic `batch_key`
 * (also the provider idempotency key); an expired or failed claim is resumed with the same key.
 */
export async function runDailyJob(input: RunDailyJobInput): Promise<JobSummary> {
  const { clock, sender, db } = input;
  const now = clock.now();
  const today = todayInRome(now);
  const emailOn = (input.emailEnabled ?? readEmailEnabled()) && sender.transport !== "none";

  const summary: JobSummary = {
    ranAt: now.toISOString(),
    today,
    emailEnabled: emailOn,
    weddingsSynced: 0,
    reminders: emptyCounters(),
    digests: emptyCounters(),
    errors: 0,
    quota: null,
    overQuota: false,
    ok: true,
  };

  let failure: unknown;
  try {
    summary.weddingsSynced = await db.syncTimeline();
    if (emailOn) {
      const siteUrl = input.siteUrl ?? readSiteUrl();
      await sendEmails({ ...input, now, siteUrl }, summary);
      summary.quota = await db.quotaStatus(now);
    }
    const skipped = summary.reminders.skippedQuota + summary.digests.skippedQuota;
    summary.overQuota = skipped > 0 || (summary.quota?.skippedToday ?? 0) > 0;
    summary.ok =
      summary.errors === 0 && summary.reminders.failed === 0 && summary.digests.failed === 0;
  } catch (error) {
    failure = error;
    summary.ok = false;
    console.error(`[daily-job] failed: ${describe(error)}`);
  } finally {
    try {
      await db.recordHeartbeat(heartbeatDetails(summary, failure));
    } catch (error) {
      console.error(`[daily-job] heartbeat failed: ${describe(error)}`);
      if (failure === undefined) failure = error;
      summary.ok = false;
    }
  }
  if (summary.overQuota) {
    console.warn("[daily-job] email cap reached: some emails were skipped (see heartbeat)");
  }
  if (failure !== undefined) throw failure;
  return summary;
}

export function heartbeatDetails(summary: JobSummary, failure?: unknown): Record<string, unknown> {
  return {
    ok: summary.ok,
    today: summary.today,
    email_enabled: summary.emailEnabled,
    weddings_synced: summary.weddingsSynced,
    reminders: summary.reminders,
    digests: summary.digests,
    errors: summary.errors,
    over_quota: summary.overQuota,
    quota: summary.quota,
    ...(failure === undefined ? {} : { error: describe(failure) }),
  };
}

type SendContext = RunDailyJobInput & { now: Date; siteUrl: string };

async function sendEmails(ctx: SendContext, summary: JobSummary): Promise<void> {
  const recipients = await ctx.db.recipients();
  const byWedding = new Map<string, JobRecipient[]>();
  for (const r of recipients)
    byWedding.set(r.weddingId, [...(byWedding.get(r.weddingId) ?? []), r]);

  for (const [weddingId, members] of byWedding) {
    let data: WeddingJobData;
    try {
      data = await ctx.db.loadWeddingData(weddingId, ctx.now);
    } catch (error) {
      console.error(`[daily-job] loading a wedding failed: ${describe(error)}`);
      summary.errors += members.length;
      continue;
    }
    await sendReminders(ctx, summary, members, data);
    await sendDigests(ctx, summary, members, data);
  }
}

async function sendReminders(
  ctx: SendContext,
  summary: JobSummary,
  members: readonly JobRecipient[],
  data: WeddingJobData,
): Promise<void> {
  const { now, db } = ctx;
  const today = summary.today;
  const since = new Date(now.getTime() - DONE_KEYS_LOOKBACK_DAYS * DAY_MS);

  // Item keys of other batches, loaded per user (the planner must never remind twice).
  const doneKeys = new Map<string, ReadonlySet<string>>();
  const eligible = members.filter((m) => m.remindersEnabled);
  for (const m of eligible) {
    try {
      doneKeys.set(
        m.userId,
        new Set(await db.doneItemKeys(m.userId, reminderBatchKey(m.userId, today), since)),
      );
    } catch (error) {
      console.error(`[daily-job] reading the ledger failed: ${describe(error)}`);
      summary.errors += 1;
    }
  }

  const plans = planReminders({
    today,
    recipients: eligible.filter((m) => doneKeys.has(m.userId)),
    tasks: data.tasks,
    doneKeys,
    dueChangedOn: data.dueChangedOn,
    provisional: !data.dateDecided,
  });

  for (const plan of plans) {
    const member = members.find((m) => m.userId === plan.userId)!;
    const batchKey = reminderBatchKey(plan.userId, today);
    let message: RenderedEmail;
    try {
      message = renderReminderEmail({
        recipientName: personName(member, SELF_FALLBACK),
        sevenDays: plan.sevenDays,
        today: plan.today,
        appUrl: `${ctx.siteUrl}/percorso`,
        unsubscribeUrl: buildUnsubscribeUrl(
          { userId: member.userId, kind: "reminders" },
          { siteUrl: ctx.siteUrl },
        ),
      });
    } catch (error) {
      console.error(`[daily-job] preparing a reminder failed: ${describe(error)}`);
      summary.errors += 1;
      continue;
    }
    await deliver(ctx, summary.reminders, {
      member,
      kind: "reminder",
      batchKey,
      itemKeys: plan.itemKeys,
      message,
    });
  }
}

async function sendDigests(
  ctx: SendContext,
  summary: JobSummary,
  members: readonly JobRecipient[],
  data: WeddingJobData,
): Promise<void> {
  const today = summary.today;
  if (!isDigestWindow(today)) return;
  const since = new Date(ctx.now.getTime() - DIGEST_NEWS_DAYS * DAY_MS).toISOString();

  for (const member of members) {
    if (!member.digestEnabled) continue;
    let message: RenderedEmail | null;
    try {
      const partner = data.people.find((p) => p.userId !== member.userId);
      const news = buildNews({
        viewerId: member.userId,
        since,
        audit: data.audit,
        decisionEvents: data.decisionEvents,
        people: data.people,
        limit: MAX_NEWS_ROWS,
      }).map((n) => n.text);
      const plan = planDigest({
        today,
        recipient: member satisfies PlanRecipient,
        tasks: data.tasks,
        payments: data.payments,
        news,
        provisional: !data.dateDecided,
      });
      message = plan
        ? renderDigestEmail({
            recipientName: personName(member, SELF_FALLBACK),
            partnerName: partner ? personName(partner, PARTNER_FALLBACK) : PARTNER_FALLBACK,
            todo: plan.todo,
            payments: plan.payments,
            news: plan.news,
            appUrl: ctx.siteUrl,
            preferencesUrl: `${ctx.siteUrl}/altro/promemoria`,
            unsubscribeUrl: buildUnsubscribeUrl(
              { userId: member.userId, kind: "digest" },
              { siteUrl: ctx.siteUrl },
            ),
          })
        : null;
    } catch (error) {
      console.error(`[daily-job] preparing a digest failed: ${describe(error)}`);
      summary.errors += 1;
      continue;
    }
    // Nothing to report: we do not write and we do not claim (AC51).
    if (!message) continue;
    await deliver(ctx, summary.digests, {
      member,
      kind: "digest",
      batchKey: digestBatchKey(member.userId, today),
      itemKeys: [digestBatchKey(member.userId, today)],
      message,
    });
  }
}

interface Delivery {
  member: JobRecipient;
  kind: "reminder" | "digest";
  batchKey: string;
  itemKeys: readonly string[];
  message: RenderedEmail;
}

/**
 * claim -> send -> mark sent. Failure semantics (AC53):
 *   - error before the claim: nothing consumed;
 *   - the send fails: the claim is marked `failed` and the next run resumes with the same key;
 *   - the process dies between send and `sent`: the claim expires (15 min) and is resumed with the
 *     same key, which is also the provider `Idempotency-Key`.
 */
async function deliver(ctx: SendContext, counters: BatchCounters, d: Delivery): Promise<void> {
  const { db, sender, caps, now } = ctx;
  let claim: ClaimResult;
  try {
    claim = await db.claim({
      userId: d.member.userId,
      weddingId: d.member.weddingId,
      kind: d.kind,
      batchKey: d.batchKey,
      itemKeys: d.itemKeys,
      dailyCap: caps.daily,
      monthlyCap: caps.monthly,
      now,
    });
  } catch (error) {
    console.error(`[daily-job] claim failed: ${describe(error)}`);
    counters.failed += 1;
    return;
  }

  if (claim.status === "skipped_quota") {
    counters.skippedQuota += 1;
    return;
  }
  if (claim.status !== "claimed" && claim.status !== "resumed") {
    counters.skippedOther += 1;
    return;
  }
  if (claim.id === undefined) {
    counters.failed += 1;
    return;
  }

  let result: Awaited<ReturnType<EmailSender["send"]>>;
  try {
    result = await sender.send({
      to: d.member.email,
      subject: d.message.subject,
      html: d.message.html,
      text: d.message.text,
      ...(d.message.headers ? { headers: d.message.headers } : {}),
      idempotencyKey: d.batchKey,
    });
  } catch (error) {
    result = { ok: false, error: describe(error), retryable: true };
  }

  if (!result.ok) {
    counters.failed += 1;
    try {
      await db.fail(claim.id, result.error.slice(0, 100));
    } catch (error) {
      console.error(`[daily-job] marking a failure failed: ${describe(error)}`);
    }
    return;
  }

  counters.sent += 1;
  try {
    await db.markSent(claim.id, now);
  } catch (error) {
    // The email has left. The claim expires and is resumed with the same idempotency key.
    console.error(`[daily-job] marking as sent failed: ${describe(error)}`);
    counters.failed += 1;
  }
}
