import { describe, expect, it } from "vitest";
import { isTestClockAllowed, resolveNow } from "./clock";

const REAL = new Date("2026-11-24T10:00:00Z");
const real = () => REAL;
const COOKIE = "2027-03-28T23:30:00Z";

describe("isTestClockAllowed", () => {
  it("is allowed only with E2E_CLOCK=1 and no VERCEL", () => {
    expect(isTestClockAllowed({ E2E_CLOCK: "1" })).toBe(true);
  });

  it.each([
    ["E2E_CLOCK missing", {}],
    ["E2E_CLOCK=0", { E2E_CLOCK: "0" }],
    ["E2E_CLOCK=true (strict '1')", { E2E_CLOCK: "true" }],
    ["E2E_CLOCK empty", { E2E_CLOCK: "" }],
    ["VERCEL set", { E2E_CLOCK: "1", VERCEL: "1" }],
    ["VERCEL set to empty string", { E2E_CLOCK: "1", VERCEL: "" }],
  ])("is refused: %s", (_name, env) => {
    expect(isTestClockAllowed(env)).toBe(false);
  });
});

describe("resolveNow", () => {
  it("honours the cookie when E2E_CLOCK=1 and VERCEL is undefined", () => {
    expect(resolveNow({ cookieValue: COOKIE, env: { E2E_CLOCK: "1" }, real })).toEqual(
      new Date(COOKIE),
    );
  });

  it("ignores the cookie without E2E_CLOCK", () => {
    expect(resolveNow({ cookieValue: COOKIE, env: {}, real })).toEqual(REAL);
  });

  it("ignores the cookie on Vercel even with E2E_CLOCK=1", () => {
    expect(resolveNow({ cookieValue: COOKIE, env: { E2E_CLOCK: "1", VERCEL: "1" }, real })).toEqual(
      REAL,
    );
  });

  it("uses the real clock when there is no cookie", () => {
    expect(resolveNow({ env: { E2E_CLOCK: "1" }, real })).toEqual(REAL);
  });

  it.each(["", "not-a-date", "2027-13-45"])("ignores an invalid cookie value %j", (value) => {
    expect(resolveNow({ cookieValue: value, env: { E2E_CLOCK: "1" }, real })).toEqual(REAL);
  });
});
