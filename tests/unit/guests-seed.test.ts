import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * FEAT-2026-003 / ADR-0002: the repository is PUBLIC, so the guests seed may hold invented data only.
 * Every email must be `@example.test` and every phone must follow the fictional pattern
 * `+39 000 000 NNNN` (no real number can start with `+39 000`).
 */
const sql = readFileSync(join(process.cwd(), "supabase/seeds/04_guests.sql"), "utf8");

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g;
const PHONE_LITERAL = /'(\+?[0-9][0-9+()./ -]{5,19})'/g;

describe("guests seed (fake data only)", () => {
  it("has guests to seed (the guard is not vacuous)", () => {
    expect(sql).toMatch(/insert into public\.guests/);
    expect([...sql.matchAll(EMAIL)].length).toBeGreaterThan(0);
    expect([...sql.matchAll(PHONE_LITERAL)].length).toBeGreaterThan(0);
  });

  it("every email is @example.test", () => {
    for (const match of sql.matchAll(EMAIL)) {
      expect(match[0].toLowerCase().endsWith("@example.test")).toBe(true);
    }
  });

  it("every phone is the fictional +39 000 000 NNNN pattern", () => {
    for (const match of sql.matchAll(PHONE_LITERAL)) {
      expect(match[1]).toMatch(/^\+39 000 000 \d{4}$/);
    }
  });

  it("never seeds a real-looking uuid pattern outside the fixed fake ids", () => {
    const ids = [
      ...sql.matchAll(/'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'/g),
    ];
    for (const id of ids) expect(id[1]).toMatch(/^00000000-0000-4000-8000-/);
  });
});
