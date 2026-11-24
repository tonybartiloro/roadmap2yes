import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { readJobSecrets, readSiteUrl } from "@/lib/app-config";
import type { UnsubscribableKind } from "./types";

/**
 * Unsubscribe tokens (plan §7, AC52): `base64url(userId).base64url(hmac)`.
 *
 * - The MAC covers a fixed context string, the KIND and the user id, so a token for `reminders`
 *   never works for `digest` and never for another user.
 * - Verification is constant-time. The user id is a random uuid (no email, no name in the URL).
 * - The secret (`EMAIL_LINK_SECRET`) is read at call time and never logged.
 */
const CONTEXT = "r2y-unsubscribe-v1";
export const UNSUBSCRIBE_KINDS: readonly UnsubscribableKind[] = ["reminders", "digest"];

function mac(secret: string, kind: UnsubscribableKind, userId: string): Buffer {
  return createHmac("sha256", secret).update(`${CONTEXT}\n${kind}\n${userId}`).digest();
}

function resolveSecret(secret: string | undefined): string | undefined {
  return secret ?? readJobSecrets().emailLinkSecret;
}

/** Throws (value-free message) when no secret is configured: never emit an unsigned link. */
export function createUnsubscribeToken(
  input: { userId: string; kind: UnsubscribableKind },
  secret?: string,
): string {
  const key = resolveSecret(secret);
  if (!key) throw new Error("Missing email configuration: EMAIL_LINK_SECRET");
  const id = Buffer.from(input.userId, "utf8").toString("base64url");
  return `${id}.${mac(key, input.kind, input.userId).toString("base64url")}`;
}

/**
 * Returns the user id when the token is authentic FOR THIS KIND, otherwise `null`
 * (malformed, tampered, other kind, other secret, no secret). Never throws.
 */
export function verifyUnsubscribeToken(
  token: string,
  kind: UnsubscribableKind,
  secret?: string,
): string | null {
  const key = resolveSecret(secret);
  if (!key || token.length > 512) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [idPart, macPart] = parts as [string, string];
  if (!/^[A-Za-z0-9_-]+$/.test(idPart) || !/^[A-Za-z0-9_-]+$/.test(macPart)) return null;
  const userId = Buffer.from(idPart, "base64url").toString("utf8");
  const given = Buffer.from(macPart, "base64url");
  const expected = mac(key, kind, userId);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return userId;
}

/**
 * Public URL of the unsubscribe page (route owned by T16): `/email/disattiva?tipo=<kind>&t=<token>`.
 * The page must show a confirmation on GET and change nothing; the change happens on POST.
 */
export function buildUnsubscribeUrl(
  input: { userId: string; kind: UnsubscribableKind },
  options: { siteUrl?: string; secret?: string } = {},
): string {
  const base = options.siteUrl ?? readSiteUrl();
  const token = createUnsubscribeToken(input, options.secret);
  return `${base}/email/disattiva?tipo=${input.kind}&t=${token}`;
}
