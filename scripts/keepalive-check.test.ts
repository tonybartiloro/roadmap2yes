import { describe, expect, it } from "vitest";
import { evaluateHeartbeat } from "./keepalive-check";

const NOW = new Date("2027-03-10T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

describe("evaluateHeartbeat", () => {
  it("is healthy for a recent, successful run", () => {
    expect(
      evaluateHeartbeat({
        now: NOW,
        heartbeat: { ranAt: hoursAgo(7), details: { ok: true, over_quota: false } },
      }),
    ).toEqual([]);
  });

  it("fails after 36 hours, not before", () => {
    expect(
      evaluateHeartbeat({ now: NOW, heartbeat: { ranAt: hoursAgo(35.9), details: {} } }),
    ).toEqual([]);
    expect(
      evaluateHeartbeat({ now: NOW, heartbeat: { ranAt: hoursAgo(36.1), details: {} } }),
    ).toHaveLength(1);
  });

  it("fails when no heartbeat was ever recorded", () => {
    expect(evaluateHeartbeat({ now: NOW, heartbeat: null })).toHaveLength(1);
  });

  it("fails when the last run reported a failure or an exceeded quota", () => {
    const problems = evaluateHeartbeat({
      now: NOW,
      heartbeat: { ranAt: hoursAgo(1), details: { ok: false, over_quota: true } },
    });
    expect(problems).toHaveLength(2);
  });

  it("rejects an unreadable timestamp and tolerates odd details", () => {
    expect(evaluateHeartbeat({ now: NOW, heartbeat: { ranAt: "nope", details: {} } })).toHaveLength(
      1,
    );
    expect(
      evaluateHeartbeat({ now: NOW, heartbeat: { ranAt: hoursAgo(1), details: null } }),
    ).toEqual([]);
  });
});
