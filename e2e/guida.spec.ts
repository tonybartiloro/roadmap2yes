/**
 * QA T9: Guida (FEAT-2026-002). Real docs/functional files, real login, no mocks.
 *
 * AC map
 *  - AC1  "Guida" is the 6th and last nav item, active on every guide page; the index lists the
 *         README table rows in order
 *  - AC2  no sideways scroll at 320 px, tables focusable and scrollable, links underlined
 *  - AC3  internal link stays in the Guida and moves focus to the title; no "Storico", no technical
 *         references
 *  - AC5  a missing page or an invalid path shows "Pagina non trovata" + "Torna alla Guida"
 *         (anonymous access: login.spec.ts, cache.spec.ts)
 *  - AC6  one h1, no skipped levels, document title, touch targets >= 44 px
 * The label of the "Opzioni/Altro" section is NOT asserted here (T10, guida.nav.spec.ts).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { loginAs } from "./support/auth";
import { expect, test, uniqueIp } from "./support/fixtures";
import { seedWedding } from "./support/seed";

test.describe.configure({ timeout: 90_000 });

const DOCS = path.join(process.cwd(), "docs", "functional");
const readDoc = (slug: string) => readFileSync(path.join(DOCS, `${slug}.md`), "utf8");

/** Rows of the README table, read independently of the app's own parser. */
function readmeRows(): { slug: string; label: string; description: string }[] {
  const rows = [
    ...readDoc("README").matchAll(/^\|\s*\[([^\]]+)\]\(([a-z0-9-]+)\.md\)\s*\|\s*(.+?)\s*\|\s*$/gm),
  ];
  return rows.map(([, label, slug, description]) => ({
    slug: slug!,
    label: label!,
    description: description!,
  }));
}

const h1Of = (slug: string) => /^# (.+)$/m.exec(readDoc(slug))?.[1]?.trim() ?? "";

async function enter(page: Page) {
  const w = await seedWedding({ templateTasks: false });
  await loginAs(page, w.wedding.founder, uniqueIp());
}

const nav = (page: Page) => page.getByRole("navigation", { name: "Principale" });

async function heights(page: Page, locator: ReturnType<Page["locator"]>) {
  const box = await locator.boundingBox();
  expect(box, "element has a box").not.toBeNull();
  return box!.height;
}

test.describe("index and menu (AC1)", () => {
  test("the index lists the README rows in order, each card a link to its page", async ({
    page,
  }) => {
    await enter(page);
    const rows = readmeRows();
    expect(rows.length).toBeGreaterThan(0);
    await page.goto("/guida");
    await expect(page.locator("h1")).toHaveText("Guida");
    const cards = page.locator("main ul li a");
    await expect(cards).toHaveCount(rows.length);
    for (const [i, row] of rows.entries()) {
      const card = cards.nth(i);
      await expect(card, row.slug).toHaveAttribute("href", `/guida/${row.slug}`);
      await expect(card).toContainText(row.label);
      await expect(card).toContainText(row.description);
    }
  });

  test("'Guida' is the last of 6 items and the active one on the index and on a page", async ({
    page,
  }) => {
    await enter(page);
    for (const route of ["/guida", "/guida/budget", "/guida/xyz"]) {
      await page.goto(route);
      const links = nav(page).getByRole("link");
      await expect(links, route).toHaveCount(6);
      const last = links.last();
      await expect(last, route).toHaveText("Guida");
      await expect(last, route).toHaveAttribute("aria-current", "page");
      await expect(nav(page).locator('[aria-current="page"]'), route).toHaveCount(1);
    }
    // and not active elsewhere
    await page.goto("/budget");
    await expect(nav(page).getByRole("link", { name: "Guida" })).not.toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

test.describe("links, focus and hidden changelog (AC3)", () => {
  test("an internal link stays in the Guida and moves focus to the title; back works", async ({
    page,
  }) => {
    await enter(page);
    await page.goto("/guida/home-e-novita");
    const title = page.locator("h1");
    await expect(title).toHaveText(h1Of("home-e-novita"));
    // first load of the document: focus is NOT stolen by the title
    await expect(title).not.toBeFocused();

    const link = page.getByRole("main").getByRole("link", { name: "Promemoria email" }).first();
    await expect(link).toHaveAttribute("href", "/guida/promemoria-email");
    await link.click();
    await expect(page).toHaveURL(/\/guida\/promemoria-email$/);
    await expect(page.locator("h1")).toHaveText(h1Of("promemoria-email"));
    await expect(page.locator("h1")).toBeFocused();

    await page.goBack();
    await expect(page).toHaveURL(/\/guida\/home-e-novita$/);
    await expect(page.locator("h1")).toHaveText(h1Of("home-e-novita"));
  });

  test("focus goes to the title from index to page, not when arriving from another section", async ({
    page,
  }) => {
    await enter(page);
    // arriving from the options section (href, so the label can change): no focus
    await page.goto("/altro");
    await nav(page).getByRole("link", { name: "Guida" }).click();
    await expect(page).toHaveURL(/\/guida$/);
    await expect(page.locator("h1")).toHaveText("Guida");
    await expect(page.locator("h1")).not.toBeFocused();

    // index -> page: focus on the title
    await page.getByRole("main").locator("ul li a").first().click();
    await expect(page).toHaveURL(/\/guida\/[a-z0-9-]+$/);
    await expect(page.locator("h1")).toBeFocused();

    // and back from another section again: no focus
    await page.goto("/altro");
    await nav(page).getByRole("link", { name: "Guida" }).click();
    await expect(page).toHaveURL(/\/guida$/);
    await page.getByRole("main").locator("ul li a").first().click();
    await expect(page.locator("h1")).toBeFocused();
  });

  test("no page shows the 'Storico delle modifiche' or a technical reference", async ({ page }) => {
    await enter(page);
    for (const { slug } of readmeRows()) {
      const response = await page.request.get(`/guida/${slug}`);
      expect(response.status(), slug).toBe(200);
      const html = await response.text();
      expect(html, `${slug}: changelog`).not.toContain("Storico delle modifiche");
      expect(html, `${slug}: technical`).not.toContain("docs/technical");
    }
  });

  test("the changelog heading of a source file is really in the file but not in the page", async ({
    page,
  }) => {
    // guard against a vacuous test: the file has it, the app hides it
    expect(readDoc("budget")).toContain("## Storico delle modifiche");
    await enter(page);
    await page.goto("/guida/budget");
    await expect(page.getByText("Storico delle modifiche")).toHaveCount(0);
    await expect(page.getByText("FEAT-2026-001")).toHaveCount(0);
  });
});

test.describe("reading at 320 px (AC2, AC6)", () => {
  test("no sideways scroll; tables are reachable by keyboard; links are underlined", async ({
    page,
  }) => {
    await enter(page);
    await page.setViewportSize({ width: 320, height: 800 });
    for (const slug of ["budget", "temi-e-aspetto", "onboarding", "esportazione"]) {
      await page.goto(`/guida/${slug}`);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${slug}: sideways scroll`).toBeLessThanOrEqual(0);
    }

    // a page with a table: Tab reaches the scrollable region, which has a name
    await page.goto("/guida/temi-e-aspetto");
    const region = page.getByRole("region", { name: /Tabella/ }).first();
    await expect(region).toHaveCount(1);
    await expect(region).toHaveAttribute("tabindex", "0");
    let reached = false;
    for (let i = 0; i < 40 && !reached; i += 1) {
      await page.keyboard.press("Tab");
      reached = await region.evaluate((el) => el === document.activeElement);
    }
    expect(reached, "Tab reaches the table region").toBe(true);
    const scrolls = await region.evaluate((el) => el.scrollWidth > el.clientWidth);
    if (scrolls) {
      await page.keyboard.press("ArrowRight");
      await expect.poll(() => region.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    } else {
      test.info().annotations.push({
        type: "note",
        description: "temi-e-aspetto: the table fits at 320 px, so there is nothing to scroll",
      });
    }
    await expect(page.locator("th").first()).toHaveAttribute("scope", "col");

    // links are distinguishable without colour
    await page.goto("/guida/home-e-novita");
    const link = page.getByRole("main").getByRole("link", { name: "Promemoria email" }).first();
    expect(await link.evaluate((el) => getComputedStyle(el).textDecorationLine)).toContain(
      "underline",
    );
  });

  test("touch targets are at least 44 px: nav item, card, '← Guida', 'Torna alla Guida'", async ({
    page,
  }) => {
    await enter(page);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/guida");
    expect(
      await heights(page, nav(page).getByRole("link", { name: "Guida" })),
    ).toBeGreaterThanOrEqual(44);
    expect(await heights(page, page.locator("main ul li a").first())).toBeGreaterThanOrEqual(44);

    await page.goto("/guida/budget");
    for (const name of ["← Guida", "Torna alla Guida"]) {
      const link = page.getByRole("main").getByRole("link", { name });
      expect(await heights(page, link), name).toBeGreaterThanOrEqual(44);
    }
    await page.goto("/guida/xyz");
    expect(
      await heights(page, page.getByRole("main").getByRole("link", { name: "Torna alla Guida" })),
    ).toBeGreaterThanOrEqual(44);
  });
});

test.describe("document title and structure (AC6)", () => {
  test("titles: index and pages", async ({ page }) => {
    await enter(page);
    await page.goto("/guida");
    await expect(page).toHaveTitle("Guida · roadmap2yes");
    for (const slug of ["budget", "temi-e-aspetto"]) {
      await page.goto(`/guida/${slug}`);
      await expect(page).toHaveTitle(`${h1Of(slug)} · Guida · roadmap2yes`);
    }
  });

  test("one h1 (the file's) and no skipped heading level on every page", async ({ page }) => {
    await enter(page);
    const slugs = ["", ...readmeRows().map((row) => `/${row.slug}`)];
    for (const rest of slugs) {
      await page.goto(`/guida${rest}`);
      await expect(page.locator("h1")).toHaveCount(1);
      const levels = await page
        .locator("main")
        .locator("h1, h2, h3, h4, h5, h6")
        .evaluateAll((els) => els.map((el) => Number(el.tagName.slice(1))));
      expect(levels[0], `${rest}: starts with h1`).toBe(1);
      for (let i = 1; i < levels.length; i += 1) {
        expect(levels[i]! - levels[i - 1]!, `${rest}: ${levels.join(",")}`).toBeLessThanOrEqual(1);
      }
      if (rest) await expect(page.locator("h1")).toHaveText(h1Of(rest.slice(1)));
    }
  });
});

test.describe("missing page and invalid paths (AC5)", () => {
  for (const route of [
    "/guida/xyz",
    "/guida/a/b",
    "/guida/budget/extra",
    "/guida/README",
    "/guida/Budget",
    "/guida/budget.md",
    "/guida/..%2Fpackage",
  ]) {
    test(`${route} shows 'Pagina non trovata' with a way back`, async ({ page }) => {
      await enter(page);
      await page.goto(route);
      await expect(page.getByRole("heading", { name: "Pagina non trovata" })).toBeVisible();
      await page.getByRole("main").getByRole("link", { name: "Torna alla Guida" }).click();
      await expect(page).toHaveURL(/\/guida$/);
      await expect(page.locator("h1")).toHaveText("Guida");
    });
  }
});
