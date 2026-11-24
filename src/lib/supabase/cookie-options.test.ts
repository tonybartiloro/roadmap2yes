import { describe, expect, it } from "vitest";
import { authCookieOptions } from "./cookie-options";

describe("authCookieOptions (R26: the session is never readable by page scripts)", () => {
  it("is always httpOnly, lax and site-wide", () => {
    expect(authCookieOptions({})).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
  });

  it("is Secure on Vercel or with an https site URL, and works over plain http locally", () => {
    expect(authCookieOptions({ VERCEL: "1" }).secure).toBe(true);
    expect(authCookieOptions({ NEXT_PUBLIC_SITE_URL: "https://example.test" }).secure).toBe(true);
    expect(authCookieOptions({ NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3000" }).secure).toBe(false);
    expect(authCookieOptions({}).secure).toBe(false);
  });
});
