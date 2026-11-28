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
import { expect, newFounder, serviceClient, test, uniqueIp } from "./support/fixtures";
import {
  addGuest,
  addGuestGroup,
  addRsvpLink,
  addTask,
  romeDate,
  seedWedding,
} from "./support/seed";

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

/**
 * FEAT-2026-004 T11 (AC1, AC2): the two RSVP flows that decide whether the guest page and the link
 * sheet work on an iPhone's engine. The clipboard is NOT exercised here: it is proved on a real
 * device (WebKit in Playwright does not grant it), as the plan says.
 */
test("RSVP: the public page opens and a guest sends the answers", async ({ page }) => {
  const w = await seedWedding({ templateTasks: false, names: { a: "Tony", b: "Jessica" } });
  const group = await addGuestGroup(w, "Famiglia Rossi");
  const anna = await addGuest(w, { firstName: "Anna", lastName: "Rossi", groupId: group });
  const marta = await addGuest(w, {
    firstName: "Marta",
    lastName: "Rossi",
    category: "child",
    groupId: group,
  });
  const link = await addRsvpLink(w, { groupId: group });
  await page.goto(link.path);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tony e Jessica si sposano");
  await expect(page.getByText("Solo se vieni")).toHaveCount(0); // hydrated
  await page.getByRole("button", { name: "Vengono tutti" }).click();
  await page.getByTestId(`rsvp-person-${anna}`).getByLabel("Vegetariano").check();
  await page.getByRole("button", { name: "Invia le risposte" }).click();
  await expect(
    page.getByRole("heading", { name: "Grazie! Abbiamo ricevuto le risposte" }),
  ).toBeVisible();
  await expect(page.getByTestId("rsvp-summary")).toContainText("Anna Rossi: Sì, vegetariano");
  await expect(page.getByTestId("rsvp-summary")).toContainText("Marta Rossi: Sì");
  const saved = await serviceClient()
    .from("rsvp_responses")
    .select("id, status")
    .eq("wedding_id", w.weddingId);
  expect(saved.data?.map((r) => r.id).sort()).toEqual([anna, marta].sort());
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
});

test("RSVP: the link sheet of Invitati opens and loads the link without errors", async ({
  page,
}) => {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console: ${message.text()}`);
  });
  const w = await seedWedding({ templateTasks: false, names: { a: "Tony", b: "Jessica" } });
  const mario = await addGuest(w, { firstName: "Mario", lastName: "Verdi" });
  await addRsvpLink(w, { guestId: mario });
  await loginAs(page, w.wedding.founder, uniqueIp());
  await page.goto("/invitati");
  await page.getByRole("button", { name: "Invia il link di Mario Verdi" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "Link di Mario Verdi" })).toBeVisible();
  await expect(sheet.getByLabel("Messaggio")).toHaveValue(
    /Ciao Mario! .*\/rsvp\/[A-Za-z0-9_-]{43}$/,
  );
  await expect(sheet.getByRole("button", { name: "Copia link" })).toBeVisible();
  await expect(sheet.getByRole("link", { name: "WhatsApp" })).toHaveAttribute(
    "href",
    /^https:\/\/wa\.me\/\?text=/,
  );
  await expect(sheet.getByRole("button", { name: "Nuovo link" })).toBeVisible();
  expect(problems).toEqual([]);
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
