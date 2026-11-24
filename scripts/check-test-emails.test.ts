import { describe, expect, it } from "vitest";
import { findForbiddenEmailLines } from "./check-test-emails";

// Bad addresses are assembled at runtime so this file itself passes the repository scan.
const at = (local: string, domain: string) => `${local}@${domain}`;

describe("findForbiddenEmailLines", () => {
  it("accepts @example.test addresses (any case, subaddress, dots)", () => {
    expect(
      findForbiddenEmailLines(
        "tony@example.test\nJessica.Rossi+1@EXAMPLE.TEST\nuser_1-x@example.test, other@example.test",
      ),
    ).toEqual([]);
  });

  it.each([
    at("someone", "gmail.com"),
    at("someone", "example.com"),
    at("someone", "example.org"),
    at("someone", "sub.example.test.com"),
    at("a", "b.it"),
    at("someone", "mail.example.test"),
  ])("rejects an address outside the allowed domain (%#)", (address) => {
    expect(findForbiddenEmailLines(`ok line\ncontact ${address} now`)).toEqual([2]);
  });

  it("reports one entry per offending line, 1-based", () => {
    expect(
      findForbiddenEmailLines(
        `${at("a", "gmail.com")} ${at("x", "gmail.com")}\nfine\n${at("b", "yahoo.it")}`,
      ),
    ).toEqual([1, 3]);
  });

  it("ignores version specifiers, scoped packages and SSH git URLs", () => {
    expect(
      findForbiddenEmailLines(
        '"@types/node@24.19.2" next@16.4.6 pkg@1.0.0-beta.2 git@github.com:owner/repo.git',
      ),
    ).toEqual([]);
  });

  it("does not match a bare @mention", () => {
    expect(findForbiddenEmailLines("ping @example.test or @someone")).toEqual([]);
  });
});
