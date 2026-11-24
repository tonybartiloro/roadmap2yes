import type { Page } from "@playwright/test";
import type { TestUser } from "../../tests/support/supabase";

/**
 * Login through the real form (T7a): email + access code, no mailbox step.
 * Landing pages: founder without a wedding -> /onboarding; partner B -> /;
 * temporary code -> /altro/account?obbligatorio=1; no space -> /su-invito.
 * The limiter keys on `x-forwarded-for`: pass a distinct fake `ip` per test (fixtures.uniqueIp()).
 */
export const LOGIN_TEXTS = {
  wrong: "Email o codice non corretti.",
  locked: "Troppi tentativi. Riprova tra 15 minuti.",
} as const;

export async function openLogin(page: Page, ip: string): Promise<void> {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": ip });
  await page.goto("/accesso");
}

/** Fills and submits the form WITHOUT waiting for a landing page (for error/limiter cases). */
export async function submitLogin(
  page: Page,
  credentials: Pick<TestUser, "email" | "code">,
): Promise<void> {
  await page.locator("#login-email").fill(credentials.email);
  await page.getByLabel("Il tuo codice d'accesso").fill(credentials.code);
  await page.getByRole("button", { name: "Entra" }).click();
}

/** Logs in and waits until the URL leaves /accesso. Returns the landing pathname + search. */
export async function loginAs(
  page: Page,
  credentials: Pick<TestUser, "email" | "code">,
  ip: string,
): Promise<string> {
  await openLogin(page, ip);
  await submitLogin(page, credentials);
  await page.waitForURL((url) => !url.pathname.startsWith("/accesso"), { timeout: 20_000 });
  const url = new URL(page.url());
  return url.pathname + url.search;
}

export async function signOut(page: Page): Promise<void> {
  await page.getByTestId("sign-out").click();
  await page.waitForURL(/\/accesso/);
}
