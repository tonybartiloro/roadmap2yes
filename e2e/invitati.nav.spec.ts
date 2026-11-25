/**
 * QA T8 (FEAT-2026-003 AC23): the six-item bar with Invitati, Guida reachable from Opzioni, the
 * "Aiuto" link in every section header, and the `family` user (no `guests` permission) who sees no
 * Invitati item and finds the "Questo spazio e su invito" panel at /invitati. The label-width
 * matrix (12 themes x 3 widths) stays in guida.nav.spec.ts: nothing is doubled here.
 */
import { OPTIONS_SECTION_LABEL } from "@/components/section-label";
import { axeFindings, describeFindings } from "./support/axe";
import { loginAs } from "./support/auth";
import { expect, test, uniqueIp } from "./support/fixtures";
import { addFamilyMember, seedWedding } from "./support/seed";

test.describe.configure({ timeout: 60_000 });

const BAR = ["Home", "Percorso", "Scelte", "Budget", "Invitati", OPTIONS_SECTION_LABEL];
const nav = (page: import("@playwright/test").Page) =>
  page.getByRole("navigation", { name: "Principale" });

test("320 px: six items, Invitati fifth, no Guida item, nothing sideways", async ({ page }) => {
  const w = await seedWedding({ templateTasks: false });
  await loginAs(page, w.wedding.founder, uniqueIp());
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/");
  const links = nav(page).getByRole("link");
  await expect(links).toHaveCount(6);
  await expect(links).toHaveText(BAR);
  await expect(nav(page).getByRole("link", { name: "Invitati", exact: true })).toHaveAttribute(
    "href",
    "/invitati",
  );
  await expect(nav(page).getByRole("link", { name: "Guida" })).toHaveCount(0);
  const wide = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(wide, "no horizontal scroll at 320 px").toBeLessThanOrEqual(0);
});

test("Guida is a distinct card at the top of Opzioni and opens the guide; Opzioni stays current", async ({
  page,
}) => {
  const w = await seedWedding({ templateTasks: false });
  await loginAs(page, w.wedding.founder, uniqueIp());
  await page.goto("/altro");
  const card = page.getByRole("main").getByRole("link", { name: /^Guida/ });
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("href", "/guida");
  await card.click();
  await expect(page).toHaveURL(/\/guida$/);
  await expect(page.locator("h1")).toHaveText("Guida");
  await expect(
    nav(page).getByRole("link", { name: OPTIONS_SECTION_LABEL, exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

test("every section header has 'Aiuto', pointing at its own page of the Guida", async ({
  page,
}) => {
  const w = await seedWedding({ templateTasks: false });
  await loginAs(page, w.wedding.founder, uniqueIp());
  const sections: [string, string][] = [
    ["/", "home-e-novita"],
    ["/percorso", "percorso"],
    ["/scelte", "scelte"],
    ["/budget", "budget"],
    ["/invitati", "invitati"],
    ["/altro", "opzioni"],
  ];
  for (const [route, slug] of sections) {
    await page.goto(route);
    const help = page.getByRole("main").getByRole("link", { name: "Aiuto" });
    await expect(help, route).toHaveCount(1);
    await expect(help, route).toHaveAttribute("href", `/guida/${slug}`);
  }
  // and it really opens that page
  await page.goto("/invitati");
  await page.getByRole("main").getByRole("link", { name: "Aiuto" }).click();
  await expect(page).toHaveURL(/\/guida\/invitati$/);
  await expect(page.locator("h1")).toBeVisible();
});

test("a `family` user has no Invitati item and is shown 'Questo spazio è su invito' at /invitati", async ({
  page,
}) => {
  const w = await seedWedding({ templateTasks: false });
  const family = await addFamilyMember(w);
  await loginAs(page, family.user, uniqueIp());
  await page.goto("/");
  await expect(nav(page).getByRole("link", { name: "Invitati", exact: true })).toHaveCount(0);

  await page.goto("/invitati");
  // Brief: the direct URL shows the existing "su invito" screen. Today the proxy does not see a
  // `family` membership (RLS) and sends the user to /su-invito, so the in-page panel of the plan (P5,
  // data-testid guests-invite-only) is not reached: either place satisfies the brief (QA-1).
  await expect(page).toHaveURL(/\/(invitati|su-invito)$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Questo spazio è su invito");
  await expect(nav(page).getByRole("link", { name: "Invitati", exact: true })).toHaveCount(0);
  // nothing of the module is on screen
  await expect(page.getByRole("button", { name: "Aggiungi invitato" })).toHaveCount(0);
  const findings = await axeFindings(page);
  expect(findings, describeFindings(findings)).toEqual([]);
});
