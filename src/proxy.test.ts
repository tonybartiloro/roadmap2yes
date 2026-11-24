import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The proxy is tested in isolation: Supabase and the guard rules (T7a) are mocked, so these tests
// only prove the mechanics (claims resolution, outage classification, decision application,
// headers) and keep passing when T7a replaces the guard implementation.
const getClaims = vi.fn();
const evaluateGuards = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({ auth: { getClaims } })),
}));
vi.mock("@/features/auth/guards", () => ({ evaluateGuards }));

const { proxy } = await import("./proxy");

function request(path: string): NextRequest {
  return new NextRequest(new URL(path, "http://localhost:3000"));
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54421");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_fake");
  getClaims.mockReset();
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
  it.each(["/invito/abc", "/auth/conferma", "/email/disattiva", "/invito"])(
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
