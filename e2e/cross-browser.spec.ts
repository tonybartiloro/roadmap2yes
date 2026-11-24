/**
 * QA T17d (project `webkit-smoke`: Playwright WebKit, iPhone 13, 390 px; "Playwright WebKit", not
 * Safari): a short smoke of the three flows that decide whether the app is usable on an iPhone.
 *
 * AC map
 *  - AC12/AC54 login, then the first onboarding steps (password field, radio cards, date input)
 *  - AC30      the Percorso at 390 px: phases, filters sheet, a task sheet
 *  - NFR       no horizontal scroll, the bottom navigation stays inside the viewport and does not
 *              cover the last content (safe-area padding), `100dvh`-based shell
 * Real Safari / iOS stays a manual check (reviews/qa-a11y-checklist.md).
 */
import { loginAs } from "./support/auth";
import { expect, newFounder, test, uniqueIp } from "./support/fixtures";
import { addTask, romeDate, seedWedding } from "./support/seed";

test.describe.configure({ timeout: 90_000 });

test("login and the first onboarding steps", async ({ page }) => {
  const founder = await newFounder();
  expect(await loginAs(page, founder, uniqueIp())).toBe("/onboarding");
  await expect(page.getByTestId("onboarding-progress-text")).toHaveText("Passo 1 di 8");
  await page.locator("#you-first-name").fill("Tony");
  await page.getByTestId("step-continue").click();
  await expect(page.getByTestId("onboarding-progress-text")).toHaveText("Passo 2 di 8");
  // the partner step: radio cards, the code field with show/hide and "Genera"
  await page.getByTestId("partner-mode-code").click();
  await page.getByRole("button", { name: "Genera" }).click();
  expect((await page.locator("#partner-code").inputValue()).length).toBeGreaterThanOrEqual(10);
  await page.getByTestId("step-skip").click();
  await expect(page.getByTestId("onboarding-progress-text")).toHaveText("Passo 3 di 8");
  await page.getByTestId("choice-civile").click();
  await page.getByTestId("step-continue").click();
  // step 4: the native date input with the prefilled 3 Sep 2027
  await expect(page.locator("input[type=date]").first()).toHaveValue("2027-09-03");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
});

test("the Percorso at 390 px: phases, filters and a task sheet", async ({ page }) => {
  const w = await seedWedding({ templateTasks: false });
  await addTask(w, { title: "Prenotare il fotografo", due: romeDate(10) });
  await addTask(w, { title: "Scegliere le fedi", due: romeDate(-5) });
  await loginAs(page, w.wedding.founder, uniqueIp());
  await page.goto("/percorso");
  await expect(page.getByTestId("group-adesso")).toBeVisible();
  await expect(page.getByTestId("group-da-recuperare")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);

  // the bottom navigation is inside the viewport and visible
  const nav = page.getByRole("navigation", { name: "Principale" });
  await expect(nav).toBeVisible();
  const box = (await nav.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);

  await page.getByTestId("filters-button").click();
  await expect(page.getByTestId("filters-panel")).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByTestId("task-row")
    .filter({ hasText: "Prenotare il fotografo" })
    .getByTestId("task-title")
    .click();
  await expect(page.getByTestId("task-sheet")).toBeVisible();
  await expect(page.getByTestId("task-sheet")).toContainText("Prenotare il fotografo");
});

test("Home, Scelte and Budget open without horizontal scroll", async ({ page }) => {
  const w = await seedWedding({
    budgetCents: 2_000_000,
    scenarios: [{ kind: "fixed", date_from: romeDate(400) }],
  });
  await loginAs(page, w.wedding.founder, uniqueIp());
  for (const route of ["/", "/scelte", "/scelte/date", "/budget", "/altro"]) {
    await page.goto(route);
    await expect(page.getByRole("navigation", { name: "Principale" })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
      `${route} scrolls sideways`,
    ).toBeLessThanOrEqual(0);
  }
});
