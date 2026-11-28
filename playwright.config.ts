import { defineConfig, devices } from "@playwright/test";
import os from "node:os";
import path from "node:path";

/**
 * Playwright projects (plan §12). Specs are owned by QA (T17); the naming convention below is the
 * contract between this config and the specs:
 *
 *   e2e/*.spec.ts              -> `mobile` (default, Chromium 360 px) and `desktop` (Chromium 1280 px)
 *   e2e/cross-browser.spec.ts  -> `webkit-smoke` only (login, onboarding, Percorso at 390 px;
 *                                 "Playwright WebKit", not Safari)
 *   e2e/*.time.spec.ts         -> `time` only: serial, uses the `r2y-test-now` cookie (E2E_CLOCK=1)
 *   e2e/degraded.spec.ts       -> `degraded` only: second `next start` whose backend is unreachable
 *   e2e/email-off.spec.ts      -> `email-off` only: third `next start` WITHOUT EMAIL_TRANSPORT
 *
 * CI runs `--project=mobile` on every PR (job `e2e-mobile`) and all projects in `e2e-full`.
 * The app must be built first (`npm run build`) with the local Supabase env (`npm run db:env`).
 */
const CI = Boolean(process.env.CI);
const host = "127.0.0.1";

// Non-default ports: 3100-3104 are commonly taken on developer machines.
const PORT_MAIN = Number(process.env.E2E_PORT ?? 3000);
const PORT_DEGRADED = Number(process.env.E2E_DEGRADED_PORT ?? 3201);
const PORT_EMAIL_OFF = Number(process.env.E2E_EMAIL_OFF_PORT ?? 3202);
/** Closed port by default; QA's `stub-supabase` can listen here to answer 540 ("paused"). */
const DEGRADED_BACKEND_URL = process.env.E2E_DEGRADED_SUPABASE_URL ?? "http://127.0.0.1:54499";

const url = (port: number) => `http://${host}:${port}`;

const SPECIAL = {
  crossBrowser: /cross-browser\.spec\.ts$/,
  time: /\.time\.spec\.ts$/,
  degraded: /degraded\.spec\.ts$/,
  emailOff: /email-off\.spec\.ts$/,
};
const standardIgnore = Object.values(SPECIAL);

/**
 * RSVP link secret of the e2e servers: the seed derives its tokens with the same value (`seed.ts`).
 * The public fake of `.env.example`/CI; a value already in the environment wins on both sides.
 */
const RSVP_SECRET = process.env.RSVP_LINK_SECRET ?? "local-fake-rsvp-secret-0123456789abcdef";

/**
 * Output of the main server, copied to a file so `rsvp.public.spec.ts` can prove the test token never
 * reaches it (plan T11). Not under `test-results/`: Playwright empties that folder at the start. Only
 * a server started by Playwright writes it (a reused one keeps its own console).
 */
const SERVER_LOG = path.join(os.tmpdir(), `r2y-e2e-server-${process.env.E2E_PORT ?? 3000}.log`);
process.env.E2E_SERVER_LOG = SERVER_LOG;

function server(port: number, env: Record<string, string>, log?: string) {
  const start = `npx next start -H ${host} -p ${port}`;
  return {
    command: log ? `${start} 2>&1 | tee ${log}` : start,
    url: url(port),
    reuseExistingServer: !CI,
    timeout: 120_000,
    env: {
      E2E_CLOCK: "1",
      NEXT_PUBLIC_SITE_URL: url(port),
      RSVP_LINK_SECRET: RSVP_SECRET,
      ...env,
    },
  };
}

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: true,
  forbidOnly: CI,
  // One retry in CI only. A test that passes on retry is REPORTED as flaky (a bug to fix, not a
  // silent green): see the `flaky` summary step in .github/workflows/ci.yml.
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI
    ? [["list"], ["html", { open: "never" }], ["json", { outputFile: "test-results/report.json" }]]
    : [["list"]],
  use: { trace: "on-first-retry", locale: "it-IT", timezoneId: "Europe/Rome" },

  projects: [
    {
      name: "mobile",
      testIgnore: [...standardIgnore, /\.desktop\.spec\.ts$/],
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 360, height: 740 },
        baseURL: url(PORT_MAIN),
      },
    },
    {
      name: "desktop",
      testIgnore: [...standardIgnore, /\.mobile\.spec\.ts$/],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        baseURL: url(PORT_MAIN),
      },
    },
    {
      name: "webkit-smoke",
      testMatch: SPECIAL.crossBrowser,
      use: {
        ...devices["iPhone 13"],
        viewport: { width: 390, height: 844 },
        baseURL: url(PORT_MAIN),
      },
    },
    {
      name: "time",
      testMatch: SPECIAL.time,
      fullyParallel: false,
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 360, height: 740 },
        baseURL: url(PORT_MAIN),
      },
    },
    {
      name: "degraded",
      testMatch: SPECIAL.degraded,
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 360, height: 740 },
        baseURL: url(PORT_DEGRADED),
      },
    },
    {
      name: "email-off",
      testMatch: SPECIAL.emailOff,
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 360, height: 740 },
        baseURL: url(PORT_EMAIL_OFF),
      },
    },
  ],

  // Servers start on demand: the main one always, the other two only when their project is
  // selected (`--project=degraded` / `--project=email-off`) or E2E_ALL_SERVERS=1 (e2e-full).
  webServer: [
    server(PORT_MAIN, {}, SERVER_LOG),
    ...(process.env.E2E_ALL_SERVERS === "1" || process.argv.some((a) => a.includes("degraded"))
      ? [server(PORT_DEGRADED, { NEXT_PUBLIC_SUPABASE_URL: DEGRADED_BACKEND_URL })]
      : []),
    ...(process.env.E2E_ALL_SERVERS === "1" || process.argv.some((a) => a.includes("email-off"))
      ? [server(PORT_EMAIL_OFF, { EMAIL_TRANSPORT: "none" })]
      : []),
  ],
});
