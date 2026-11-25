/**
 * QA T17d: caching and the back button (plan row "Sicurezza e cache"; D42, AC62, AC1).
 *
 * AC map
 *  - AC1   private data is never stored by a browser or a shared cache: every private page answers
 *          `Cache-Control: no-store` (and noindex), also the data of a user never reaches another
 *  - AC62  after "Esci" the Back button shows no private data (no bfcache / HTTP cache copy)
 *  - NFR   two sessions alternating on the SAME URLs never see each other's data
 */
import { loginAs, signOut } from "./support/auth";
import { expect, newSession, test, uniqueIp } from "./support/fixtures";
import { addTask, romeDate, seedWedding } from "./support/seed";

test.describe.configure({ timeout: 90_000 });

const PRIVATE_PAGES = [
  "/",
  "/percorso",
  "/scelte",
  "/scelte/date",
  "/budget",
  "/altro",
  "/altro/account",
  "/altro/profili",
  "/altro/esporta",
  "/altro/info",
  "/guida",
  "/guida/budget",
];

test("private pages are no-store and noindex", async ({ page }) => {
  const w = await seedWedding();
  await loginAs(page, w.wedding.founder, uniqueIp());
  for (const route of PRIVATE_PAGES) {
    const response = await page.request.get(route);
    expect(response.status(), route).toBe(200);
    expect(response.headers()["cache-control"] ?? "", `${route} cache-control`).toMatch(/no-store/);
    expect(response.headers()["x-robots-tag"] ?? "", `${route} x-robots-tag`).toMatch(/noindex/);
  }
  const login = await page.request.get("/accesso");
  expect(login.headers()["x-robots-tag"] ?? "").toMatch(/noindex/);
});

test("after 'Esci' the Back button shows no private data (AC62)", async ({ page }) => {
  const w = await seedWedding({ templateTasks: false });
  const marker = `SEGRETO-${Date.now().toString(36)}`;
  await addTask(w, { title: marker, due: romeDate(10) });
  await loginAs(page, w.wedding.founder, uniqueIp());
  await page.goto("/percorso");
  await expect(page.getByText(marker)).toBeVisible();
  await page.goto("/budget");
  await page.goto("/altro");
  await signOut(page);
  await expect(page).toHaveURL(/\/accesso/);

  // walk back through the whole history: no step may show the marker, none may show a private page
  for (let i = 0; i < 4; i += 1) {
    await page.goBack({ waitUntil: "load" }).catch(() => undefined);
    // the guard sends a signed-out visit of a private page to the login: wait for it to settle
    await expect(page, `step ${i + 1} back`).toHaveURL(/\/accesso/);
    const body = await page.locator("body").innerText();
    expect(body, `step ${i + 1} back: ${page.url()}`).not.toContain(marker);
    expect(body, `step ${i + 1} back: private page shown`).not.toContain("Prossimo passo");
    await expect(page.getByTestId("login-form")).toBeVisible();
  }
});

test("a signed-out person cannot read the pages from the browser cache with the network cut (AC62)", async ({
  page,
  context,
}) => {
  const w = await seedWedding({ templateTasks: false });
  const marker = `OFFLINE-${Date.now().toString(36)}`;
  await addTask(w, { title: marker, due: romeDate(10) });
  await loginAs(page, w.wedding.founder, uniqueIp());
  await page.goto("/percorso");
  await expect(page.getByText(marker)).toBeVisible();
  await page.goto("/altro");
  await signOut(page);
  // offline: a cacheable response would still be served from the HTTP cache
  await context.setOffline(true);
  const response = await page.goto("/percorso").catch(() => null);
  const body = response
    ? await page
        .locator("body")
        .innerText()
        .catch(() => "")
    : "";
  expect(body).not.toContain(marker);
  await context.setOffline(false);
});

test("two sessions alternating on the same URLs never see each other's data", async ({
  page,
  browser,
}, testInfo) => {
  const one = await seedWedding({ templateTasks: false });
  const two = await seedWedding({ templateTasks: false });
  const markerOne = `UNO-${Date.now().toString(36)}`;
  const markerTwo = `DUE-${Date.now().toString(36)}`;
  await addTask(one, { title: markerOne, due: romeDate(10) });
  await addTask(two, { title: markerTwo, due: romeDate(10) });
  await loginAs(page, one.wedding.founder, uniqueIp());
  const other = await newSession(browser, testInfo);
  await loginAs(other.page, two.wedding.founder, uniqueIp());

  for (let round = 0; round < 3; round += 1) {
    for (const route of ["/percorso", "/budget", "/percorso"]) {
      await page.goto(route);
      await other.page.goto(route);
      if (route === "/percorso") {
        await expect(page.getByText(markerOne)).toBeVisible();
        await expect(page.getByText(markerTwo)).toHaveCount(0);
        await expect(other.page.getByText(markerTwo)).toBeVisible();
        await expect(other.page.getByText(markerOne)).toHaveCount(0);
      }
      expect(await page.content()).not.toContain(markerTwo);
      expect(await other.page.content()).not.toContain(markerOne);
    }
  }
  await other.context.close();
});
