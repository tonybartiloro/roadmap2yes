import { isWeakCode } from "@/content/weak-codes";

/**
 * Access-code policy (plan §4.4, BR20, D49). Supabase Auth enforces length and letters+digits
 * server-side; this module gives the exact Italian errors up front, adds the weak-code list and
 * the "no email / name" rules, and generates the initial code ("Genera").
 */

export const ACCESS_CODE_MIN_LENGTH = 10;
/** bcrypt ignores everything past 72 bytes. */
export const ACCESS_CODE_MAX_BYTES = 72;

export const ACCESS_CODE_ERRORS = {
  "too-short": "Il codice deve avere almeno 10 caratteri.",
  "too-long": "Il codice può avere al massimo 72 caratteri.",
  "needs-letter-and-digit": "Il codice deve contenere almeno una lettera e almeno una cifra.",
  weak: "Questo codice è troppo comune. Scegline uno meno prevedibile.",
  personal: "Il codice non deve contenere l'email, il nome o il cognome.",
} as const;

export type AccessCodeErrorCode = keyof typeof ACCESS_CODE_ERRORS;

export type AccessCodeResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: AccessCodeErrorCode;
      readonly message: (typeof ACCESS_CODE_ERRORS)[AccessCodeErrorCode];
    };

/** Whom the code belongs to: used to refuse codes that contain personal data. */
export interface AccessCodeSubject {
  readonly email?: string | null;
  readonly firstName?: string | null;
  readonly lastName?: string | null;
}

/** Shorter personal strings would reject almost every code. */
const MIN_PERSONAL_LENGTH = 3;

const fold = (value: string): string => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

function personalFragments(subject: AccessCodeSubject): string[] {
  const fragments: string[] = [];
  const local = (subject.email ?? "").split("@")[0] ?? "";
  if (local) {
    fragments.push(fold(local), fold(local).replace(/[^\p{L}\p{N}]/gu, ""));
  }
  for (const name of [subject.firstName, subject.lastName]) {
    if (name) fragments.push(fold(name).replace(/\s+/g, ""), ...fold(name).split(/\s+/));
  }
  return [...new Set(fragments)].filter((f) => f.length >= MIN_PERSONAL_LENGTH);
}

function fail(code: AccessCodeErrorCode): AccessCodeResult {
  return { ok: false, code, message: ACCESS_CODE_ERRORS[code] };
}

/** Validation order: length, letters+digits, weak list, personal data. */
export function validateAccessCode(
  code: string,
  subject: AccessCodeSubject = {},
): AccessCodeResult {
  if (Array.from(code).length < ACCESS_CODE_MIN_LENGTH) return fail("too-short");
  if (new TextEncoder().encode(code).length > ACCESS_CODE_MAX_BYTES) return fail("too-long");
  if (!/\p{L}/u.test(code) || !/\d/.test(code)) return fail("needs-letter-and-digit");
  if (isWeakCode(code)) return fail("weak");
  const folded = fold(code);
  if (personalFragments(subject).some((f) => folded.includes(f))) return fail("personal");
  return { ok: true };
}

/** No ambiguous characters: no i, l, o, 0, 1. */
export const ACCESS_CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export type RandomBytes = (array: Uint8Array) => Uint8Array;

const webCrypto: RandomBytes = (array) => globalThis.crypto.getRandomValues(array);

export interface GenerateOptions {
  /** Number of characters, dashes excluded. At least 12 is recommended; the minimum is 10. */
  readonly length?: number;
  /** Injectable for tests; defaults to Web Crypto. */
  readonly random?: RandomBytes;
}

/** Uniform pick from the alphabet by rejection sampling (no modulo bias). */
function pickChars(count: number, random: RandomBytes): string {
  const n = ACCESS_CODE_ALPHABET.length;
  const limit = 256 - (256 % n);
  let out = "";
  while (out.length < count) {
    for (const byte of random(new Uint8Array(count * 2))) {
      if (byte < limit && out.length < count) out += ACCESS_CODE_ALPHABET[byte % n];
    }
  }
  return out;
}

/**
 * "Genera un codice": cryptographically random, in groups of 4 separated by dashes
 * ("k7mq-x2vd-h9pt"). The dashes are part of the code. Always contains letters and digits.
 */
export function generateAccessCode({
  length = 12,
  random = webCrypto,
}: GenerateOptions = {}): string {
  if (!Number.isInteger(length) || length < ACCESS_CODE_MIN_LENGTH || length > 64) {
    throw new RangeError(`Access code length must be an integer between 10 and 64: ${length}`);
  }
  for (;;) {
    const chars = pickChars(length, random);
    if (!/[a-z]/.test(chars) || !/[2-9]/.test(chars)) continue;
    return chars.match(/.{1,4}/g)!.join("-");
  }
}
