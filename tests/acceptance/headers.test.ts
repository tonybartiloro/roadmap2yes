import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWedding, signInAs, stackEnv, type TestWedding } from "../support/supabase";

/**
 * QA T17a: security headers, noindex and no-store on the BUILT app (`next start`), AC1 + NFR
 * (plan 4.7 and the test row "Sicurezza e cache").
 *
 * NEEDS A BUILT APP AND THE LOCAL SUPABASE STACK. How it runs:
 *  - `HEADERS_BASE_URL=http://127.0.0.1:3000` -> uses an already running `next start` (what the CI
 *    `e2e-*` jobs have after `npm run build`);
 *  - otherwise, when `.next/BUILD_ID` exists, it starts `next start` itself on `HEADERS_PORT` (3310)
 *    with the local stack's keys and stops it afterwards;
 *  - with neither, the whole file is SKIPPED (reported as skipped, never as passed): run
 *    `npm run build` first. CI builds before the integration job's headers step, see ci.yml.
 * Headers live in next.config.ts (build time) and src/proxy.ts (runtime), so only a built server
 * proves them.
 */

const ROOT = resolve(__dirname, "../..");
/** Directory holding the built app (default: this repo). Lets QA test a build made elsewhere, e.g. a clean checkout. */
const APP_DIR = process.env["HEADERS_APP_DIR"] ? resolve(process.env["HEADERS_APP_DIR"]) : ROOT;
const EXTERNAL = process.env["HEADERS_BASE_URL"];
const PORT = Number(process.env["HEADERS_PORT"] ?? 3310);
const BUILT = existsSync(resolve(APP_DIR, ".next/BUILD_ID"));
const runnable = Boolean(EXTERNAL) || BUILT;

// CI sets HEADERS_REQUIRED=1: a missing build must FAIL the run, never skip silently.
if (process.env["HEADERS_REQUIRED"] === "1" && !runnable) {
  throw new Error("HEADERS_REQUIRED=1 but there is no .next/BUILD_ID and no HEADERS_BASE_URL");
}

let base = EXTERNAL ?? `http://127.0.0.1:${PORT}`;
let server: ChildProcess | undefined;

async function waitUntilReady(url: string, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await fetch(`${url}/servizio`, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) throw new Error(`next start did not answer on ${url}`);
    await new Promise((r) => setTimeout(r, 400));
  }
}

const get = (path: string, init: RequestInit = {}) =>
  fetch(`${base}${path}`, { redirect: "manual", ...init });

/** `sb-<first host label>-auth-token` cookie(s) exactly as @supabase/ssr writes them (base64url, 3180-char chunks). */
async function sessionCookie(client: Awaited<ReturnType<typeof signInAs>>): Promise<string> {
  const { url } = stackEnv();
  const session = (await client.auth.getSession()).data.session;
  if (!session) throw new Error("no session");
  const name = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
  const chunks = value.match(/.{1,3180}/g) ?? [value];
  return chunks.length === 1
    ? `${name}=${value}`
    : chunks.map((c, i) => `${name}.${i}=${c}`).join("; ");
}

const PUBLIC_PATHS = [
  "/servizio",
  "/accesso",
  "/invito/abc",
  "/auth/conferma",
  "/email/disattiva",
  "/robots.txt",
  "/percorso-che-non-esiste",
];
const PRIVATE_PATHS = ["/", "/percorso", "/scelte", "/budget", "/altro/account"];

describe.skipIf(!runnable)("headers of the built app", () => {
  beforeAll(async () => {
    if (EXTERNAL) {
      await waitUntilReady(base);
      return;
    }
    const env = stackEnv();
    base = `http://127.0.0.1:${PORT}`;
    server = spawn(
      process.execPath,
      [
        resolve(ROOT, "node_modules/next/dist/bin/next"),
        "start",
        "-H",
        "127.0.0.1",
        "-p",
        String(PORT),
      ],
      {
        cwd: APP_DIR,
        stdio: "ignore",
        env: {
          ...process.env,
          NODE_ENV: "production",
          NEXT_PUBLIC_SUPABASE_URL: env.url,
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: env.publishableKey,
          SUPABASE_SECRET_KEY: env.secretKey,
          NEXT_PUBLIC_SITE_URL: base,
        },
      },
    );
    await waitUntilReady(base);
  }, 120_000);

  afterAll(() => {
    server?.kill("SIGTERM");
  });

  describe.each([...PUBLIC_PATHS, ...PRIVATE_PATHS])("security headers on %s", (path) => {
    it("sends noindex, anti-framing, nosniff, a restrictive CSP, HSTS and no X-Powered-By", async () => {
      const response = await get(path);
      const h = response.headers;
      expect(h.get("x-robots-tag")).toMatch(/noindex/i);
      expect(h.get("x-robots-tag")).toMatch(/nofollow/i);
      expect(h.get("x-frame-options")).toBe("DENY");
      expect(h.get("x-content-type-options")).toBe("nosniff");
      expect(h.get("permissions-policy")).toMatch(/camera=\(\)/);
      expect(h.get("strict-transport-security")).toMatch(/max-age=\d{7,}/);
      expect(h.get("x-powered-by")).toBeNull();
      const csp = h.get("content-security-policy") ?? "";
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).toContain("form-action 'self'");
      expect(csp, "no eval in production").not.toMatch(/unsafe-eval/);
      expect(csp, "connect-src must allow only self and the backend").toMatch(
        /connect-src 'self'( http:\/\/127\.0\.0\.1:\d+)?(;|$)/,
      );
    });
  });

  describe("Referrer-Policy", () => {
    it.each(["/invito/abc", "/invito", "/auth/conferma", "/auth/avanti", "/email/disattiva"])(
      "%s: no-referrer (the URL carries a token)",
      async (path) => {
        expect((await get(path)).headers.get("referrer-policy")).toBe("no-referrer");
      },
    );
    it.each(["/accesso", "/servizio", "/", "/percorso"])(
      "%s: strict-origin-when-cross-origin",
      async (path) => {
        expect((await get(path)).headers.get("referrer-policy")).toBe(
          "strict-origin-when-cross-origin",
        );
      },
    );
  });

  describe("robots and indexing", () => {
    it("robots.txt disallows everything for every agent", async () => {
      const response = await get("/robots.txt");
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toMatch(/User-Agent: \*/i);
      expect(text).toMatch(/Disallow: \//);
      expect(text).not.toMatch(/Allow: \/\s*$/m);
    });
    it("no page offers itself to crawlers: the pages carry the noindex header and no sitemap exists", async () => {
      // an unknown path is private: never served (redirect to the login, or 404), never a 200 sitemap
      expect((await get("/sitemap.xml")).status).not.toBe(200);
      const html = await (await get("/servizio")).text();
      expect(html).not.toMatch(
        /<meta[^>]+name="robots"[^>]+content="[^"]*index(?!,?\s*nofollow)[^"]*"/i,
      );
    });
  });

  describe("private routes without a session (AC1)", () => {
    it.each(PRIVATE_PATHS)(
      "%s redirects to /accesso, no-store, with no data in the answer",
      async (path) => {
        const response = await get(path);
        expect(response.status).toBeGreaterThanOrEqual(300);
        expect(response.status).toBeLessThan(400);
        expect(new URL(response.headers.get("location") ?? "", base).pathname).toBe("/accesso");
        expect(response.headers.get("cache-control")).toMatch(/no-store/);
        expect(response.headers.get("cache-control")).toMatch(/private/);
        expect((await response.text()).length).toBeLessThan(500);
      },
    );

    it("the cron API without credentials is refused with no body (401/403), no-store", async () => {
      const response = await get("/api/cron/daily");
      expect([401, 403]).toContain(response.status);
      expect(response.headers.get("cache-control")).toMatch(/no-store/);
    });
  });

  describe("authenticated responses are never cacheable and never leak between sessions", () => {
    let w1: TestWedding;
    let w2: TestWedding;
    let cookie1: string;
    let cookie2: string;

    beforeAll(async () => {
      w1 = await createWedding("sposo");
      w2 = await createWedding("sposa");
      cookie1 = await sessionCookie(w1.founderClient);
      cookie2 = await sessionCookie(w2.founderClient);
    }, 30_000);

    it.each(PRIVATE_PATHS)(
      "%s: Cache-Control private, no-store; no shared-cache markers",
      async (path) => {
        for (const cookie of [cookie1, cookie2]) {
          const response = await get(path, { headers: { cookie } });
          expect(response.status, path).toBeLessThan(500);
          const cacheControl = response.headers.get("cache-control") ?? "";
          expect(cacheControl, path).toMatch(/no-store/);
          expect(cacheControl, path).toMatch(/private/);
          expect(cacheControl, path).not.toMatch(/public|s-maxage|max-age=[1-9]/);
          expect(response.headers.get("x-nextjs-cache"), path).toBeNull();
          expect(response.headers.get("age"), path).toBeNull();
          expect(response.headers.get("x-robots-tag"), path).toMatch(/noindex/i);
          await response.arrayBuffer();
        }
      },
    );

    it("two sessions alternated on the same URLs: nothing of A's wedding in B's pages and vice versa; a request without cookie is still sent to /accesso", async () => {
      const secrets = (w: TestWedding) => [w.founder.email, w.weddingId, w.founder.id];
      for (let round = 0; round < 3; round++) {
        for (const path of PRIVATE_PATHS) {
          const a = await get(path, { headers: { cookie: cookie1 } });
          const anonymous = await get(path);
          const b = await get(path, { headers: { cookie: cookie2 } });
          const bodyA = await a.text();
          const bodyB = await b.text();
          await anonymous.arrayBuffer();
          for (const secret of secrets(w2))
            expect(bodyA, `${path} round ${round}: B's value in A's page`).not.toContain(secret);
          for (const secret of secrets(w1))
            expect(bodyB, `${path} round ${round}: A's value in B's page`).not.toContain(secret);
          expect(anonymous.status, `${path}: anonymous after authenticated`).toBeGreaterThanOrEqual(
            300,
          );
          expect(anonymous.status).toBeLessThan(400);
          expect(new URL(anonymous.headers.get("location") ?? "", base).pathname).toBe("/accesso");
        }
      }
    });
  });
});

// Always-present marker so a skipped file is visible in the report with its reason.
describe.skipIf(runnable)("headers of the built app (SKIPPED: no build)", () => {
  it.skip("needs `npm run build` (or HEADERS_BASE_URL pointing at a running `next start`)", () => {});
});
