import { describe, expect, it } from "vitest";
import {
  buildUnsubscribeUrl,
  createUnsubscribeToken,
  verifyUnsubscribeToken,
} from "./unsubscribe-token";

const SECRET = "test-secret-1";
const USER = "6f1d2c1e-0000-4000-8000-000000000001";

describe("unsubscribe token", () => {
  it("round-trips for the same kind", () => {
    const token = createUnsubscribeToken({ userId: USER, kind: "reminders" }, SECRET);
    expect(verifyUnsubscribeToken(token, "reminders", SECRET)).toBe(USER);
  });
  it("rejects another kind, another secret and tampering", () => {
    const token = createUnsubscribeToken({ userId: USER, kind: "reminders" }, SECRET);
    expect(verifyUnsubscribeToken(token, "digest", SECRET)).toBeNull();
    expect(verifyUnsubscribeToken(token, "reminders", "other")).toBeNull();
    const [id, mac] = token.split(".") as [string, string];
    const otherId = Buffer.from("someone-else").toString("base64url");
    expect(verifyUnsubscribeToken(`${otherId}.${mac}`, "reminders", SECRET)).toBeNull();
    expect(verifyUnsubscribeToken(`${id}.${mac.slice(0, -2)}AA`, "reminders", SECRET)).toBeNull();
    expect(verifyUnsubscribeToken(`${id}.`, "reminders", SECRET)).toBeNull();
  });
  it("never throws on garbage", () => {
    for (const bad of ["", "x", "a.b.c", "!!.!!", "a".repeat(600)]) {
      expect(verifyUnsubscribeToken(bad, "digest", SECRET)).toBeNull();
    }
    expect(verifyUnsubscribeToken("a.b", "digest", undefined)).toBeNull();
  });
  it("refuses to sign without a secret", () => {
    const saved = process.env["EMAIL_LINK_SECRET"];
    delete process.env["EMAIL_LINK_SECRET"];
    try {
      expect(() => createUnsubscribeToken({ userId: USER, kind: "digest" })).toThrow(
        "EMAIL_LINK_SECRET",
      );
    } finally {
      if (saved !== undefined) process.env["EMAIL_LINK_SECRET"] = saved;
    }
  });
  it("builds a URL without PII", () => {
    const url = buildUnsubscribeUrl(
      { userId: USER, kind: "digest" },
      { siteUrl: "https://app.example.test", secret: SECRET },
    );
    expect(url.startsWith("https://app.example.test/email/disattiva?tipo=digest&t=")).toBe(true);
    expect(url).not.toContain("@");
  });
});
