import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Cron authentication (plan §7): `Authorization: Bearer <CRON_SECRET>`, which Vercel Cron sends
 * automatically when the variable exists. Fails closed: no configured secret means nobody is
 * authorised (the route never runs open).
 *
 * Both values are hashed first so the constant-time comparison always sees two 32-byte buffers
 * (no length leak, no early return on the first differing byte).
 */
export function isAuthorizedCron(
  authorization: string | null | undefined,
  secret: string | undefined,
): boolean {
  if (!secret || !authorization) return false;
  const match = /^Bearer (.+)$/.exec(authorization);
  if (!match) return false;
  const given = createHash("sha256").update(match[1]!).digest();
  const expected = createHash("sha256").update(secret).digest();
  return timingSafeEqual(given, expected);
}
