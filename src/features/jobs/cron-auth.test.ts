import { describe, expect, it } from "vitest";
import { isAuthorizedCron } from "./cron-auth";

describe("isAuthorizedCron", () => {
  const secret = "a-fake-cron-secret-for-tests";

  it("accepts the exact bearer secret", () => {
    expect(isAuthorizedCron(`Bearer ${secret}`, secret)).toBe(true);
  });

  it("refuses a missing, empty, malformed or wrong header", () => {
    expect(isAuthorizedCron(null, secret)).toBe(false);
    expect(isAuthorizedCron("", secret)).toBe(false);
    expect(isAuthorizedCron(secret, secret)).toBe(false);
    expect(isAuthorizedCron(`Basic ${secret}`, secret)).toBe(false);
    expect(isAuthorizedCron(`bearer ${secret}`, secret)).toBe(false);
    expect(isAuthorizedCron("Bearer wrong", secret)).toBe(false);
    expect(isAuthorizedCron(`Bearer ${secret}x`, secret)).toBe(false);
    expect(isAuthorizedCron("Bearer ", secret)).toBe(false);
  });

  it("fails closed when no secret is configured", () => {
    expect(isAuthorizedCron("Bearer ", undefined)).toBe(false);
    expect(isAuthorizedCron("Bearer anything", undefined)).toBe(false);
    expect(isAuthorizedCron("Bearer anything", "")).toBe(false);
  });
});
