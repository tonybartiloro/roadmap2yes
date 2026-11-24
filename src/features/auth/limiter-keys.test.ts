import { describe, expect, it } from "vitest";
import { clientIp, emailLimiterKey, ipLimiterKey, limiterKey } from "./limiter-keys";

const SECRET = "test-secret-not-real";
const headers = (values: Record<string, string>) => ({
  get: (name: string) => values[name.toLowerCase()] ?? null,
});

describe("limiter keys", () => {
  it("is a bytea literal of 32 bytes (64 hex digits)", () => {
    expect(limiterKey(SECRET, "email", "a@example.test")).toMatch(/^\\x[0-9a-f]{64}$/);
  });

  it("is deterministic, depends on the secret and never contains the value", () => {
    const key = limiterKey(SECRET, "email", "a@example.test");
    expect(limiterKey(SECRET, "email", "a@example.test")).toBe(key);
    expect(limiterKey("another-secret", "email", "a@example.test")).not.toBe(key);
    expect(key).not.toContain("example");
  });

  it("keeps email and ip keys apart even for the same string", () => {
    expect(limiterKey(SECRET, "email", "10.0.0.1")).not.toBe(limiterKey(SECRET, "ip", "10.0.0.1"));
  });

  it("normalizes the email (case and spaces)", () => {
    expect(emailLimiterKey(SECRET, "  Tony@Example.TEST ")).toBe(
      emailLimiterKey(SECRET, "tony@example.test"),
    );
  });

  it("has no ip key when the ip is unknown", () => {
    expect(ipLimiterKey(SECRET, null)).toBeNull();
    expect(ipLimiterKey(SECRET, "203.0.113.7")).toMatch(/^\\x[0-9a-f]{64}$/);
  });
});

describe("clientIp", () => {
  it("takes the first hop of x-forwarded-for", () => {
    expect(clientIp(headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.2" }))).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip, accepts IPv6", () => {
    expect(clientIp(headers({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientIp(headers({ "x-forwarded-for": "2001:db8::1" }))).toBe("2001:db8::1");
  });

  it("returns null when missing or not shaped like an address", () => {
    expect(clientIp(headers({}))).toBeNull();
    expect(clientIp(headers({ "x-forwarded-for": "not an ip; drop table" }))).toBeNull();
  });
});
