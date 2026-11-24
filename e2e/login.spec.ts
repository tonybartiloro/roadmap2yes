/**
 * QA T17a: login e2e (plan "E2E Redirect", "Messaggi neutri e blocco", AC3/AC4/AC54 landing rules).
 *
 * AC map
 *  - AC1  private routes redirect to /accesso with no data in the HTML; data API refuses
 *  - AC2  unknown email and wrong code get the SAME neutral message; no user is created, no email sent
 *  - AC3  an account without a space lands on "Questo spazio è su invito" and cannot create one
 *  - AC4  partner B lands in A's space (home), founder A lands on /onboarding
 *  - AC54 correct email + code enters; password-manager friendly field; blocked after repeated
 *         errors with the same message for an existing and an unknown email
 *  - AC62 "Esci" ends the session and returns to the login (back button: see cache.spec.ts)
 *
 * Runs in `mobile` (360 px) and `desktop`.
 */
import { LOGIN_TEXTS, loginAs, openLogin, signOut, submitLogin } from "./support/auth";
import {
  createCouple,
  expect,
  newFounder,
  serviceClient,
  strayAccount,
  test,
} from "./support/fixtures";
import { clearMailbox, listMessagesTo } from "./support/mailbox";
import { seedWedding } from "./support/seed";
import { uniqueEmail } from "../tests/support/supabase";

const PRIVATE_ROUTES = [
  "/",
  "/percorso",
  "/scelte",
  "/budget",
  "/altro",
  "/altro/account",
  "/altro/profili",
  "/altro/esporta",
  "/onboarding",
];

test.describe("private pages without a session (AC1)", () => {
  for (const route of PRIVATE_ROUTES) {
    test(`${route} redirects to /accesso and leaks nothing`, async ({ request }) => {
      const response = await request.get(route, { maxRedirects: 0 });
      expect([302, 303, 307, 308]).toContain(response.status());
      expect(new URL(response.headers()["location"] ?? "", "http://x").pathname).toBe("/accesso");
      expect(await response.text()).not.toMatch(/Percorso|Budget|Scelte|@example\.test/);
      expect(response.headers()["cache-control"]).toMatch(/no-store/);
    });
  }

  test("a browser landing on a private page ends up on the login form", async ({ page }) => {
    await page.goto("/budget");
    await expect(page).toHaveURL(/\/accesso/);
    await expect(page.getByTestId("login-form")).toBeVisible();
  });
});

test.describe("login form (AC54)", () => {
  test("the form is password-manager friendly, noindex and usable at 360 px", async ({
    page,
    ip,
  }) => {
    await openLogin(page, ip);
    await expect(page.locator("#login-email")).toHaveAttribute("autocomplete", "username");
    const code = page.getByLabel("Il tuo codice d'accesso");
    await expect(code).toHaveAttribute("type", "password");
    await expect(code).toHaveAttribute("autocomplete", "current-password");
    await expect(code).toHaveAttribute("name", "code");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    // no horizontal scroll (reflow), whatever the viewport of the project
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    // show/hide toggle
    await code.fill("abc123def456");
    await page.getByRole("button", { name: "Mostra il codice" }).click();
    await expect(code).toHaveAttribute("type", "text");
  });

  test("paste is allowed in the code field", async ({ page, ip, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => undefined);
    await openLogin(page, ip);
    const code = page.getByLabel("Il tuo codice d'accesso");
    await code.focus();
    // A synthetic paste event must not be cancelled by the field.
    const prevented = await code.evaluate((el) => {
      const event = new Event("paste", { bubbles: true, cancelable: true });
      el.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(prevented).toBe(false);
  });

  test("correct email and code enter (AC54); the founder lands on /onboarding (AC4)", async ({
    page,
    ip,
  }) => {
    const founder = await newFounder();
    const landing = await loginAs(page, founder, ip);
    expect(landing).toBe("/onboarding");
    await expect(page.getByTestId("onboarding-progress-text")).toHaveText("Passo 1 di 8");
  });

  test("partner B enters directly in A's space and never sees the creation (AC4)", async ({
    page,
    ip,
  }) => {
    const { partnerB } = await createCouple();
    const landing = await loginAs(page, partnerB.user, ip);
    expect(landing).toBe("/");
    await expect(page.getByRole("navigation", { name: "Principale" })).toBeVisible();
    await page.goto("/onboarding");
    // a member whose space is not founded by them cannot run the onboarding of the founder
    await expect(page).not.toHaveURL(/\/su-invito/);
  });

  test("an account without a space sees 'Questo spazio è su invito' and cannot create one (AC3)", async ({
    page,
    ip,
  }) => {
    const stray = await strayAccount();
    const landing = await loginAs(page, stray, ip);
    expect(landing).toBe("/su-invito");
    await expect(page.getByRole("heading", { name: "Questo spazio è su invito" })).toBeVisible();
    await expect(page.getByTestId("invite-only-message")).toBeVisible();
    for (const route of ["/onboarding", "/", "/percorso"]) {
      await page.goto(route);
      await expect(page).not.toHaveURL(/\/onboarding$/);
    }
    // direct API attempt with that user's session: no space can be created
    const wedding = await serviceClient().from("weddings").select("id").limit(1000);
    const memberships = await serviceClient()
      .from("memberships")
      .select("user_id")
      .eq("user_id", stray.id);
    expect(memberships.data).toEqual([]);
    expect(wedding.error).toBeNull();
  });
});

test.describe("neutral errors and temporary block (AC2, AC54)", () => {
  test("unknown email and wrong code give the same message, create nothing and send no email", async ({
    page,
    ip,
  }) => {
    await clearMailbox();
    const founder = await newFounder();
    const unknown = uniqueEmail("nobody");
    await openLogin(page, ip);

    await submitLogin(page, { email: unknown, code: "WrongCode123x" });
    const feedback = page.getByTestId("login-feedback");
    await expect(feedback).toContainText(LOGIN_TEXTS.wrong);
    const unknownText = (await feedback.textContent())?.trim();

    await page.reload();
    await submitLogin(page, { email: founder.email, code: "WrongCode123x" });
    await expect(page.getByTestId("login-feedback")).toContainText(LOGIN_TEXTS.wrong);
    expect((await page.getByTestId("login-feedback").textContent())?.trim()).toBe(unknownText);
    await expect(page).toHaveURL(/\/accesso/);

    const users = await serviceClient().auth.admin.listUsers({ page: 1, perPage: 1000 });
    expect(users.data.users.some((u) => u.email === unknown)).toBe(false);
    expect(await listMessagesTo(unknown)).toHaveLength(0);
    expect(await listMessagesTo(founder.email)).toHaveLength(0);
  });

  test("after 5 wrong codes the login is blocked, even with the right code, with the same text for any email", async ({
    page,
    ip,
  }) => {
    const founder = await newFounder();
    await openLogin(page, ip);
    for (let i = 0; i < 5; i += 1) {
      await submitLogin(page, { email: founder.email, code: `Wrong${i}Code99x` });
      await expect(page.getByTestId("login-feedback")).toContainText(LOGIN_TEXTS.wrong);
    }
    await submitLogin(page, { email: founder.email, code: founder.code });
    await expect(page.getByTestId("login-feedback")).toContainText(LOGIN_TEXTS.locked);
    await expect(page).toHaveURL(/\/accesso/);
  });

  test("an unknown email is blocked the same way, with the same text", async ({ page, ip }) => {
    const unknown = uniqueEmail("ghost");
    await openLogin(page, ip);
    for (let i = 0; i < 5; i += 1) {
      await submitLogin(page, { email: unknown, code: `Wrong${i}Code99x` });
      await expect(page.getByTestId("login-feedback")).toContainText(LOGIN_TEXTS.wrong);
    }
    await submitLogin(page, { email: unknown, code: "WrongCode123x" });
    await expect(page.getByTestId("login-feedback")).toContainText(LOGIN_TEXTS.locked);
  });
});

test.describe("sign out (AC62)", () => {
  test("'Esci' in Altro ends the session and returns to the login", async ({ page, ip }) => {
    const { wedding } = await seedWedding();
    expect(await loginAs(page, wedding.founder, ip)).toBe("/");
    await page.goto("/altro");
    await signOut(page);
    await expect(page.getByTestId("login-form")).toBeVisible();
    await page.goto("/altro");
    await expect(page).toHaveURL(/\/accesso/);
  });
});
