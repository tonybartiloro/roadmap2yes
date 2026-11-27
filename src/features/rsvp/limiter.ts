import { createHmac } from "node:crypto";

/**
 * Per-IP key of the RSVP limiter (ADR-0003, BR9). Same idea as `features/auth/limiter-keys.ts` but
 * its own HMAC context (`r2y-rsvp:ip:`), so an RSVP key can never collide with a login key. The DB
 * only ever sees the keyed digest. The caller reads the address with `clientIp` (reused as is).
 * IPv6 is reduced to its /64: one subscriber owns a whole /64, so per-address keys would be free to
 * rotate. A missing IP gives `null`: no per-IP limit (the per-link limit stays, P5/QA-2).
 * Wire format for PostgREST `bytea`: `\x<64 hex digits>` (32 bytes).
 */

const CONTEXT = "r2y-rsvp:ip:";

/** Expands an IPv6 text form to 8 groups, or `null` when it is not a valid address. */
function ipv6Groups(ip: string): string[] | null {
  let text = ip;
  const tail = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (tail) {
    const [a, b, c, d] = [tail[1], tail[2], tail[3], tail[4]].map(Number) as [
      number,
      number,
      number,
      number,
    ];
    if ([a, b, c, d].some((n) => n > 255)) return null;
    text = `${text.slice(0, tail.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves[1] === undefined ? [] : halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...rest];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => g.padStart(4, "0"));
}

/**
 * The value that is keyed: an IPv4 address as is; an IPv4-mapped IPv6 (`::ffff:a.b.c.d`) as the IPv4;
 * any other IPv6 as its /64 prefix. Text that does not parse is keyed as it came (never throws).
 */
export function ipBucket(ip: string): string {
  const value = ip.toLowerCase();
  if (!value.includes(":")) return value;
  const groups = ipv6Groups(value);
  if (!groups) return value;
  const mapped =
    groups.slice(0, 5).every((g) => g === "0000") && groups[5] === "ffff"
      ? `${parseInt(groups[6]!.slice(0, 2), 16)}.${parseInt(groups[6]!.slice(2), 16)}.${parseInt(groups[7]!.slice(0, 2), 16)}.${parseInt(groups[7]!.slice(2), 16)}`
      : null;
  return mapped ?? `${groups.slice(0, 4).join(":")}::/64`;
}

export function rsvpIpKey(secret: string, ip: string | null): string | null {
  if (ip === null) return null;
  const digest = createHmac("sha256", secret).update(`${CONTEXT}${ipBucket(ip)}`).digest("hex");
  return `\\x${digest}`;
}
