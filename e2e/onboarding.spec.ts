/**
 * QA T17a: the 8-step onboarding end to end (plan rows "Onboarding", "complete_onboarding").
 *
 * AC map
 *  - AC12  one question per screen, text indicator "Passo N di 8", the prescribed order, the first
 *          date scenario prefilled with 3 Sep 2027, every step saved on "Continua", resumable
 *  - AC13  "Non lo so ancora" is valid on every skippable step
 *  - AC14  on completion: partners A/B, scenarios, budget categories, Percorso, B's access; lands
 *          on the home
 *  - AC15  partial answers (no date): the app works, the home proposes the date decision
 *  - AC46  generic partner A/B with a chosen label, no date of birth anywhere
 *  - AC49  a theme chosen in the last step is saved on the wedding
 *  - 360 px: every step reflows without horizontal scroll
 */
import type { Page } from "@playwright/test";
import { loginAs, openLogin, submitLogin } from "./support/auth";
import { expect, newFounder, newSession, serviceClient, test, uniqueIp } from "./support/fixtures";
import { uniqueEmail } from "../tests/support/supabase";

test.describe.configure({ timeout: 90_000 });

const progress = (page: Page) => page.getByTestId("onboarding-progress-text");
const next = (page: Page) => page.getByTestId("step-continue");
const skip = (page: Page) => page.getByTestId("step-skip");

/** After "Concludi": the summary (if it stays) or the home; ends on the home either way. */
async function landOnHome(page: Page) {
  const summary = page.getByTestId("onboarding-summary");
  const home = page.getByRole("heading", { name: /^Ciao/ });
  // (the summary may flash for a few ms before the redirect, see QA-2: never click it blindly)
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && !(await home.isVisible().catch(() => false))) {
    if (await summary.isVisible().catch(() => false)) {
      await page
        .getByTestId("summary-home")
        .click({ timeout: 1_000 })
        .catch(() => undefined);
    }
    await page.waitForTimeout(100);
  }
  await expect(home).toBeVisible({ timeout: 5_000 });
  await expect(page).toHaveURL(/\/$/);
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("full onboarding", () => {
  test("all eight steps in order, then the summary and the home (AC12, AC14, AC46, AC49)", async ({
    page,
    browser,
  }, testInfo) => {
    const founder = await newFounder("sposo");
    expect(await loginAs(page, founder, uniqueIp())).toBe("/onboarding");
    const partnerEmail = uniqueEmail("jessica");

    // 1. you
    await expect(progress(page)).toHaveText("Passo 1 di 8");
    await expect(page.getByTestId("onboarding-title")).toHaveText(
      "Iniziamo da te: come ti chiami?",
    );
    await expect(page.locator("#you-email")).toHaveValue(founder.email);
    await expect(page.locator("#you-email")).toHaveAttribute("readonly", "");
    // the label starts from the role of the bootstrap/founder account (sposo)
    await expect(page.getByLabel("Sposo", { exact: true })).toBeChecked();
    // a missing first name is refused inline
    await next(page).click();
    await expect(page.getByText("Scrivi il tuo nome.")).toBeVisible();
    await page.locator("#you-first-name").fill("Tony");
    await page.locator("#you-last-name").fill("Rossi");
    await expectNoHorizontalScroll(page);
    await next(page).click();

    // 2. partner, with an initial code
    await expect(progress(page)).toHaveText("Passo 2 di 8");
    await expect(page.getByTestId("onboarding-title")).toContainText("Ora il tuo partner");
    // same email as mine: refused
    await page.locator("#partner-email").fill(founder.email);
    await page.getByTestId("partner-mode-code").click();
    await page.getByRole("button", { name: "Genera" }).click();
    await next(page).click();
    await expect(progress(page)).toHaveText("Passo 2 di 8");
    await expect(
      page.getByTestId("onboarding-error").or(page.locator("#partner-email-error")),
    ).toBeVisible();
    await page.locator("#partner-email").fill(partnerEmail);
    await page.locator("#partner-first-name").fill("Jessica");
    await page.locator("#partner-last-name").fill("Bianchi");
    const code = await page.locator("#partner-code").inputValue();
    expect(code.length).toBeGreaterThanOrEqual(10);
    await expectNoHorizontalScroll(page);
    await next(page).click();

    // 3. rite
    await expect(progress(page)).toHaveText("Passo 3 di 8");
    await expect(page.getByTestId("onboarding-title")).toHaveText(
      "Che tipo di cerimonia avete in mente?",
    );
    // nothing selected: refused
    await next(page).click();
    await expect(page.getByText("Scegli un'opzione, anche «Non lo so ancora».")).toBeVisible();
    await page.getByTestId("choice-religioso").click();
    await next(page).click();

    // 4. dates: the first scenario is prefilled with 3 Sep 2027 (AC12); add a period too
    await expect(progress(page)).toHaveText("Passo 4 di 8");
    await expect(page.getByTestId("scenario-item")).toHaveCount(1);
    await expect(page.locator("input[type=date]").first()).toHaveValue("2027-09-03");
    await page.getByTestId("scenario-add").click();
    await expect(page.getByTestId("scenario-item")).toHaveCount(2);
    await page.getByTestId("scenario-item").nth(1).getByTestId("scenario-kind-period").click();
    await expectNoHorizontalScroll(page);
    await next(page).click();

    // 5. guests
    await expect(progress(page)).toHaveText("Passo 5 di 8");
    await page.getByTestId("choice-50_80").click();
    await next(page).click();

    // 6. budget
    await expect(progress(page)).toHaveText("Passo 6 di 8");
    await page.getByLabel("Budget totale").fill("25.000");
    await next(page).click();

    // 7. style
    await expect(progress(page)).toHaveText("Passo 7 di 8");
    await page.getByTestId("style-choices").getByRole("radio").first().click();
    await page.getByTestId("region-select").click();
    await page.getByRole("option", { name: "Toscana" }).click();
    await page.locator("#comune").fill("Siena");
    await next(page).click();

    // 8. theme
    await expect(progress(page)).toHaveText("Passo 8 di 8");
    await page.getByRole("radio", { name: /Sera/ }).click();
    await page.getByRole("button", { name: "Usa questo tema" }).click();
    await expect(page.getByText("Tema applicato.").first()).toBeVisible();
    await page.getByTestId("step-finish").click();

    // the summary is covered by the [QA-2] test below; here: the person lands on the home (AC14)
    await landOnHome(page);

    // what was created (AC14): A/B, scenarios, categories, tasks, theme, B's access
    const wedding = await serviceClient()
      .from("weddings")
      .select("id,rite,guest_band,region,comune,theme_id,onboarding_completed_at")
      .eq("created_by", founder.id)
      .single();
    expect(wedding.data?.rite).toBe("religioso");
    expect(wedding.data?.guest_band).toBe("50_80");
    expect(wedding.data?.region).toBe("Toscana");
    expect(wedding.data?.theme_id).toBe("sera");
    expect(wedding.data?.onboarding_completed_at).not.toBeNull();
    const weddingId = wedding.data!.id;
    const partners = await serviceClient()
      .from("wedding_partners")
      .select("slot,first_name,last_name,email,label")
      .eq("wedding_id", weddingId)
      .order("slot");
    expect(partners.data?.map((p) => p.slot)).toEqual(["A", "B"]);
    expect(partners.data?.[0]?.label).toBe("sposo");
    expect(partners.data?.[1]?.email).toBe(partnerEmail);
    const scenarios = await serviceClient()
      .from("date_scenarios")
      .select("kind,date_from")
      .eq("wedding_id", weddingId);
    expect(scenarios.data).toHaveLength(2);
    expect(scenarios.data?.some((s) => s.date_from === "2027-09-03")).toBe(true);
    const categories = await serviceClient()
      .from("budget_categories")
      .select("id", { count: "exact", head: true })
      .eq("wedding_id", weddingId);
    expect(categories.count).toBe(11);
    const tasks = await serviceClient()
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("wedding_id", weddingId);
    expect(tasks.count).toBeGreaterThan(5);
    const total = await serviceClient()
      .from("budget_versions")
      .select("total_cents")
      .eq("wedding_id", weddingId);
    expect(total.data?.[0]?.total_cents).toBe(2_500_000);

    // the home
    await expect(page.getByRole("heading", { name: /Ciao Tony/ })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "sera");

    // B enters with the code A generated (AC4): A's space, never a new one
    const b = await newSession(browser, testInfo);
    expect(await loginAs(b.page, { email: partnerEmail, code }, uniqueIp())).toBe("/");
    await expect(b.page.locator("html")).toHaveAttribute("data-theme", "sera"); // AC49: same theme for both
    await b.context.close();
  });

  /** Steps 2-8 answered with "Non lo so ancora" / "Più tardi", up to and including "Concludi". */
  async function skipEverything(page: Page, firstName: string) {
    await page.locator("#you-first-name").fill(firstName);
    await next(page).click();
    await expect(progress(page)).toHaveText("Passo 2 di 8");
    await skip(page).click();
    await expect(progress(page)).toHaveText("Passo 3 di 8");
    await page.getByTestId("choice-unknown").click();
    await next(page).click();
    await expect(progress(page)).toHaveText("Passo 4 di 8");
    await skip(page).click();
    await expect(progress(page)).toHaveText("Passo 5 di 8");
    await page.getByTestId("choice-unknown").click();
    await next(page).click();
    await expect(progress(page)).toHaveText("Passo 6 di 8");
    await skip(page).click();
    await expect(progress(page)).toHaveText("Passo 7 di 8");
    await skip(page).click();
    await expect(progress(page)).toHaveText("Passo 8 di 8");
    await skip(page).click();
  }

  // [QA-2 DEFECT] the summary "Ecco il tuo percorso" is on screen for ~40 ms: the action's
  // revalidatePath re-renders /onboarding, which now redirects to "/". The reminder to hand over B's
  // code and the one-time invite link (shown only here) are lost. Kept failing until fixed.
  test("[QA-2] the summary stays until 'Vai alla home' is chosen (AC14)", async ({ page }) => {
    const founder = await newFounder("sposa");
    await loginAs(page, founder, uniqueIp());
    await skipEverything(page, "Giulia");
    await expect(page.getByTestId("onboarding-summary")).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(2500);
    await expect(page.getByTestId("onboarding-summary")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ecco il tuo percorso" })).toBeVisible();
    await expect(page.getByTestId("summary-reference")).toContainText("Data da decidere");
    await expect(page.getByTestId("summary-invite")).toContainText("Non hai ancora aggiunto");
    await page.getByTestId("summary-home").click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("an onboarding with only 'Non lo so ancora' works: no date, home proposes the date (AC13, AC15)", async ({
    page,
  }) => {
    const founder = await newFounder("sposa");
    await loginAs(page, founder, uniqueIp());
    await skipEverything(page, "Giulia");
    await landOnHome(page);
    await expect(page.getByText("data da decidere", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Scegli la data" }).first()).toBeVisible();
    // the Percorso opens with the date-independent milestones, including "Scegli il rito" in Adesso
    await page.goto("/percorso");
    await expect(page.getByTestId("percorso")).toBeVisible();
    await expect(page.getByRole("button", { name: "Scegliere il rito" })).toBeVisible();
    await expect(page.getByRole("region", { name: /^Adesso/ })).toContainText("Scegliere il rito");
  });
});

test.describe("resumable onboarding (AC12)", () => {
  test("a reload in the middle resumes from the last confirmed step, keeping what was saved", async ({
    page,
    browser,
  }, testInfo) => {
    const founder = await newFounder();
    await loginAs(page, founder, uniqueIp());
    await page.locator("#you-first-name").fill("Tony");
    await next(page).click();
    await skip(page).click(); // partner: later
    await page.getByTestId("choice-civile").click();
    await next(page).click();
    await expect(progress(page)).toHaveText("Passo 4 di 8");

    // reload at step 4: resumes there
    await page.reload();
    await expect(progress(page)).toHaveText("Passo 4 di 8");
    await expect(page.getByTestId("onboarding-resume")).toContainText(
      "riprendiamo dal passo 4 di 8",
    );

    // and from another device/session after a fresh login
    const other = await newSession(browser, testInfo);
    await openLogin(other.page, uniqueIp());
    await submitLogin(other.page, founder);
    await other.page.waitForURL((url) => url.pathname === "/onboarding");
    await expect(progress(other.page)).toHaveText("Passo 4 di 8");
    // going back keeps the saved answers
    await other.page.getByRole("button", { name: "Indietro" }).click();
    await expect(progress(other.page)).toHaveText("Passo 3 di 8");
    await expect(other.page.getByTestId("choice-civile")).toBeChecked();
    await other.context.close();

    // the data is in the database after each step, not only at the end
    const wedding = await serviceClient()
      .from("weddings")
      .select("rite")
      .eq("created_by", founder.id)
      .single();
    expect(wedding.data?.rite).toBe("civile");
  });

  test("a founder who logs in again with an unfinished onboarding is sent back to it", async ({
    page,
    browser,
  }, testInfo) => {
    const founder = await newFounder();
    await loginAs(page, founder, uniqueIp());
    await page.locator("#you-first-name").fill("Tony");
    await next(page).click();
    await expect(progress(page)).toHaveText("Passo 2 di 8");
    const other = await newSession(browser, testInfo);
    expect(await loginAs(other.page, founder, uniqueIp())).toBe("/onboarding");
    await expect(progress(other.page)).toHaveText("Passo 2 di 8");
    await other.context.close();
  });
});
