import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ipBucket, rsvpIpKey } from "./limiter";

const SECRET = "test-secret-0123456789abcdef0123456789";

describe("ipBucket", () => {
  it("keeps an IPv4 address as is", () => {
    expect(ipBucket("203.0.113.7")).toBe("203.0.113.7");
  });

  it("reduces IPv6 to its /64: same prefix, same bucket; other prefix, other bucket", () => {
    const a = ipBucket("2001:db8:1:2:aaaa:bbbb:cccc:dddd");
    expect(a).toBe("2001:0db8:0001:0002::/64");
    expect(ipBucket("2001:db8:1:2::1")).toBe(a);
    expect(ipBucket("2001:DB8:1:2:ffff:ffff:ffff:ffff")).toBe(a);
    expect(ipBucket("2001:db8:1:3::1")).not.toBe(a);
  });

  it("expands compressed forms before cutting", () => {
    expect(ipBucket("2001:db8::1")).toBe("2001:0db8:0000:0000::/64");
    expect(ipBucket("::1")).toBe("0000:0000:0000:0000::/64");
  });

  it("maps an IPv4-mapped IPv6 address back to the IPv4", () => {
    expect(ipBucket("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(ipBucket("::ffff:cb00:7107")).toBe("203.0.113.7");
  });

  it("never throws on text that is not an address", () => {
    expect(ipBucket("1:2:3")).toBe("1:2:3");
    expect(ipBucket("::::")).toBe("::::");
    expect(ipBucket("1::2::3")).toBe("1::2::3");
  });
});

describe("rsvpIpKey", () => {
  it("is null when there is no IP (no per-IP limit)", () => {
    expect(rsvpIpKey(SECRET, null)).toBeNull();
  });

  it("is a 32-byte bytea literal: HMAC with the r2y-rsvp:ip: context", () => {
    const key = rsvpIpKey(SECRET, "203.0.113.7");
    const expected = createHmac("sha256", SECRET).update("r2y-rsvp:ip:203.0.113.7").digest("hex");
    expect(key).toBe(`\\x${expected}`);
    expect(key).toMatch(/^\\x[0-9a-f]{64}$/);
  });

  it("differs by secret and by IP, and is equal inside one IPv6 /64", () => {
    expect(rsvpIpKey(SECRET, "203.0.113.7")).not.toBe(rsvpIpKey(`${SECRET}x`, "203.0.113.7"));
    expect(rsvpIpKey(SECRET, "203.0.113.7")).not.toBe(rsvpIpKey(SECRET, "203.0.113.8"));
    expect(rsvpIpKey(SECRET, "2001:db8:1:2::1")).toBe(rsvpIpKey(SECRET, "2001:db8:1:2::2"));
  });

  it("never collides with the login key for the same IP", async () => {
    const { ipLimiterKey } = await import("@/features/auth/limiter-keys");
    expect(rsvpIpKey(SECRET, "203.0.113.7")).not.toBe(ipLimiterKey(SECRET, "203.0.113.7"));
  });
});
