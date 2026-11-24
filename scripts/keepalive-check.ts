/**
 * Weekly keep-alive and health check (plan §7, §12, AC44), run by `.github/workflows/keepalive.yml`
 * with the secret key of ONE remote project (GitHub environment secrets). Never prints a secret,
 * an address or the raw database error.
 *
 * Modes (`KEEPALIVE_MODE`):
 *   - `ping`  (staging: nobody runs the daily job there): writes a `keepalive` heartbeat through
 *             `record_heartbeat` and reads it back. A real write + read keeps the free Supabase
 *             project from being paused (~7 days of inactivity).
 *   - `check` (production): over the `daily_job` heartbeats of the last 8 days, the newest must be
 *             at most 36 hours old, no gap may exceed 36 hours, and no run may report a failure or
 *             an exceeded email quota (a bad Tuesday is not hidden by a good Saturday).
 * Exit code 1 on any problem, so the workflow turns red and GitHub notifies the owner.
 */
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";

export const MAX_HEARTBEAT_AGE_HOURS = 36;

export interface HeartbeatRow {
  ranAt: string;
  details: unknown;
}

/** The weekly check looks at every `daily_job` heartbeat of the last 8 days (REV-1). */
export const WINDOW_DAYS = 8;

/**
 * Pure evaluation of the `daily_job` heartbeats of the window (any order). Returns the problems
 * found (empty = healthy): the newest must be at most `maxAgeHours` old, no gap between
 * consecutive heartbeats may exceed it, and no run may report a failure or an exceeded quota.
 */
export function evaluateHeartbeats(input: {
  now: Date;
  heartbeats: readonly HeartbeatRow[];
  maxAgeHours?: number;
}): string[] {
  const { now, maxAgeHours = MAX_HEARTBEAT_AGE_HOURS } = input;
  if (input.heartbeats.length === 0) {
    return [`no daily_job heartbeat in the last ${WINDOW_DAYS} days`];
  }
  const rows = input.heartbeats.map((h) => ({
    at: new Date(h.ranAt).getTime(),
    details:
      h.details !== null && typeof h.details === "object"
        ? (h.details as Record<string, unknown>)
        : {},
  }));
  if (rows.some((r) => Number.isNaN(r.at))) return ["a heartbeat has an invalid timestamp"];
  rows.sort((a, b) => a.at - b.at);

  const problems: string[] = [];
  const hours = (ms: number) => ms / 3_600_000;
  const age = hours(now.getTime() - rows[rows.length - 1]!.at);
  if (age > maxAgeHours) {
    problems.push(`last heartbeat is ${Math.floor(age)} h old (limit ${maxAgeHours} h)`);
  }
  for (let i = 1; i < rows.length; i++) {
    const gap = hours(rows[i]!.at - rows[i - 1]!.at);
    if (gap > maxAgeHours) problems.push(`gap of ${Math.floor(gap)} h between two daily runs`);
  }
  const failed = rows.filter((r) => r.details["ok"] === false).length;
  if (failed > 0) problems.push(`${failed} daily job run(s) reported a failure`);
  const over = rows.filter((r) => r.details["over_quota"] === true).length;
  if (over > 0)
    problems.push(`the email quota was exceeded in ${over} run(s) (emails were skipped)`);
  return problems;
}

function fail(message: string): never {
  console.error(`keepalive: ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["SUPABASE_SECRET_KEY"];
  const mode = process.env["KEEPALIVE_MODE"] ?? "check";
  if (!url || !key) fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required");
  if (mode !== "ping" && mode !== "check") fail("KEEPALIVE_MODE must be `ping` or `check`");
  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (mode === "ping") {
    const { error } = await client.rpc("record_heartbeat", {
      p_source: "keepalive",
      p_details: { from: "github-actions" },
    });
    if (error) fail(`could not write the heartbeat (${error.code ?? "error"})`);
    const read = await client
      .from("heartbeats")
      .select("ran_at")
      .eq("source", "keepalive")
      .order("ran_at", { ascending: false })
      .limit(1);
    if (read.error || !read.data?.length) fail("could not read the heartbeat back");
    console.log("keepalive: ping ok");
    return;
  }

  const { data, error } = await client
    .from("heartbeats")
    .select("ran_at, details")
    .eq("source", "daily_job")
    .gte("ran_at", new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString())
    .order("ran_at", { ascending: false })
    .limit(100);
  if (error) fail(`could not read the heartbeats (${error.code ?? "error"})`);
  const problems = evaluateHeartbeats({
    now: new Date(),
    heartbeats: (data ?? []).map((r) => ({ ranAt: r.ran_at, details: r.details })),
  });
  if (problems.length > 0) fail(problems.join("; "));
  console.log("keepalive: daily job healthy");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(() => fail("unexpected error"));
}
