import { describe, expect, it } from "vitest";
import {
  type AccessCodeSubject,
  ACCESS_CODE_ALPHABET,
  ACCESS_CODE_ERRORS,
  generateAccessCode,
  validateAccessCode,
} from "./access-code";
import { WEAK_CODES_SET } from "@/content/weak-codes";

const subject = { email: "tony.rossi@example.test", firstName: "Tony", lastName: "Rossi" };
const errorOf = (code: string, s: AccessCodeSubject = subject) => {
  const r = validateAccessCode(code, s);
  return r.ok ? null : r.code;
};

describe("validateAccessCode (BR20, D49)", () => {
  it("accepts a good code", () => {
    expect(validateAccessCode("pesca7cavallo9", subject)).toEqual({ ok: true });
  });

  it("rejects short codes with the exact text", () => {
    expect(validateAccessCode("abc12345x", subject)).toEqual({
      ok: false,
      code: "too-short",
      message: "Il codice deve avere almeno 10 caratteri.",
    });
    expect(errorOf("abcdefgh12")).toBeNull();
  });

  it("enforces 72 bytes at most (72 ok, 73 error)", () => {
    expect(errorOf("a1" + "x".repeat(70))).toBeNull();
    const r = validateAccessCode("a1" + "x".repeat(71), subject);
    expect(r).toEqual({
      ok: false,
      code: "too-long",
      message: "Il codice può avere al massimo 72 caratteri.",
    });
  });

  it("counts bytes, not characters, for the bcrypt limit", () => {
    expect(errorOf("1" + "è".repeat(36))).toBe("too-long"); // 1 + 72 bytes
  });

  it("needs a letter and a digit", () => {
    expect(errorOf("abcdefghijkl")).toBe("needs-letter-and-digit");
    expect(errorOf("12345678901234")).toBe("needs-letter-and-digit");
    expect(ACCESS_CODE_ERRORS["needs-letter-and-digit"]).toBe(
      "Il codice deve contenere almeno una lettera e almeno una cifra.",
    );
  });

  it("rejects common codes, case-insensitively", () => {
    expect(validateAccessCode("Password123", subject)).toEqual({
      ok: false,
      code: "weak",
      message: "Questo codice è troppo comune. Scegline uno meno prevedibile.",
    });
    expect(errorOf("QWERTY12345")).toBe("weak");
  });

  it("rejects codes containing the email local part, first or last name", () => {
    const p = { ok: false, code: "personal" };
    expect(validateAccessCode("xx-TonyRossi-77", subject)).toMatchObject(p);
    expect(validateAccessCode("fiore9tony9fiore", subject)).toMatchObject(p);
    expect(validateAccessCode("cavallo4rossi4", subject)).toMatchObject(p);
    expect(
      validateAccessCode("zz1tonyrossizz", { email: "tony.rossi@example.test" }),
    ).toMatchObject(p);
    expect(
      validateAccessCode("zz1tonyrossizz", { email: "tony.rossi@example.test" }),
    ).toMatchObject(p);
    expect(validateAccessCode("nome-Jessica-9", { firstName: "Jéssica" })).toMatchObject(p);
    expect(ACCESS_CODE_ERRORS.personal).toBe(
      "Il codice non deve contenere l'email, il nome o il cognome.",
    );
  });

  it("does not let very short names block everything", () => {
    expect(errorOf("pesca7cavallo9", { firstName: "Al", email: "a@example.test" })).toBeNull();
  });

  it("keeps ~200 weak entries, all lowercase", () => {
    expect(WEAK_CODES_SET.size).toBeGreaterThanOrEqual(200);
    for (const c of WEAK_CODES_SET) expect(c).toBe(c.toLowerCase());
  });
});

describe("generateAccessCode", () => {
  it("uses groups of 4 over the unambiguous alphabet and passes the policy", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateAccessCode();
      expect(code).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
      for (const ch of code.replaceAll("-", "")) expect(ACCESS_CODE_ALPHABET).toContain(ch);
      expect(code).toMatch(/[a-z]/);
      expect(code).toMatch(/[2-9]/);
      expect(validateAccessCode(code)).toEqual({ ok: true });
    }
  });

  it("has no ambiguous characters", () => {
    expect(ACCESS_CODE_ALPHABET).not.toMatch(/[ilo01]/);
  });

  it("is random: 500 codes are all different", () => {
    expect(new Set(Array.from({ length: 500 }, () => generateAccessCode())).size).toBe(500);
  });

  it("is uniform over the alphabet (loose chi-square)", () => {
    const counts = new Map<string, number>();
    let total = 0;
    for (let i = 0; i < 2000; i++) {
      for (const ch of generateAccessCode().replaceAll("-", "")) {
        counts.set(ch, (counts.get(ch) ?? 0) + 1);
        total++;
      }
    }
    const expected = total / ACCESS_CODE_ALPHABET.length;
    for (const ch of ACCESS_CODE_ALPHABET) {
      expect(Math.abs((counts.get(ch) ?? 0) - expected) / expected).toBeLessThan(0.15);
    }
  });

  it("rejects biased bytes (>= 248) instead of using modulo", () => {
    // Bytes 248..255 would favour the first alphabet symbols; they must be skipped.
    const stream = [255, 250, 248, 0, 25, 1, 26, 2, 27, 3, 28, 4, 29, 5, 30, 6];
    let pos = 0;
    const random = (a: Uint8Array) => a.map(() => stream[pos++ % stream.length]!);
    const code = generateAccessCode({ random }).replaceAll("-", "");
    expect(code.startsWith("a4")).toBe(true);
  });

  it("supports a custom length and validates it", () => {
    expect(generateAccessCode({ length: 16 }).replaceAll("-", "")).toHaveLength(16);
    expect(() => generateAccessCode({ length: 9 })).toThrow(RangeError);
    expect(() => generateAccessCode({ length: 65 })).toThrow(RangeError);
  });

  it("retries when a draw has no digit", () => {
    let draw = 0;
    const random = (a: Uint8Array) => {
      draw++;
      return a.map((_, i) => (draw === 1 ? 0 : i % 2 === 0 ? 0 : 25));
    };
    const code = generateAccessCode({ random });
    expect(draw).toBeGreaterThan(1);
    expect(code).toMatch(/[a-z]/);
    expect(code).toMatch(/[2-9]/);
  });
});
