/**
 * QA T17d (project `degraded`: a second `next start` whose Supabase URL points at a closed port),
 * AC39 / D43 / DES-16 / D45.
 *
 * AC map
 *  - AC39  two distinct pages: "L'app è in pausa." (a 540 from the backend: manual restore from the
 *          service panel, "Riprova", collapsible technical details, nobody named, "chi gestisce
 *          l'app") and "Non riesco a raggiungere il servizio." (network / server errors)
 *  - DES-16 a signed-in person is NEVER sent to the login because the backend is down: the proxy
 *          rewrites to the service page and keeps the URL
 *  - the pages themselves are accessible (axe) and need no database
 *
 * A signed-in browser is simulated with an EXPIRED session cookie: the proxy must try to refresh it,
 * that call fails, and the guard must read the failure as an outage, not as "logged out".
 */
import { axeFindings, describeFindings } from "./support/axe";
import { expect, test } from "./support/fixtures";
import { startStubSupabase, type StubSupabase } from "./support/stub-supabase";

test.describe.configure({ mode: "default", timeout: 150_000 });

const COOKIE_NAME = "sb-127-auth-token"; // `sb-<first label of the Supabase host>-auth-token`

function expiredSessionCookie(): string {
  const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({
    sub: "00000000-0000-0000-0000-000000000000",
    exp: 1_000_000_000,
    role: "authenticated",
  })}.signature`;
  const session = {
    access_token: jwt,
    refresh_token: "qa-refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: 1_000_000_000,
    user: { id: "00000000-0000-0000-0000-000000000000" },
  };
  return `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
}

async function signedInLooking(
  context: import("@playwright/test").BrowserContext,
  baseURL: string,
) {
  await context.addCookies([{ name: COOKIE_NAME, value: expiredSessionCookie(), url: baseURL }]);
}

test.describe("backend unreachable (closed port)", () => {
  test("every private page shows 'Non riesco a raggiungere il servizio', keeps its URL, never the login", async ({
    page,
    context,
    baseURL,
  }) => {
    await signedInLooking(context, baseURL!);
    // ONE route is enough for the behaviour; each costs the full outage delay (see QA-7 below)
    const route = "/percorso";
    const started = Date.now();
    await page.goto(route, { timeout: 120_000 });
    const elapsed = Date.now() - started;
    await expect(page.locator("h1[role=alert]")).toContainText(
      "Non riesco a raggiungere il servizio.",
    );
    expect(new URL(page.url()).pathname, `${route} must not redirect to the login`).toBe(route);
    await expect(page.getByRole("button", { name: "Riprova" })).toBeVisible();
    // no "pause" wording, no names, no technical details for a plain network failure
    await expect(page.locator("main")).not.toContainText("in pausa");
    test.info().annotations.push({ type: "outage-page-latency-ms", description: String(elapsed) });
  });

  test("/servizio itself: noindex, no database needed, accessible", async ({ page }) => {
    await page.goto("/servizio");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.locator("h1[role=alert]")).toContainText(
      "Non riesco a raggiungere il servizio.",
    );
    const findings = await axeFindings(page);
    expect(findings, describeFindings(findings)).toEqual([]);
  });

  test("the login page still opens, and a sign-in attempt gets a neutral 'try again' (not 'wrong code')", async ({
    page,
  }) => {
    await page.goto("/accesso");
    await page.locator("#login-email").fill("someone@example.test");
    await page.getByLabel("Il tuo codice d'accesso").fill("SomeCode12345");
    await page.getByRole("button", { name: "Entra" }).click();
    const feedback = page.getByTestId("login-feedback");
    await expect(feedback).toBeVisible();
    await expect(feedback).not.toContainText("Email o codice non corretti");
    await expect(feedback).toContainText(/riprova|collegarmi|raggiungere/i);
  });
});

test.describe("backend paused (HTTP 540)", () => {
  let stub: StubSupabase;
  test.beforeAll(async () => {
    stub = await startStubSupabase({ status: 540 });
  });
  test.afterAll(async () => {
    await stub.close();
  });

  test("'L'app è in pausa.': details for whoever runs the app, a Riprova that says 'ancora', nobody named", async ({
    page,
    context,
    baseURL,
  }) => {
    await signedInLooking(context, baseURL!);
    await page.goto("/percorso");
    await expect(page.locator("h1[role=alert]")).toContainText("L'app è in pausa.");
    expect(new URL(page.url()).pathname).toBe("/percorso"); // never the login
    expect(stub.requests()).toBeGreaterThan(0);

    const main = page.locator("main");
    await expect(main).toContainText("chi gestisce l'app");
    await expect(main).not.toContainText(/Tony|Jessica|sviluppator/i);
    const details = page.locator("details");
    await expect(details).toBeVisible();
    await expect(details.locator("summary")).toContainText("Per chi gestisce l'app");
    await expect(details).not.toHaveAttribute("open", "");
    await details.locator("summary").click();
    await expect(details).toContainText("Ripristina progetto");

    const findings = await axeFindings(page);
    expect(findings, describeFindings(findings)).toEqual([]);
  });

  // [QA-8 DEFECT] "Riprova" is manual and a retry that fails again must say "È ancora in pausa."
  // Actual: the first request's failed token refresh (HTTP 540, not retryable for the Auth client)
  // makes the proxy DROP the session cookies, so the retry lands on the login page: the person is
  // logged out by a transient outage. Kept failing until fixed.
  test("[QA-8] after 'Riprova' during a pause the person is still signed in and sees 'È ancora in pausa.'", async ({
    page,
    context,
    baseURL,
  }) => {
    await signedInLooking(context, baseURL!);
    await page.goto("/percorso");
    await expect(page.locator("h1[role=alert]")).toContainText("L'app è in pausa.");
    await page.getByRole("button", { name: "Riprova" }).click();
    await expect(page.locator("h1[role=alert]")).toContainText("È ancora in pausa.");
    expect(new URL(page.url()).pathname).toBe("/percorso");
  });

  test("the paused page answers fast (a 540 is not retried)", async ({
    page,
    context,
    baseURL,
  }) => {
    await signedInLooking(context, baseURL!);
    const started = Date.now();
    await page.goto("/budget");
    await expect(page.locator("h1[role=alert]")).toContainText("L'app è in pausa.");
    expect(Date.now() - started).toBeLessThan(10_000);
  });
});

// [QA-7 DEFECT] Kept LAST and failing on purpose. With the backend refusing connections the outage
// page takes ~52 s to arrive (the expired-session refresh retries inside the proxy; every request
// pays it). On Vercel Hobby a function is cut at 10 s, so the person would see the platform error
// instead of "Non riesco a raggiungere il servizio". Budget: the page within 10 s.
test.describe("outage page latency (QA-7)", () => {
  test("[QA-7] 'Non riesco a raggiungere il servizio' arrives within 10 s", async ({
    page,
    context,
    baseURL,
  }) => {
    test.setTimeout(150_000);
    await signedInLooking(context, baseURL!);
    const started = Date.now();
    await page.goto("/", { timeout: 120_000 });
    await expect(page.locator("h1[role=alert]")).toContainText(
      "Non riesco a raggiungere il servizio.",
    );
    const elapsed = Date.now() - started;
    expect(elapsed, `outage page after ${elapsed} ms`).toBeLessThan(10_000);
  });
});
