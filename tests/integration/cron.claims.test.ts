import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates/plain-date";
import { createWedding, serviceClient, type TestWedding } from "../support/supabase";

/**
 * T9 review (code-7): the advisory lock inside `job_claim_notification` makes the caps EXACT under
 * concurrency, and one batch key is claimed by exactly one caller. Real parallel RPC calls against
 * the local database (`Promise.all`), on a random far-future day so no other ledger row counts.
 */

const service = serviceClient();

function freshInstant(): Date {
  const day = addDays("2040-01-01", Math.floor(Math.random() * 19_000));
  return new Date(`${day}T10:00:00Z`);
}

/** Rows already counted for the UTC day and month of `now` (earlier runs may share a month). */
async function counted(now: Date): Promise<{ day: number; month: number }> {
  const { data, error } = await service.rpc("job_quota_status", { p_now: now.toISOString() });
  if (error) throw new Error(error.message);
  const row = data as { sent_today: number; sent_month: number };
  return { day: row.sent_today, month: row.sent_month };
}

function claim(
  w: TestWedding,
  batchKey: string,
  now: Date,
  caps: { daily: number; monthly: number },
) {
  return service.rpc("job_claim_notification", {
    p_user_id: w.founder.id,
    p_wedding_id: w.weddingId,
    p_kind: "reminder",
    p_batch_key: batchKey,
    p_item_keys: [`task_due:${batchKey}`],
    p_daily_cap: caps.daily,
    p_monthly_cap: caps.monthly,
    p_now: now.toISOString(),
  });
}

function statusOf(result: { data: unknown; error: { message: string } | null }): string {
  if (result.error) throw new Error(result.error.message);
  return String((result.data as { status: string }).status);
}

describe("job_claim_notification under concurrency", () => {
  it("never claims more than the DAILY cap with parallel callers", async () => {
    const weddings = await Promise.all(Array.from({ length: 8 }, () => createWedding()));
    const now = freshInstant();
    const before = await counted(now);
    const caps = { daily: before.day + 3, monthly: before.month + 1000 };
    const results = await Promise.all(
      weddings.map((w) => claim(w, `reminder:${w.founder.id}:${now.toISOString()}`, now, caps)),
    );
    const statuses = results.map(statusOf);
    expect(statuses.filter((s) => s === "claimed")).toHaveLength(3);
    expect(statuses.filter((s) => s === "skipped_quota")).toHaveLength(5);
    const reasons = results
      .map((r) => r.data as { status: string; reason?: string })
      .filter((d) => d.status === "skipped_quota")
      .map((d) => d.reason);
    expect(new Set(reasons)).toEqual(new Set(["daily"]));
  });

  it("never claims more than the MONTHLY cap with parallel callers", async () => {
    const weddings = await Promise.all(Array.from({ length: 6 }, () => createWedding()));
    const now = freshInstant();
    const before = await counted(now);
    const caps = { daily: before.day + 1000, monthly: before.month + 2 };
    const results = await Promise.all(
      weddings.map((w) => claim(w, `reminder:${w.founder.id}:${now.toISOString()}`, now, caps)),
    );
    const statuses = results.map(statusOf);
    expect(statuses.filter((s) => s === "claimed")).toHaveLength(2);
    expect(statuses.filter((s) => s === "skipped_quota")).toHaveLength(4);
    const reasons = results
      .map((r) => r.data as { status: string; reason?: string })
      .filter((d) => d.status === "skipped_quota")
      .map((d) => d.reason);
    expect(new Set(reasons)).toEqual(new Set(["monthly"]));
  });

  it("claims one batch key exactly once with parallel callers", async () => {
    const w = await createWedding();
    const now = freshInstant();
    const key = `reminder:${w.founder.id}:${now.toISOString().slice(0, 10)}`;
    const statuses = (
      await Promise.all(
        Array.from({ length: 8 }, () => claim(w, key, now, { daily: 1000, monthly: 1000 })),
      )
    ).map(statusOf);
    expect(statuses.filter((s) => s === "claimed")).toHaveLength(1);
    expect(statuses.filter((s) => s === "in_progress")).toHaveLength(7);

    const { data } = await service.from("notification_log").select("id").eq("batch_key", key);
    expect(data).toHaveLength(1);
  });

  it("the same key claimed after 'sent' reports already_sent, even in parallel", async () => {
    const w = await createWedding();
    const now = freshInstant();
    const key = `reminder:${w.founder.id}:${now.toISOString().slice(0, 10)}`;
    const first = await claim(w, key, now, { daily: 1000, monthly: 1000 });
    const id = (first.data as { id: number }).id;
    const marked = await service.rpc("job_mark_notification_sent", {
      p_id: id,
      p_now: now.toISOString(),
    });
    expect(marked.error).toBeNull();
    const again = (
      await Promise.all(
        Array.from({ length: 4 }, () => claim(w, key, now, { daily: 1000, monthly: 1000 })),
      )
    ).map(statusOf);
    expect(again).toEqual(["already_sent", "already_sent", "already_sent", "already_sent"]);
  });
});
