import { describe, expect, it } from "vitest";
import { evaluateHeartbeats, type HeartbeatRow } from "./keepalive-check";

const NOW = new Date("2027-03-10T12:00:00Z");
const hoursAgo = (h: number, details: unknown = { ok: true, over_quota: false }): HeartbeatRow => ({
  ranAt: new Date(NOW.getTime() - h * 3_600_000).toISOString(),
  details,
});
const evaluate = (heartbeats: HeartbeatRow[]) => evaluateHeartbeats({ now: NOW, heartbeats });

describe("evaluateHeartbeats", () => {
  it("is healthy for a week of daily successful runs", () => {
    expect(evaluate([7, 31, 55, 79, 103, 127, 151].map((h) => hoursAgo(h)))).toEqual([]);
  });

  it("fails when the newest run is older than 36 hours, not before", () => {
    expect(evaluate([hoursAgo(35.9)])).toEqual([]);
    expect(evaluate([hoursAgo(36.1)])).toHaveLength(1);
  });

  it("fails when no heartbeat exists in the window", () => {
    expect(evaluate([])).toHaveLength(1);
  });

  it("an old failed run is NOT hidden by a later healthy one (REV-1)", () => {
    const problems = evaluate([
      hoursAgo(5),
      hoursAgo(29),
      hoursAgo(53, { ok: false, error: "Error" }),
      hoursAgo(77),
    ]);
    expect(problems).toEqual(["1 daily job run(s) reported a failure"]);
  });

  it("an old over-quota run is reported too", () => {
    const problems = evaluate([hoursAgo(5), hoursAgo(100, { ok: true, over_quota: true })]);
    expect(problems.some((p) => p.includes("quota"))).toBe(true);
  });

  it("fails on a gap longer than 36 hours between two runs", () => {
    const problems = evaluate([hoursAgo(5), hoursAgo(29), hoursAgo(80)]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("gap");
  });

  it("accepts rows in any order and rejects an unreadable timestamp", () => {
    expect(evaluate([hoursAgo(53), hoursAgo(5), hoursAgo(29)])).toEqual([]);
    expect(evaluate([{ ranAt: "nope", details: {} }])).toHaveLength(1);
  });

  it("tolerates odd details", () => {
    expect(evaluate([hoursAgo(1, null)])).toEqual([]);
  });
});
