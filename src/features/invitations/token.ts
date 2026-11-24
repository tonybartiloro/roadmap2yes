import { createHash, randomBytes } from "node:crypto";

/**
 * One-time invite tokens (plan §4.5.2). The server makes them (32 random bytes); the DB only ever
 * sees the sha256, so a partner who calls the RPC directly with a hash of their choice gets nothing
 * more than the code method. The token itself is never stored, logged or returned after sending.
 */

/** base64url of 32 bytes = 43 characters. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

export type InviteToken = {
  /** Goes in the link only. */
  token: string;
  /** PostgREST `bytea` text of the sha256 (`\x…`), what the RPCs take. */
  hash: string;
};

/** PostgREST bytea literal of sha256(token). */
export function hashInviteToken(token: string): string {
  return `\\x${createHash("sha256").update(token).digest("hex")}`;
}

export function isTokenShape(token: string): boolean {
  return TOKEN_SHAPE.test(token);
}

export function generateInviteToken(random: (size: number) => Buffer = randomBytes): InviteToken {
  const token = random(32).toString("base64url");
  return { token, hash: hashInviteToken(token) };
}

export function inviteUrl(siteUrl: string, token: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/invito/${token}`;
}
