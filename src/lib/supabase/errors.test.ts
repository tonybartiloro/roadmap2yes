import { describe, expect, it } from "vitest";
import { classifyDbError } from "./errors";

describe("classifyDbError: paused", () => {
  it("HTTP 540 on a supabase-js error", () => {
    expect(classifyDbError({ name: "AuthApiError", message: "x", status: 540 })).toBe("paused");
  });
  it("HTTP 540 inside the { error } wrapper", () => {
    expect(classifyDbError({ data: null, error: { message: "", status: 540 } })).toBe("paused");
  });
  it("PostgREST-shaped error whose text says the project is paused", () => {
    expect(classifyDbError({ message: "Project is paused", details: "", hint: "", code: "" })).toBe(
      "paused",
    );
    expect(classifyDbError(new Error("Your project paused due to inactivity"))).toBe("paused");
    expect(classifyDbError("project paused")).toBe("paused");
  });
  it("540 wins over generic 5xx handling", () => {
    expect(classifyDbError({ status: 540, message: "bad gateway" })).toBe("paused");
  });
});

describe("classifyDbError: unreachable", () => {
  it("fetch failed TypeError with ECONNREFUSED cause (undici)", () => {
    const error = new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } });
    expect(classifyDbError(error)).toBe("unreachable");
  });
  it("fetch failed TypeError without cause", () => {
    expect(classifyDbError(new TypeError("fetch failed"))).toBe("unreachable");
  });
  it("browser 'Failed to fetch'", () => {
    expect(classifyDbError(new TypeError("Failed to fetch"))).toBe("unreachable");
  });
  it("AuthRetryableFetchError (status 0 / network)", () => {
    expect(
      classifyDbError({ name: "AuthRetryableFetchError", message: "fetch failed", status: 0 }),
    ).toBe("unreachable");
  });
  it("timeout / abort", () => {
    const abort = new Error("The operation was aborted");
    abort.name = "AbortError";
    expect(classifyDbError(abort)).toBe("unreachable");
    const timeout = new Error("signal timed out");
    timeout.name = "TimeoutError";
    expect(classifyDbError(timeout)).toBe("unreachable");
  });
  it.each([500, 502, 503, 504])("HTTP %i", (status) => {
    expect(classifyDbError({ message: "Server error", status })).toBe("unreachable");
  });
  it.each(["ENOTFOUND", "ETIMEDOUT", "ECONNRESET", "EAI_AGAIN"])("network code %s", (code) => {
    expect(classifyDbError({ message: "x", code })).toBe("unreachable");
  });
  it("PostgREST cannot connect to the database (PGRST000)", () => {
    expect(
      classifyDbError({
        code: "PGRST000",
        message: "Could not connect with the database",
        details: null,
        hint: null,
      }),
    ).toBe("unreachable");
  });
});

describe("classifyDbError: not an outage", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    [
      "RLS violation",
      {
        code: "42501",
        message: "new row violates row-level security policy",
        details: null,
        hint: null,
      },
    ],
    [
      "unique violation",
      { code: "23505", message: "duplicate key value", details: "x", hint: null },
    ],
    ["auth 400", { name: "AuthApiError", message: "Invalid login credentials", status: 400 }],
    ["auth 429", { name: "AuthApiError", message: "rate limit", status: 429 }],
    ["404", { message: "not found", status: 404 }],
    ["plain Error", new Error("boom")],
    ["unrelated string", "something else"],
    ["number", 42],
  ])("%s", (_name, error) => {
    expect(classifyDbError(error)).toBeNull();
  });

  it("a database statement timeout (SQLSTATE 57014) is an application error", () => {
    expect(
      classifyDbError({ code: "57014", message: "canceling statement due to statement timeout" }),
    ).toBeNull();
  });

  it("a PostgREST error mentioning 'timeout' in a business message is not forced to unreachable when it has a status", () => {
    expect(
      classifyDbError({ code: "P0001", message: "statement timeout", status: 400 }),
    ).toBeNull();
  });
});
