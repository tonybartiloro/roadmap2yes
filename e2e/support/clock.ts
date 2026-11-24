import type { BrowserContext } from "@playwright/test";

/**
 * Test clock for the Playwright `time` project (plan 1.1). The app honours the cookie only when it
 * runs with E2E_CLOCK=1 and VERCEL undefined (src/lib/clock.ts); playwright.config.ts sets E2E_CLOCK.
 */
export const TEST_NOW_COOKIE = "r2y-test-now";

/** Moves the app's "now" for this browser context. `iso` is an instant, e.g. `2027-03-28T23:30:00Z`. */
export async function setNow(context: BrowserContext, baseURL: string, iso: string): Promise<void> {
  if (Number.isNaN(new Date(iso).getTime())) throw new Error(`setNow: not an ISO instant: ${iso}`);
  const url = new URL(baseURL);
  await context.addCookies([
    { name: TEST_NOW_COOKIE, value: iso, domain: url.hostname, path: "/" },
  ]);
}

export async function clearNow(context: BrowserContext): Promise<void> {
  await context.clearCookies({ name: TEST_NOW_COOKIE });
}
