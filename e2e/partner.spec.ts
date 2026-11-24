/**
 * QA T17a: partner B access flows (plan rows "E2E Partner con codice", "E2E (smtp) Invito via
 * email", "E2E Codice dimenticato", "E2E Regole email").
 *
 * AC map
 *  - AC4/AC5  A creates B's access with an initial code (Altro > Invito); B enters A's space
 *  - AC6      B's membership exists after the first sign-in, with the same rights
 *  - AC56     B changes the code: the current one is required, the old one stops working
 *  - AC57     temporary code: forced change before any page; the event reaches B in Novità
 *  - AC58     A edits B's email until B has entered; afterwards each one edits only their own
 *             (typed twice + current code); the partner row follows
 *  - AC5/AC7  (smtp) invite by email: link, B chooses the code; old link dead after "Invia di
 *             nuovo"; used, revoked and expired links give the neutral message
 *  - AC57     (smtp) recovery by email link
 *
 * Pending-B accounts are NEVER signed in before the revoke / email-change steps (a real sign-in
 * makes them non-reusable).
 */
import type { Page } from "@playwright/test";
import { LOGIN_TEXTS, loginAs, openLogin, signOut, submitLogin } from "./support/auth";
import { expect, newSession, serviceClient, test, uniqueIp } from "./support/fixtures";
import {
  CLI_MAILPIT_URL,
  clearMailbox,
  extractLinks,
  listMessagesTo,
  waitForMessage,
} from "./support/mailbox";
import { seedWedding } from "./support/seed";
import { randomCode, uniqueEmail } from "../tests/support/supabase";

test.describe.configure({ timeout: 60_000 });

/** A creates B's access with a generated code through Altro > Invito; returns the code. */
async function createPartnerWithCode(
  page: Page,
  email: string,
  names = { first: "Jessica", last: "Rossi" },
): Promise<string> {
  await page.goto("/altro/invito");
  const form = page.getByTestId("create-with-code-form");
  await form.locator("#partner-email").fill(email);
  await form.locator("#partner-first-name").fill(names.first);
  await form.locator("#partner-last-name").fill(names.last);
  await form.getByRole("button", { name: "Genera" }).click();
  const code = await form.locator("#partner-code").inputValue();
  expect(code).toMatch(/^[A-Za-z0-9-]{12,}$/);
  await form.getByRole("button", { name: "Crea l'accesso" }).click();
  // On success the page re-renders as "pending" (the form gives way to Revoca / Cambia email).
  await expect(page.getByTestId("partner-state-badge")).toHaveText("In attesa");
  return code;
}

test.describe("partner with an initial code", () => {
  test("A creates B, B enters A's space, sees the suggestion and changes the code (AC4, AC5, AC6, AC56)", async ({
    page,
    browser,
  }, testInfo) => {
    const { wedding, weddingId } = await seedWedding({ withPartnerB: false });
    await loginAs(page, wedding.founder, uniqueIp());
    const email = uniqueEmail("jessica");
    const code = await createPartnerWithCode(page, email);

    // the code is never shown again, and the invitation is "In attesa"
    await page.reload();
    await expect(page.getByTestId("partner-state-badge")).toHaveText("In attesa");
    expect(await page.content()).not.toContain(code);

    // B (another session) enters directly in A's space, never at the creation of a space
    const b = await newSession(browser, testInfo);
    const landing = await loginAs(b.page, { email, code }, uniqueIp());
    expect(landing).toBe("/");
    await expect(
      b.page.getByRole("heading", { name: "Ciao Jessica, ti stavamo aspettando" }),
    ).toBeVisible();
    const members = await serviceClient()
      .from("memberships")
      .select("user_id,wedding_id,role")
      .eq("wedding_id", weddingId);
    expect(members.data).toHaveLength(2);
    expect(members.data?.every((m) => m.role === "partner")).toBe(true);

    // the initial code is only SUGGESTED to change (not forced): other pages open
    await b.page.goto("/percorso");
    await expect(b.page).toHaveURL(/\/percorso$/);
    await b.page.goto("/altro/account");
    await expect(b.page.getByTestId("code-suggestion")).toBeVisible();
    await expect(b.page.getByTestId("forced-change-banner")).toHaveCount(0);

    // wrong current code -> error, nothing changes
    const form = b.page.getByTestId("change-code-form");
    const newCode = randomCode();
    await form.getByLabel("Il codice di adesso").fill("WrongCode123x");
    await form.getByLabel("Il nuovo codice").fill(newCode);
    await form.getByRole("button", { name: "Cambia il codice" }).click();
    await expect(b.page.getByText("Il codice attuale non è corretto.")).toBeVisible();

    // a weak / short new code is refused with the exact text
    await form.getByLabel("Il codice di adesso").fill(code);
    await form.getByLabel("Il nuovo codice").fill("short1");
    await form.getByRole("button", { name: "Cambia il codice" }).click();
    await expect(b.page.getByText("Il codice deve avere almeno 10 caratteri.")).toBeVisible();

    // correct: changes
    await form.getByLabel("Il codice di adesso").fill(code);
    await form.getByLabel("Il nuovo codice").fill(newCode);
    await form.getByRole("button", { name: "Cambia il codice" }).click();
    await expect(b.page.getByTestId("change-code-feedback")).toBeVisible();
    await signOut(b.page);

    // the old code stops working, the new one works
    await openLogin(b.page, uniqueIp());
    await submitLogin(b.page, { email, code });
    await expect(b.page.getByTestId("login-feedback")).toContainText(LOGIN_TEXTS.wrong);
    expect(await loginAs(b.page, { email, code: newCode }, uniqueIp())).toBe("/");
    await b.context.close();
  });

  // [QA-1 DEFECT] "Sì, revoca" closes the dialog but submits nothing (no POST, invitation not
  // revoked): the AlertDialogAction is a form-associated submit button that is unmounted before the
  // browser runs its submit. Kept failing on purpose until fixed.
  test("[QA-1] revoking before the first access kills the code and deletes the account (AC5, AC6)", async ({
    page,
    browser,
  }, testInfo) => {
    const { wedding } = await seedWedding({ withPartnerB: false });
    await loginAs(page, wedding.founder, uniqueIp());
    const email = uniqueEmail("revoked");
    const code = await createPartnerWithCode(page, email);

    await page.reload();
    await page.getByTestId("revoke-open").click();
    await page.getByTestId("revoke-confirm").click();
    await expect(page.getByTestId("partner-state-badge")).toHaveText("Revocato");

    const b = await newSession(browser, testInfo);
    await openLogin(b.page, uniqueIp());
    await submitLogin(b.page, { email, code });
    await expect(b.page.getByTestId("login-feedback")).toContainText(LOGIN_TEXTS.wrong);
    await expect(b.page).toHaveURL(/\/accesso/);
    const users = await serviceClient().auth.admin.listUsers({ page: 1, perPage: 1000 });
    expect(users.data.users.some((u) => u.email === email)).toBe(false);
    await b.context.close();
  });

  test("an email that already has an active account cannot be used (AC5)", async ({ page }) => {
    const { wedding, partnerB } = await seedWedding();
    await loginAs(page, wedding.founder, uniqueIp());
    // B is already in: the creation form is not offered, the active state is
    await page.goto("/altro/invito");
    await expect(page.getByTestId("partner-state-badge")).toHaveText("Accettato");
    await expect(page.getByTestId("create-with-code-form")).toHaveCount(0);
    expect(partnerB).not.toBeNull();
  });
});

test.describe("temporary code (AC57)", () => {
  test("A sets a temporary code: B must change it before any page and sees the event in Novità", async ({
    page,
    browser,
  }, testInfo) => {
    const { wedding, partnerB } = await seedWedding();
    expect(partnerB).not.toBeNull();
    const b0 = partnerB!;
    await loginAs(page, wedding.founder, uniqueIp());
    await page.goto("/altro/invito");
    await expect(page.getByTestId("partner-state-badge")).toHaveText("Accettato");
    const temp = randomCode();
    const form = page.getByTestId("temp-code-form");
    await form.getByLabel(/Il codice temporaneo per/).fill(temp);
    await form.getByRole("button", { name: "Imposta il codice temporaneo" }).click();
    await expect(page.getByTestId("temp-code-feedback")).toContainText(
      "codice temporaneo è pronto",
    );

    // B: the old code no longer works (sessions closed + password replaced); the temporary one does
    const b = await newSession(browser, testInfo);
    await openLogin(b.page, uniqueIp());
    await submitLogin(b.page, { email: b0.user.email, code: b0.user.code });
    await expect(b.page.getByTestId("login-feedback")).toContainText(LOGIN_TEXTS.wrong);
    const landing = await loginAs(b.page, { email: b0.user.email, code: temp }, uniqueIp());
    expect(landing).toBe("/altro/account?obbligatorio=1");
    await expect(b.page.getByTestId("forced-change-banner")).toBeVisible();

    // no other page opens until the code is changed
    for (const route of ["/", "/percorso", "/budget", "/scelte"]) {
      await b.page.goto(route);
      await expect(b.page).toHaveURL(/\/altro\/account\?obbligatorio=1/);
    }

    const next = randomCode();
    const change = b.page.getByTestId("change-code-form");
    await change.getByLabel("Il codice temporaneo").fill(temp);
    await change.getByLabel("Il nuovo codice").fill(next);
    await change.getByRole("button", { name: "Cambia il codice" }).click();
    await b.page.waitForURL((url) => !url.search.includes("obbligatorio"), { timeout: 20_000 });

    // free to move now; the event is in Novità, naming the other partner, never the code
    await b.page.goto("/");
    const news = b.page.locator(
      "section[aria-labelledby='home-news'], section[aria-labelledby='home-welcome']",
    );
    await expect(news.first()).toBeVisible();
    const body = await b.page.locator("body").innerText();
    expect(body).not.toContain(temp);
    const events = await serviceClient()
      .from("account_events")
      .select("kind,actor_id,target_user_id")
      .eq("wedding_id", wedding.weddingId)
      .eq("kind", "temp_code_set");
    expect(events.data).toHaveLength(1);
    expect(events.data?.[0]?.actor_id).toBe(wedding.founder.id);
    expect(events.data?.[0]?.target_user_id).toBe(b0.user.id);
    await b.context.close();
  });
});

test.describe("email rules (AC58)", () => {
  test("A edits B's email until B has entered; afterwards each edits only their own", async ({
    page,
    browser,
  }, testInfo) => {
    const { wedding } = await seedWedding({ withPartnerB: false });
    await loginAs(page, wedding.founder, uniqueIp());
    const oldEmail = uniqueEmail("old");
    const code = await createPartnerWithCode(page, oldEmail);

    // A changes the pending email (B has never entered)
    await page.reload();
    const change = page.getByTestId("change-pending-email-form");
    const newEmail = uniqueEmail("renewed");
    await change.getByLabel("La nuova email").fill(newEmail);
    await change.getByRole("button", { name: "Cambia email" }).click();
    await expect(page.getByTestId("change-pending-email-feedback")).toContainText(
      "l'email è cambiata",
    );

    const b = await newSession(browser, testInfo);
    await openLogin(b.page, uniqueIp());
    await submitLogin(b.page, { email: oldEmail, code });
    await expect(b.page.getByTestId("login-feedback")).toContainText(LOGIN_TEXTS.wrong);
    expect(await loginAs(b.page, { email: newEmail, code }, uniqueIp())).toBe("/");

    // A can no longer change it: Profili and Invito offer nothing to edit
    await page.goto("/altro/profili");
    await expect(page.getByTestId("profile-partner-email-section")).toHaveCount(0);
    await page.goto("/altro/invito");
    await expect(page.getByTestId("change-pending-email-form")).toHaveCount(0);

    // B changes the OWN email: typed twice + current code, with the warning
    await b.page.goto("/altro/account");
    const form = b.page.getByTestId("change-email-form");
    await expect(b.page.getByTestId("email-is-login")).toContainText(newEmail);
    const mine = uniqueEmail("jessica.new");

    await form.locator("#new-email").fill(mine);
    await form.locator("#new-email-confirm").fill(uniqueEmail("typo"));
    await form.locator("#email-current-code").fill(code);
    await form.getByRole("button", { name: "Cambia l'email" }).click();
    await expect(b.page.getByText("Le due email non coincidono.")).toBeVisible();

    await form.locator("#new-email-confirm").fill(mine);
    await form.locator("#email-current-code").fill("WrongCode123x");
    await form.getByRole("button", { name: "Cambia l'email" }).click();
    await expect(b.page.getByText("Il codice attuale non è corretto.")).toBeVisible();

    await form.locator("#new-email").fill(wedding.founder.email);
    await form.locator("#new-email-confirm").fill(wedding.founder.email);
    await form.locator("#email-current-code").fill(code);
    await form.getByRole("button", { name: "Cambia l'email" }).click();
    await expect(b.page.getByText("Questa email non si può usare.").first()).toBeVisible();

    await form.locator("#new-email").fill(mine);
    await form.locator("#new-email-confirm").fill(mine);
    await form.locator("#email-current-code").fill(code);
    await form.getByRole("button", { name: "Cambia l'email" }).click();
    await expect(b.page.getByTestId("change-email-feedback")).toBeVisible();
    await signOut(b.page);

    // login with the new email works, the previous one is refused
    await openLogin(b.page, uniqueIp());
    await submitLogin(b.page, { email: newEmail, code });
    await expect(b.page.getByTestId("login-feedback")).toContainText(LOGIN_TEXTS.wrong);
    expect(await loginAs(b.page, { email: mine, code }, uniqueIp())).toBe("/");

    // the partner row follows (A sees it, read-only, with the "he changes it himself" hint)
    await page.goto("/altro/profili");
    await expect(page.locator("#profile-partner-email")).toHaveValue(mine);
    await expect(page.locator("#profile-partner-email")).toHaveAttribute("readonly", "");
    await b.context.close();
  });
});

test.describe("invite by email (smtp)", () => {
  test.beforeEach(async () => {
    await clearMailbox();
  });

  test("link -> B chooses the code -> enters; used link is dead; 'Invia di nuovo' kills the previous link (AC5, AC6, AC7)", async ({
    page,
    browser,
  }, testInfo) => {
    const { wedding } = await seedWedding({ withPartnerB: false });
    await loginAs(page, wedding.founder, uniqueIp());
    const email = uniqueEmail("invitee");
    await page.goto("/altro/invito");
    const form = page.getByTestId("invite-by-email-form");
    await form.locator("#invite-email").fill(email);
    await form.locator("#invite-first-name").fill("Giulia");
    await form.getByRole("button", { name: "Manda l'invito" }).click();
    await expect(page.getByTestId("partner-state-badge")).toHaveText("In attesa");

    const mail = await waitForMessage(email);
    const link = extractLinks(mail).find((l) => l.includes("/invito/"));
    expect(link).toBeTruthy();
    const firstPath = new URL(link!).pathname;
    // the invitation cannot be switched off: no unsubscribe link (AC52)
    expect(extractLinks(mail).some((l) => l.includes("/email/disattiva"))).toBe(false);

    // "Invia di nuovo" rotates the token: the first link is dead
    await page.reload();
    await expect(page.getByTestId("partner-state-badge")).toHaveText("In attesa");
    await page.getByTestId("resend-form").getByRole("button", { name: "Invia di nuovo" }).click();
    await expect(page.getByTestId("resend-feedback")).toBeVisible();
    const b = await newSession(browser, testInfo);
    await b.page.goto(firstPath);
    await expect(b.page.getByTestId("invite-invalid")).toContainText("non è più valido");

    // the new mail carries the live link
    await expect
      .poll(async () => (await listMessagesTo(email)).length, { timeout: 15_000 })
      .toBeGreaterThanOrEqual(2);
    const messages = await listMessagesTo(email);
    const newest = await waitForMessage(email, { subjectContains: messages[0]?.Subject ?? "" });
    const liveLink = extractLinks(newest).find((l) => l.includes("/invito/"));
    expect(liveLink).toBeTruthy();
    expect(new URL(liveLink!).pathname).not.toBe(firstPath);

    await b.page.goto(new URL(liveLink!).pathname);
    // GET changes nothing: opening the page twice keeps the link alive
    await b.page.reload();
    await expect(b.page.getByTestId("accept-invite-form")).toBeVisible();
    await expect(b.page.getByTestId("invite-masked-email")).toBeVisible();
    // policy: a short code is refused
    const code = randomCode();
    await b.page.getByLabel("Il tuo codice").fill("short1");
    await b.page.getByRole("button", { name: "Continua con la tua email" }).click();
    await expect(b.page.getByText("Il codice deve avere almeno 10 caratteri.")).toBeVisible();
    await b.page.getByLabel("Il tuo codice").fill(code);
    await b.page.getByRole("button", { name: "Continua con la tua email" }).click();
    await b.page.waitForURL((url) => !url.pathname.startsWith("/invito"), { timeout: 20_000 });
    expect(new URL(b.page.url()).pathname).toBe("/");

    // the link is single-use
    const c = await newSession(browser, testInfo);
    await c.page.goto(new URL(liveLink!).pathname);
    await expect(c.page.getByTestId("invite-invalid")).toBeVisible();
    // and B can log in afterwards with the chosen code
    await b.page.goto("/altro");
    await signOut(b.page);
    expect(await loginAs(b.page, { email, code }, uniqueIp())).toBe("/");
    await b.context.close();
    await c.context.close();
  });

  // [QA-1 DEFECT] same cause as above: the revoke never reaches the server.
  test("[QA-1] a revoked invite link gives the neutral message (AC7)", async ({
    page,
    browser,
  }, testInfo) => {
    const { wedding } = await seedWedding({ withPartnerB: false });
    await loginAs(page, wedding.founder, uniqueIp());
    const email = uniqueEmail("revoked.mail");
    await page.goto("/altro/invito");
    const form = page.getByTestId("invite-by-email-form");
    await form.locator("#invite-email").fill(email);
    await form.getByRole("button", { name: "Manda l'invito" }).click();
    await expect(page.getByTestId("partner-state-badge")).toHaveText("In attesa");
    const link = extractLinks(await waitForMessage(email)).find((l) => l.includes("/invito/"))!;

    await page.reload();
    await page.getByTestId("revoke-open").click();
    await page.getByTestId("revoke-confirm").click();
    await expect(page.getByTestId("partner-state-badge")).toHaveText("Revocato");

    const b = await newSession(browser, testInfo);
    await b.page.goto(new URL(link).pathname);
    await expect(b.page.getByTestId("invite-invalid")).toContainText("non è più valido");
    await expect(b.page.getByRole("link", { name: "Vai al login" })).toBeVisible();
    await b.context.close();
  });

  test("an expired invite link gives the neutral message (AC7)", async ({
    page,
    browser,
  }, testInfo) => {
    const { wedding, weddingId } = await seedWedding({ withPartnerB: false });
    await loginAs(page, wedding.founder, uniqueIp());
    const email = uniqueEmail("expired");
    await page.goto("/altro/invito");
    const form = page.getByTestId("invite-by-email-form");
    await form.locator("#invite-email").fill(email);
    await form.getByRole("button", { name: "Manda l'invito" }).click();
    await expect(page.getByTestId("partner-state-badge")).toHaveText("In attesa");
    const link = extractLinks(await waitForMessage(email)).find((l) => l.includes("/invito/"))!;

    // move the expiry into the past (time of the DB is tested by moving timestamps)
    const moved = await serviceClient()
      .from("invitations")
      .update({ expires_at: new Date(Date.now() - 3_600_000).toISOString() })
      .eq("wedding_id", weddingId)
      .is("accepted_at", null);
    expect(moved.error).toBeNull();

    const b = await newSession(browser, testInfo);
    await b.page.goto(new URL(link).pathname);
    await expect(b.page.getByTestId("invite-invalid")).toContainText("non è più valido");
    await b.context.close();
  });
});

test.describe("forgot the code, with emails on (AC57, D52)", () => {
  test("recovery link: opens by GET without consuming, POST sets the new code", async ({
    page,
    browser,
  }, testInfo) => {
    await clearMailbox({ baseUrl: CLI_MAILPIT_URL }).catch(() => undefined);
    const { partnerB } = await seedWedding();
    const b0 = partnerB!;
    await openLogin(page, uniqueIp());
    await page.getByText("Hai dimenticato il codice?").click();
    const recovery = page.getByTestId("recovery-form");
    await recovery.locator("#recovery-email").fill(b0.user.email);
    await recovery.getByRole("button", { name: "Mandami il link" }).click();
    await expect(page.getByTestId("recovery-feedback")).toContainText(
      "Se questo indirizzo può entrare",
    );

    const mail = await waitForMessage(b0.user.email, { baseUrl: CLI_MAILPIT_URL });
    const link = extractLinks(mail).find((l) => l.includes("token_hash"));
    expect(link, "recovery link in the Supabase Auth mail").toBeTruthy();
    const url = new URL(link!);
    const target = `/auth/conferma${url.search}`;

    const b = await newSession(browser, testInfo);
    await b.page.goto(target);
    await b.page.reload(); // GET does not consume the token
    await expect(b.page.getByTestId("recovery-confirm-form")).toBeVisible();
    const next = randomCode();
    await b.page.getByLabel("Il tuo nuovo codice").fill(next);
    await b.page.getByRole("button", { name: "Entra" }).click();
    await b.page.waitForURL((u) => !u.pathname.startsWith("/auth/conferma"), { timeout: 20_000 });
    await b.page.goto("/altro");
    await signOut(b.page);
    expect(await loginAs(b.page, { email: b0.user.email, code: next }, uniqueIp())).toBe("/");

    // the link is single-use
    const c = await newSession(browser, testInfo);
    await c.page.goto(target);
    await c.page.getByLabel("Il tuo nuovo codice").fill(randomCode());
    await c.page.getByRole("button", { name: "Entra" }).click();
    await expect(c.page.getByTestId("recovery-confirm-feedback")).toBeVisible();
    await b.context.close();
    await c.context.close();
  });
});
