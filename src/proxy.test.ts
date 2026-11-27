import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The proxy is tested in isolation: Supabase and the guard rules (T7a) are mocked, so these tests
// only prove the mechanics (claims resolution, outage classification, decision application,
// headers) and keep passing when T7a replaces the guard implementation.
const getClaims = vi.fn();
const evaluateGuards = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({ auth: { getClaims } })),
}));
const rsvpGate = vi.fn();
vi.mock("@/features/auth/guards", () => ({ evaluateGuards }));
const rsvpLoadPage = vi.fn();
vi.mock("@/features/rsvp/public-rpc", () => ({ rsvpGate, rsvpLoadPage }));

const { proxy } = await import("./proxy");

function request(path: string): NextRequest {
  return new NextRequest(new URL(path, "http://localhost:3000"));
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54421");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_fake");
  getClaims.mockReset();
  rsvpGate.mockReset().mockResolvedValue({ blocked: false, retryAfterSeconds: 0, themeId: null });
  rsvpLoadPage.mockReset().mockResolvedValue({ state: "ok" });
  evaluateGuards.mockReset();
  evaluateGuards.mockResolvedValue({ action: "next" });
  getClaims.mockResolvedValue({ data: null, error: null });
});

describe("proxy: session cookies", () => {
  it("creates the Supabase client with httpOnly, lax, site-wide cookies", async () => {
    const { createServerClient } = await import("@supabase/ssr");
    vi.mocked(createServerClient).mockClear();
    await proxy(request("/percorso"));
    expect(vi.mocked(createServerClient).mock.calls[0]?.[2]).toMatchObject({
      cookieOptions: { httpOnly: true, sameSite: "lax", path: "/" },
    });
  });
});

describe("proxy: outages (QA-7, QA-8, AC39)", () => {
  type Opts = {
    cookies: { setAll(list: { name: string; value: string; options?: object }[]): void };
  };

  it("a backend that never answers is cut at the timeout and reported as unreachable", async () => {
    vi.useFakeTimers();
    try {
      getClaims.mockImplementation(() => new Promise(() => undefined));
      const pending = proxy(request("/percorso"));
      await vi.advanceTimersByTimeAsync(3100);
      await pending;
      expect(evaluateGuards).toHaveBeenCalledWith(
        expect.objectContaining({ claims: null, backend: "unreachable" }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("the service page does not ask the backend again, and keeps the proxy-owned backend header", async () => {
    await proxy(request("/servizio?motivo=unreachable"));
    expect(getClaims).not.toHaveBeenCalled();
    const outage = new NextRequest(new URL("/servizio?motivo=paused", "http://localhost:3000"), {
      headers: { "x-r2y-backend": "paused" },
    });
    evaluateGuards.mockResolvedValue({ action: "next" });
    const response = await proxy(outage);
    expect(response.headers.get("x-middleware-request-x-r2y-backend")).toBe("paused");
  });

  it("a client-sent backend header is still stripped on every other page", async () => {
    const forged = new NextRequest(new URL("/percorso", "http://localhost:3000"), {
      headers: { "x-r2y-backend": "paused" },
    });
    const response = await proxy(forged);
    expect(response.headers.get("x-middleware-request-x-r2y-backend")).toBeNull();
  });

  it("hands the client a fetch with a timeout, so no single call can hang", async () => {
    const { createServerClient } = await import("@supabase/ssr");
    vi.mocked(createServerClient).mockClear();
    await proxy(request("/percorso"));
    const options = vi.mocked(createServerClient).mock.calls[0]?.[2] as {
      global?: { fetch?: unknown };
    };
    expect(typeof options.global?.fetch).toBe("function");
  });

  it("never sends cookie deletions to the browser when the failure is an outage", async () => {
    const { createServerClient } = await import("@supabase/ssr");
    vi.mocked(createServerClient).mockClear();
    getClaims.mockImplementation(async () => {
      // what auth-js does after a refused refresh (e.g. a 540): it drops the session
      const options = vi.mocked(createServerClient).mock.calls[0]?.[2] as unknown as Opts;
      options.cookies.setAll([{ name: "sb-127-auth-token", value: "", options: { maxAge: 0 } }]);
      return { data: null, error: { name: "AuthApiError", message: "", status: 540 } };
    });
    evaluateGuards.mockResolvedValue({ action: "rewrite", to: "/servizio?motivo=paused" });
    const response = await proxy(request("/percorso"));
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("still sends the cookie changes of a real rejection (not an outage)", async () => {
    const { createServerClient } = await import("@supabase/ssr");
    vi.mocked(createServerClient).mockClear();
    getClaims.mockImplementation(async () => {
      const options = vi.mocked(createServerClient).mock.calls[0]?.[2] as unknown as Opts;
      options.cookies.setAll([{ name: "sb-127-auth-token", value: "", options: { maxAge: 0 } }]);
      return {
        data: null,
        error: { name: "AuthApiError", message: "Invalid Refresh Token", status: 400 },
      };
    });
    const response = await proxy(request("/percorso"));
    expect(response.headers.get("set-cookie")).toContain("sb-127-auth-token");
  });
});

describe("proxy: session resolution", () => {
  it("passes verified claims to the guards", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "u1" } }, error: null });
    await proxy(request("/percorso"));
    expect(evaluateGuards).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: "/percorso", claims: { sub: "u1" }, backend: "ok" }),
    );
  });

  it("passes null claims and backend ok when there is no session", async () => {
    await proxy(request("/percorso"));
    expect(evaluateGuards).toHaveBeenCalledWith(
      expect.objectContaining({ claims: null, backend: "ok" }),
    );
  });

  it("treats an ordinary auth error (invalid session) as not signed in, not as an outage", async () => {
    getClaims.mockResolvedValue({
      data: null,
      error: { name: "AuthSessionMissingError", message: "Auth session missing!", status: 400 },
    });
    await proxy(request("/percorso"));
    expect(evaluateGuards).toHaveBeenCalledWith(
      expect.objectContaining({ claims: null, backend: "ok" }),
    );
  });

  it("reports `paused` on HTTP 540", async () => {
    getClaims.mockResolvedValue({
      data: null,
      error: { name: "AuthApiError", message: "", status: 540 },
    });
    await proxy(request("/"));
    expect(evaluateGuards).toHaveBeenCalledWith(
      expect.objectContaining({ claims: null, backend: "paused" }),
    );
  });

  it("reports `unreachable` when the call throws a network error", async () => {
    getClaims.mockRejectedValue(new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } }));
    await proxy(request("/"));
    expect(evaluateGuards).toHaveBeenCalledWith(
      expect.objectContaining({ claims: null, backend: "unreachable" }),
    );
  });

  it("fails closed (no claims) on an unknown thrown error", async () => {
    getClaims.mockRejectedValue(new Error("boom"));
    await proxy(request("/"));
    expect(evaluateGuards).toHaveBeenCalledWith(
      expect.objectContaining({ claims: null, backend: "ok" }),
    );
  });
});

describe("proxy: applying the decision", () => {
  it("redirects", async () => {
    evaluateGuards.mockResolvedValue({ action: "redirect", to: "/accesso" });
    const response = await proxy(request("/percorso"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/accesso");
  });

  it("rewrites to /servizio without redirecting (URL stays)", async () => {
    evaluateGuards.mockResolvedValue({ action: "rewrite", to: "/servizio?motivo=paused" });
    const response = await proxy(request("/percorso"));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "http://localhost:3000/servizio?motivo=paused",
    );
    expect(response.headers.get("location")).toBeNull();
  });

  it("denies data APIs with the given status and an empty body", async () => {
    evaluateGuards.mockResolvedValue({ action: "deny", status: 401 });
    const response = await proxy(request("/api/anything"));
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("");
  });

  it("continues", async () => {
    const response = await proxy(request("/"));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});

describe("proxy: headers", () => {
  it.each(["/invito/abc", "/auth/conferma", "/email/disattiva", "/invito", "/rsvp/abc"])(
    "sends Referrer-Policy: no-referrer on %s",
    async (path) => {
      const response = await proxy(request(path));
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    },
  );

  it.each(["/", "/percorso", "/accesso", "/invitofake", "/emailing"])(
    "sends strict-origin-when-cross-origin on %s",
    async (path) => {
      const response = await proxy(request(path));
      expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    },
  );

  it("marks every proxied response as non-cacheable", async () => {
    for (const decision of [
      { action: "next" },
      { action: "redirect", to: "/accesso" },
      { action: "rewrite", to: "/servizio?motivo=unreachable" },
      { action: "deny", status: 401 },
    ]) {
      evaluateGuards.mockResolvedValue(decision);
      const response = await proxy(request("/percorso"));
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
  });
});

describe("proxy: x-r2y-backend (proxy-owned header)", () => {
  const forwardedHeader = (response: Response) =>
    response.headers.get("x-middleware-request-x-r2y-backend");

  it("sets it on the outage rewrite so the root layout skips the database", async () => {
    getClaims.mockResolvedValue({
      data: null,
      error: { name: "AuthApiError", message: "", status: 540 },
    });
    evaluateGuards.mockResolvedValue({ action: "rewrite", to: "/servizio?motivo=paused" });
    expect(forwardedHeader(await proxy(request("/percorso")))).toBe("paused");
  });

  it("strips a client-supplied value on every other request", async () => {
    const spoofed = new NextRequest(new URL("/percorso", "http://localhost:3000"), {
      headers: { "x-r2y-backend": "paused" },
    });
    expect(forwardedHeader(await proxy(spoofed))).toBeNull();
  });

  it("does not set it on a rewrite that is not an outage", async () => {
    evaluateGuards.mockResolvedValue({ action: "rewrite", to: "/altro" });
    expect(forwardedHeader(await proxy(request("/x")))).toBeNull();
  });
});

describe("proxy: RSVP gate on /rsvp/{token} (AC10)", () => {
  const TOKEN = "A".repeat(43);
  const theme = (response: Response) => response.headers.get("x-middleware-request-x-r2y-theme");

  it("answers 429 with Retry-After, X-Robots-Tag, no-store, no-referrer and an accessible page", async () => {
    rsvpGate.mockResolvedValue({ blocked: true, retryAfterSeconds: 640, themeId: null });
    const response = await proxy(request(`/rsvp/${TOKEN}`));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("640");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain('<html lang="it">');
    expect(html).toContain("width=device-width");
    expect(html).toContain("color-scheme");
    expect(html).toContain("prefers-color-scheme:dark");
    expect(html).toContain("Troppi tentativi: riprova tra 15 minuti");
    expect(html).toContain("font:18px");
    expect(html).not.toContain("<script");
    expect(html).not.toContain(TOKEN);
  });

  it("never sends a Retry-After below 1", async () => {
    rsvpGate.mockResolvedValue({ blocked: true, retryAfterSeconds: 0, themeId: null });
    expect((await proxy(request(`/rsvp/${TOKEN}`))).headers.get("retry-after")).toBe("1");
  });

  it("forwards the wedding theme to the page when the link works", async () => {
    rsvpGate.mockResolvedValue({ blocked: false, retryAfterSeconds: 0, themeId: "velluto" });
    const response = await proxy(request(`/rsvp/${TOKEN}`));
    expect(response.status).toBe(200);
    expect(theme(response)).toBe("velluto");
  });

  it("ignores a theme id that is not approved, and a gate that fails or times out (fail-open)", async () => {
    rsvpGate.mockResolvedValue({ blocked: false, retryAfterSeconds: 0, themeId: "<x>" });
    expect(theme(await proxy(request(`/rsvp/${TOKEN}`)))).toBeNull();
    rsvpGate.mockResolvedValue(null);
    const response = await proxy(request(`/rsvp/${TOKEN}`));
    expect(response.status).toBe(200);
    expect(theme(response)).toBeNull();
  });

  it("strips a client-sent x-r2y-theme on every path, RSVP or not", async () => {
    const forged = (path: string) =>
      new NextRequest(new URL(path, "http://localhost:3000"), {
        headers: { "x-r2y-theme": "velluto" },
      });
    expect(theme(await proxy(forged("/percorso")))).toBeNull();
    expect(theme(await proxy(forged("/servizio")))).toBeNull();
    // gate says "no theme" (unknown link): the forged one must not survive
    expect(theme(await proxy(forged(`/rsvp/${TOKEN}`)))).toBeNull();
  });

  it.each(["/rsvp", "/rsvp/", `/rsvp/${TOKEN}/x`])(
    "does not touch the DB for %s (not a token path)",
    async (path) => {
      await proxy(request(path));
      expect(rsvpGate).not.toHaveBeenCalled();
      expect(rsvpLoadPage).not.toHaveBeenCalled();
    },
  );

  describe("the neutral 404 answered by the proxy (Arbitrato S3)", () => {
    const body = async (response: Response) => response.text();
    const check = (response: Response) => {
      expect(response.status).toBe(404);
      expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect(response.headers.get("retry-after")).toBeNull();
    };

    it.each(["/rsvp/short", `/rsvp/${"A".repeat(44)}`, `/rsvp/${"é".repeat(43)}`])(
      "answers it for the malformed %s without any DB call",
      async (path) => {
        const response = await proxy(request(path));
        check(response);
        expect(await body(response)).toContain("Questo link non funziona più");
        expect(rsvpGate).not.toHaveBeenCalled();
        expect(rsvpLoadPage).not.toHaveBeenCalled();
      },
    );

    it("is byte-identical for a malformed token and a link that does not work", async () => {
      const malformed = await body(await proxy(request("/rsvp/short")));
      rsvpLoadPage.mockResolvedValue({ state: "neutral" });
      const dead = await proxy(request(`/rsvp/${TOKEN}`));
      check(dead);
      expect(await body(dead)).toBe(malformed);
      expect(malformed).not.toContain("<script");
      expect(malformed).not.toContain(TOKEN);
    });

    it("asks rsvp_page once, bounded and with the request IP and clock, only when the gate has no theme", async () => {
      rsvpLoadPage.mockResolvedValue({ state: "neutral" });
      await proxy(
        new NextRequest(new URL(`/rsvp/${TOKEN}`, "http://localhost:3000"), {
          headers: { "x-forwarded-for": "203.0.113.7" },
        }),
      );
      expect(rsvpLoadPage).toHaveBeenCalledTimes(1);
      expect(rsvpLoadPage).toHaveBeenCalledWith(
        expect.objectContaining({ token: TOKEN, ip: "203.0.113.7", timeoutMs: 3000 }),
      );
    });

    it("lets the request through (fail-open) on ok, retry or a timeout", async () => {
      for (const state of [{ state: "ok" }, { state: "retry" }]) {
        rsvpLoadPage.mockResolvedValue(state);
        expect((await proxy(request(`/rsvp/${TOKEN}`))).status).toBe(200);
      }
    });

    it("never calls rsvp_page for a working link, a blocked IP, a failed gate or a POST", async () => {
      rsvpGate.mockResolvedValue({ blocked: false, retryAfterSeconds: 0, themeId: "velluto" });
      await proxy(request(`/rsvp/${TOKEN}`));
      rsvpGate.mockResolvedValue({ blocked: true, retryAfterSeconds: 60, themeId: null });
      await proxy(request(`/rsvp/${TOKEN}`));
      rsvpGate.mockResolvedValue(null);
      await proxy(request(`/rsvp/${TOKEN}`));
      await proxy(
        new NextRequest(new URL(`/rsvp/${TOKEN}`, "http://localhost:3000"), { method: "POST" }),
      );
      expect(rsvpLoadPage).not.toHaveBeenCalled();
    });
  });

  it("does not call the gate on an outage, or when the guards do not let the request through", async () => {
    getClaims.mockResolvedValue({
      data: null,
      error: { name: "AuthApiError", message: "", status: 540 },
    });
    evaluateGuards.mockResolvedValue({ action: "rewrite", to: "/servizio?motivo=paused" });
    await proxy(request(`/rsvp/${TOKEN}`));
    expect(rsvpGate).not.toHaveBeenCalled();
    getClaims.mockResolvedValue({ data: null, error: null });
    for (const decision of [
      { action: "redirect", to: "/accesso" },
      { action: "deny", status: 401 },
      { action: "rewrite", to: "/altro" },
    ]) {
      evaluateGuards.mockResolvedValue(decision);
      await proxy(request(`/rsvp/${TOKEN}`));
    }
    expect(rsvpGate).not.toHaveBeenCalled();
  });

  it("gates only GET and HEAD: a server-action POST reaches the page (REV-112)", async () => {
    rsvpGate.mockResolvedValue({ blocked: true, retryAfterSeconds: 640, themeId: null });
    for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
      const response = await proxy(
        new NextRequest(new URL(`/rsvp/${TOKEN}`, "http://localhost:3000"), { method }),
      );
      expect(response.status).toBe(200);
    }
    expect(rsvpGate).not.toHaveBeenCalled();
    const head = await proxy(
      new NextRequest(new URL(`/rsvp/${TOKEN}`, "http://localhost:3000"), { method: "HEAD" }),
    );
    expect(head.status).toBe(429);
  });

  it("decodes the token once, so an escaped spelling cannot skip the gate (REV-111)", async () => {
    await proxy(request(`/rsvp/%41${"A".repeat(42)}`));
    expect(rsvpGate).toHaveBeenCalledWith(expect.objectContaining({ token: TOKEN }));
    rsvpGate.mockClear();
    // an escape that decodes to something that is not a token, and a malformed escape: neutral 404, no gate, no throw
    for (const path of [
      `/rsvp/%2F${"A".repeat(42)}`,
      `/rsvp/%E0%A4%A${"A".repeat(38)}`,
      `/rsvp/%ZZ${"A".repeat(41)}`,
    ]) {
      expect((await proxy(request(path))).status).toBe(404);
    }
    expect(rsvpGate).not.toHaveBeenCalled();
  });

  it("is a bounded call with the request IP (never from the client body or query)", async () => {
    const withIp = new NextRequest(new URL(`/rsvp/${TOKEN}?ip=9.9.9.9`, "http://localhost:3000"), {
      headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
    });
    await proxy(withIp);
    expect(rsvpGate).toHaveBeenCalledWith(
      expect.objectContaining({ token: TOKEN, ip: "203.0.113.7", timeoutMs: 3000 }),
    );
    await proxy(request(`/rsvp/${TOKEN}`));
    expect(rsvpGate).toHaveBeenLastCalledWith(expect.objectContaining({ ip: null }));
  });

  describe("p_now comes only from resolveNow() on the request cookie (QA-1)", () => {
    const WHEN = "2027-03-28T23:30:00.000Z";
    const withClock = () =>
      new NextRequest(new URL(`/rsvp/${TOKEN}`, "http://localhost:3000"), {
        headers: { cookie: `r2y-test-now=${WHEN}` },
      });
    const nowGiven = () => (rsvpGate.mock.calls.at(-1)?.[0] as { now: Date }).now;
    afterEach(() => vi.unstubAllEnvs());

    it("honours the cookie only with E2E_CLOCK=1 and no VERCEL", async () => {
      vi.stubEnv("E2E_CLOCK", "1");
      vi.stubEnv("VERCEL", undefined);
      await proxy(withClock());
      expect(nowGiven().toISOString()).toBe(WHEN);
    });

    it("ignores the cookie without E2E_CLOCK", async () => {
      vi.stubEnv("E2E_CLOCK", "");
      await proxy(withClock());
      expect(Math.abs(nowGiven().getTime() - Date.now())).toBeLessThan(5000);
    });

    it("ignores the cookie when VERCEL is defined, whatever E2E_CLOCK says", async () => {
      vi.stubEnv("E2E_CLOCK", "1");
      vi.stubEnv("VERCEL", "1");
      await proxy(withClock());
      expect(Math.abs(nowGiven().getTime() - Date.now())).toBeLessThan(5000);
    });
  });
});
