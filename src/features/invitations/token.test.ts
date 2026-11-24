import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateInviteToken, hashInviteToken, inviteUrl, isTokenShape } from "./token";

describe("invite token", () => {
  it("is 32 random bytes in base64url (43 characters) and the hash is the sha256 as bytea", () => {
    const requested: number[] = [];
    const { token, hash } = generateInviteToken((size) => {
      requested.push(size);
      return Buffer.alloc(size, 7);
    });
    expect(requested).toEqual([32]);
    expect(token).toHaveLength(43);
    expect(isTokenShape(token)).toBe(true);
    expect(hash).toBe(`\\x${createHash("sha256").update(token).digest("hex")}`);
    expect(hash).toBe(hashInviteToken(token));
    expect(hash).not.toContain(token);
  });

  it("two tokens differ", () => {
    expect(generateInviteToken().token).not.toBe(generateInviteToken().token);
  });

  it("refuses anything that is not the exact shape", () => {
    for (const bad of [
      "",
      "short",
      "a".repeat(42),
      "a".repeat(44),
      `${"a".repeat(42)}=`,
      `${"a".repeat(42)}/`,
    ]) {
      expect(isTokenShape(bad)).toBe(false);
    }
  });

  it("builds the link on the site URL without a double slash", () => {
    expect(inviteUrl("https://app.example.test/", "tok")).toBe(
      "https://app.example.test/invito/tok",
    );
  });
});
