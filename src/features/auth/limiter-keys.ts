import { createHmac } from "node:crypto";
import { normalizeEmail } from "@/lib/app-config";

/**
 * Keys of the login limiter (plan §4.3): the DB only ever sees keyed digests (HMAC-SHA256 with a
 * server secret), never an email or an IP, and keeps no history beyond the window. Pure code, so
 * it is unit-tested; the secret is passed in (it is the Supabase secret key, read by `login.ts`).
 *
 * Wire format for PostgREST `bytea`: the string `\x<64 hex digits>`.
 */

export type KeyKind = "email" | "ip";

export function limiterKey(secret: string, kind: KeyKind, value: string): string {
  // The kind is part of the MAC input so an email can never collide with an IP key.
  const digest = createHmac("sha256", secret).update(`r2y-login:${kind}:${value}`).digest("hex");
  return `\\x${digest}`;
}

export function emailLimiterKey(secret: string, email: string): string {
  return limiterKey(secret, "email", normalizeEmail(email));
}

type HeaderReader = { get(name: string): string | null };

const IP_SHAPE = /^[0-9a-fA-F:.]{2,45}$/;

/**
 * ASSUMPTION (code-14 REV-6, runbook): VALID ONLY BEHIND VERCEL, which overwrites these headers
 * with the real client address. Behind any other proxy or CDN they can be spoofed (the per-IP key
 * escaped or aimed at a victim); do not put another proxy in front without revisiting this. The
 * per-email key does not depend on the IP. IPv6: an attacker can rotate inside a /64, so the IP
 * key is weaker there.
 *
 * Client IP as set by Vercel (`x-forwarded-for` first hop, else `x-real-ip`). `null` when it is
 * missing or not shaped like an address: then only the email key applies (a shared "unknown"
 * bucket would let one visitor lock everyone out).
 */
export function clientIp(headers: HeaderReader): string | null {
  const forwarded = (headers.get("x-vercel-forwarded-for") ?? headers.get("x-forwarded-for"))
    ?.split(",")[0]
    ?.trim();
  const candidate = forwarded || headers.get("x-real-ip")?.trim();
  return candidate && IP_SHAPE.test(candidate) ? candidate.toLowerCase() : null;
}

export function ipLimiterKey(secret: string, ip: string | null): string | null {
  return ip === null ? null : limiterKey(secret, "ip", ip);
}
