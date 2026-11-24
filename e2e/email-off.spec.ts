/**
 * QA T17c (project `email-off`: a third `next start` WITHOUT EMAIL_TRANSPORT), AC59, plan row
 * "Email spente".
 *
 * AC map
 *  - AC59  no email goes out; a persistent notice says reminders are only in the app (Home and
 *          Percorso); Promemoria explains instead of offering switches; the email-only options are
 *          hidden or explained (invite by email, recovery link); login and everything else works
 *  - AC5   the invite WITH A CODE is still there
 *  - AC57  "Hai dimenticato il codice?" explains the temporary code of the partner
 *  - AC7   an invite or recovery link found anyway is just "not valid"
 */
import { loginAs, openLogin } from "./support/auth";
import { expect, newFounder, newSession, test, uniqueIp } from "./support/fixtures";
import { listMessagesTo } from "./support/mailbox";
import { seedWedding } from "./support/seed";
import { uniqueEmail } from "../tests/support/supabase";

test.describe.configure({ timeout: 60_000 });

const banner = "[data-slot=email-off-banner]";

test("the login works with no email at all and the forgot-code help names the partner's temporary code", async ({
  page,
}) => {
  const w = await seedWedding();
  await openLogin(page, uniqueIp());
  await page.getByText("Hai dimenticato il codice?").click();
  await expect(page.getByTestId("forgot-code-no-email")).toContainText("codice temporaneo");
  await expect(page.getByTestId("recovery-form")).toHaveCount(0);
  await page.getByText("Hai dimenticato il codice?").click(); // close
  expect(await loginAs(page, w.wedding.founder, uniqueIp())).toBe("/");
});

test("Home and Percorso carry the persistent notice; Altro > Promemoria explains instead of offering switches", async ({
  page,
}) => {
  const w = await seedWedding();
  await loginAs(page, w.wedding.founder, uniqueIp());
  await expect(page.locator(banner)).toContainText("Le email sono spente");
  await page.goto("/percorso");
  await expect(page.locator(banner)).toContainText("i promemoria li trovi solo qui nell'app");
  await page.goto("/altro/promemoria");
  await expect(page.getByTestId("email-off-explanation")).toContainText("Le email sono spente");
  await expect(page.getByTestId("pref-reminders")).toHaveCount(0);
  await expect(page.getByTestId("pref-digest")).toHaveCount(0);
});

test("Altro > Invito: no invite by email, but the access with a code works, and nothing is mailed", async ({
  page,
  browser,
}, testInfo) => {
  const w = await seedWedding({ withPartnerB: false });
  await loginAs(page, w.wedding.founder, uniqueIp());
  await page.goto("/altro/invito");
  await expect(page.getByTestId("invite-email-off")).toBeVisible();
  await expect(page.getByTestId("invite-by-email-form")).toHaveCount(0);

  const email = uniqueEmail("nomail");
  const form = page.getByTestId("create-with-code-form");
  await form.locator("#partner-email").fill(email);
  await form.getByRole("button", { name: "Genera" }).click();
  const code = await form.locator("#partner-code").inputValue();
  await form.getByRole("button", { name: "Crea l'accesso" }).click();
  await expect(page.getByTestId("partner-state-badge")).toHaveText("In attesa");

  const b = await newSession(browser, testInfo);
  expect(await loginAs(b.page, { email, code }, uniqueIp())).toBe("/");
  await b.context.close();
  expect(await listMessagesTo(email)).toHaveLength(0);
});

test("onboarding step 2 hides the email invite and says why", async ({ page }) => {
  const founder = await newFounder();
  await loginAs(page, founder, uniqueIp());
  await page.locator("#you-first-name").fill("Tony");
  await page.getByTestId("step-continue").click();
  await expect(page.getByTestId("partner-email-off")).toBeVisible();
  await expect(page.getByTestId("partner-mode-email")).toHaveCount(0);
  await expect(page.getByTestId("partner-mode-code")).toBeVisible();
  await expect(page.getByTestId("partner-mode-later")).toBeVisible();
});

test("an invite link or a recovery link has no effect without emails (AC7)", async ({ page }) => {
  await page.goto("/invito/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
  await expect(page.getByTestId("invite-invalid")).toBeVisible();
  await page.goto("/auth/conferma?type=recovery&token_hash=abcdef");
  await expect(page.getByTestId("recovery-link-invalid")).toBeVisible();
  await expect(page.getByTestId("recovery-confirm-form")).toHaveCount(0);
});
