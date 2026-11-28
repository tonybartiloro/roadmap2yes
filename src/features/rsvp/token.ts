import { createHash, createHmac } from "node:crypto";

/**
 * RSVP link tokens (ADR-0003). The token is DERIVED, not stored:
 * `base64url(HMAC-SHA256(RSVP_LINK_SECRET, "r2y-rsvp:v1:" + linkId))` (43 chars). The DB keeps only
 * sha256(token), so the couple can show the same link again while the DB alone cannot forge one.
 * No `server-only` here: the e2e seed reuses it. The secret is passed in, never read or logged.
 */
const CONTEXT = "r2y-rsvp:v1:";

/** base64url of 32 bytes = 43 characters. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

export function deriveRsvpToken(secret: string, linkId: string): string {
  return createHmac("sha256", secret).update(`${CONTEXT}${linkId}`).digest("base64url");
}

/** PostgREST bytea literal of sha256(token), what the RPCs take. */
export function hashRsvpToken(token: string): string {
  return `\\x${createHash("sha256").update(token).digest("hex")}`;
}

/** Shape check only: a malformed token can be rejected without touching the DB (QA-15). */
export function isRsvpTokenShape(token: string): boolean {
  return TOKEN_SHAPE.test(token);
}

export function rsvpUrl(siteUrl: string, token: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/rsvp/${token}`;
}
