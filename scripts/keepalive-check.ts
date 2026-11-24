/**
 * Weekly keep-alive and health check (plan §7, §12, AC44), run by `.github/workflows/keepalive.yml`
 * with the secret key of ONE remote project (GitHub environment secrets). Never prints a secret,
 * an address or the raw database error.
 *
 * Modes (`KEEPALIVE_MODE`):
 *   - `ping`  (staging: nobody runs the daily job there): writes a `keepalive` heartbeat through
 *             `record_heartbeat` and reads it back. A real write + read keeps the free Supabase
 *             project from being paused (~7 days of inactivity).
 *   - `check` (production): the newest `daily_job` heartbeat must be at most 36 hours old, and the
 *             last run must not report a failure or an exceeded email quota.
 * Exit code 1 on any problem, so the workflow turns red and GitHub notifies the owner.
 */
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";

export const MAX_HEARTBEAT_AGE_HOURS = 36;

export interface HeartbeatRow {
  ranAt: string;
  details: unknown;
}

/** Pure evaluation of the newest `daily_job` heartbeat. Returns the problems found (empty = healthy). */
export function evaluateHeartbeat(input: {
  now: Date;
  heartbeat: HeartbeatRow | null;
  maxAgeHours?: number;
}): string[] {
  const { now, heartbeat, maxAgeHours = MAX_HEARTBEAT_AGE_HOURS } = input;
  if (!heartbeat) return ["no daily_job heartbeat has ever been recorded"];
  const problems: string[] = [];
  const ranAt = new Date(heartbeat.ranAt).getTime();
  if (Number.isNaN(ranAt)) return ["the last heartbeat has an invalid timestamp"];
  const ageHours = (now.getTime() - ranAt) / 3_600_000;
  if (ageHours > maxAgeHours) {
    problems.push(`last heartbeat is ${Math.floor(ageHours)} h old (limit ${maxAgeHours} h)`);
  }
  const details =
    heartbeat.details !== null && typeof heartbeat.details === "object"
      ? (heartbeat.details as Record<string, unknown>)
      : {};
  if (details["ok"] === false) problems.push("the last daily job run reported a failure");
  if (details["over_quota"] === true) {
    problems.push("the email quota was exceeded in the last run (emails were skipped)");
  }
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
    .order("ran_at", { ascending: false })
    .limit(1);
  if (error) fail(`could not read the heartbeats (${error.code ?? "error"})`);
  const row = data?.[0];
  const problems = evaluateHeartbeat({
    now: new Date(),
    heartbeat: row ? { ranAt: row.ran_at, details: row.details } : null,
  });
  if (problems.length > 0) fail(problems.join("; "));
  console.log("keepalive: daily job healthy");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(() => fail("unexpected error"));
}
