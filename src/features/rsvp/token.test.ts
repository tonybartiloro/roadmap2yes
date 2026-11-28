import { describe, expect, it } from "vitest";
import { FAKE_RSVP_LINK_SECRET } from "@/lib/app-config";
import { deriveRsvpToken, hashRsvpToken, isRsvpTokenShape, rsvpUrl } from "./token";

// Vector shared with the local seed (supabase/seeds/05_rsvp.sql) and the pgTAP digest.
const SECRET = "local-fake-rsvp-secret-0123456789abcdef";
const LINK_ID = "00000000-0000-4000-8000-0000000a3001";
const TOKEN = "D-nIsgqL5dGbgoSIb9_oamFr3fXgA_dVLTkmc1J0vno";
const HASH = "\\x6519b8d9ff03cd286669dcec27d4d3ecab803042f1867dd4930fa120fdfa32f7";

describe("deriveRsvpToken", () => {
  it("matches the fixed vector and the shared fake secret", () => {
    expect(SECRET).toBe(FAKE_RSVP_LINK_SECRET);
    expect(deriveRsvpToken(SECRET, LINK_ID)).toBe(TOKEN);
  });

  it("is 32 bytes of base64url and passes the shape check", () => {
    const token = deriveRsvpToken(SECRET, LINK_ID);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(isRsvpTokenShape(token)).toBe(true);
  });

  it("gives 1000 distinct tokens for 1000 ids", () => {
    const ids = Array.from(
      { length: 1000 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    );
    expect(new Set(ids.map((id) => deriveRsvpToken(SECRET, id))).size).toBe(1000);
  });

  it("changes with the secret and with the link id", () => {
    expect(deriveRsvpToken(`${SECRET}x`, LINK_ID)).not.toBe(TOKEN);
    expect(deriveRsvpToken(SECRET, "00000000-0000-4000-8000-0000000a3002")).not.toBe(TOKEN);
  });
});

describe("hashRsvpToken", () => {
  it("is the bytea literal of the sha256 (same as the seed digest)", () => {
    expect(hashRsvpToken(TOKEN)).toBe(HASH);
  });
});

describe("isRsvpTokenShape", () => {
  it.each([
    ["empty", ""],
    ["too short", TOKEN.slice(1)],
    ["too long", `${TOKEN}A`],
    ["padding", `${TOKEN.slice(1)}=`],
    ["bad char", `${TOKEN.slice(1)}!`],
    ["space", ` ${TOKEN.slice(1)}`],
    ["slash", `${TOKEN.slice(1)}/`],
  ])("rejects %s without the DB", (_n, value) => {
    expect(isRsvpTokenShape(value)).toBe(false);
  });

  it("accepts any well-formed variant (it is then an unknown token, so it goes to the DB)", () => {
    expect(isRsvpTokenShape(TOKEN.toUpperCase())).toBe(true);
    expect(isRsvpTokenShape("A".repeat(43))).toBe(true);
  });
});

describe("rsvpUrl", () => {
  it("builds /rsvp/{token} and strips trailing slashes", () => {
    expect(rsvpUrl("https://x.example.test//", TOKEN)).toBe(`https://x.example.test/rsvp/${TOKEN}`);
  });
});
