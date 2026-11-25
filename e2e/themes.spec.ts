/**
 * QA T17d: the 12 themes (plan row "12 temi", AC49), light and dark, WCAG 2.2 AA.
 *
 * AC map
 *  - AC49  every one of the 12 approved themes, in light AND dark, passes axe (colour contrast,
 *          target size) on the Home; with E2E_AXE_MATRIX=1 (nightly CI) also on Percorso and
 *          Budget; the theme of the wedding is in the server-rendered HTML (`data-theme`), the
 *          cookie is the fallback when the wedding theme is unknown, a theme that is not approved
 *          falls back to the default; the gallery does not load every font up front
 *
 * The contrast of the palettes themselves is gated by unit tests (themes/contrast.test.ts); this is
 * the rendered-page proof.
 */
import { loginAs } from "./support/auth";
import { axeFindings, describeFindings } from "./support/axe";
import { expect, serviceClient, test, uniqueIp } from "./support/fixtures";
import {
  addGuest,
  addGuestGroup,
  addGuestTable,
  addLocation,
  addTask,
  romeDate,
  seedWedding,
} from "./support/seed";

test.describe.configure({ timeout: 360_000 });

const THEMES = [
  "giardino",
  "sera",
  "mediterraneo",
  "toscana",
  "essenziale",
  "rosa-antico",
  "art-deco",
  "boho",
  "provenza",
  "vivace",
  "velluto",
  "amalfi",
];
const MATRIX = process.env["E2E_AXE_MATRIX"] === "1";
// Guida pages (FEAT-2026-002 AC2): text and headings, links in the primary colour, a table
const GUIDE_SCREENS = ["/guida/budget", "/guida/home-e-novita", "/guida/temi-e-aspetto"];
const SCREENS = MATRIX ? ["/", "/percorso", "/budget", ...GUIDE_SCREENS] : ["/", ...GUIDE_SCREENS];

test("12 themes x light/dark: axe finds no contrast or target-size problem", async ({ page }) => {
  const w = await seedWedding({
    budgetCents: 2_000_000,
    scenarios: [
      { kind: "fixed", date_from: romeDate(400), label: "Primavera" },
      { kind: "fixed", date_from: romeDate(800), label: "Autunno" },
    ],
  });
  await addLocation(w, "Villa Rosa");
  await addTask(w, { title: "Compito in ritardo", due: romeDate(-3) });
  await loginAs(page, w.wedding.founder, uniqueIp());

  const failures: string[] = [];
  for (const theme of THEMES) {
    const saved = await serviceClient()
      .from("weddings")
      .update({ theme_id: theme })
      .eq("id", w.weddingId);
    expect(saved.error).toBeNull();
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const route of SCREENS) {
        await page.goto(route);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await page.waitForLoadState("networkidle");
        const findings = await axeFindings(page);
        if (findings.length) {
          failures.push(`${theme} / ${scheme} / ${route}\n${describeFindings(findings)}`);
        }
      }
    }
  }
  expect(failures, failures.join("\n\n")).toEqual([]);
});

test("12 themes x light/dark: the shared toast (title, action) passes axe contrast (QA-4)", async ({
  page,
}) => {
  const w = await seedWedding();
  for (const title of ["Compito uno", "Compito due", "Compito tre"]) {
    await addTask(w, { title, due: romeDate(10) });
  }
  await loginAs(page, w.wedding.founder, uniqueIp());
  const failures: string[] = [];
  for (const theme of THEMES) {
    const saved = await serviceClient()
      .from("weddings")
      .update({ theme_id: theme })
      .eq("id", w.weddingId);
    expect(saved.error).toBeNull();
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/percorso");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await page.waitForLoadState("networkidle");
      // three stacked "Annulla" toasts (title + action button), the worst case for overlap
      for (let i = 0; i < 3; i += 1) {
        await page
          .getByRole("checkbox", { name: /Segna come fatto/ })
          .first()
          .click();
        await expect(page.locator("li[data-sonner-toast]")).toHaveCount(i + 1);
      }
      await expect(page.locator("li[data-sonner-toast] button[data-action]").first()).toBeVisible();
      // axe reads the LIVE colours: while sonner's enter/stack transitions run (opacity, 0.4 s)
      // it sees a blended colour, which is not what a person sees. Wait for the final state.
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              document.querySelector("[data-sonner-toaster]")?.getAnimations({ subtree: true })
                .length ?? 0,
          ),
        )
        .toBe(0);
      const findings = await axeFindings(page, { include: "[data-sonner-toaster]" });
      if (findings.length) {
        failures.push(`${theme} / ${scheme}\n${describeFindings(findings)}`);
      }
      // put the tasks back (Annulla on each), so the next round starts from the same state
      for (let i = 0; i < 3; i += 1) {
        await page.locator("li[data-sonner-toast] button[data-action]").first().click();
      }
      await expect(page.locator("li[data-sonner-toast]")).toHaveCount(0);
      await page.waitForLoadState("networkidle");
    }
  }
  expect(failures, failures.join("\n\n")).toEqual([]);
});

test("12 themes x light/dark on /invitati: filter chips, selection, over-capacity table, import errors (FEAT-2026-003)", async ({
  page,
}) => {
  const w = await seedWedding({ templateTasks: false, names: { a: "Tony", b: "Jessica" } });
  const group = await addGuestGroup(w, "Famiglia Esempio");
  const table = await addGuestTable(w, "Tavolo Uno", { capacity: 1 });
  await addGuest(w, {
    firstName: "Anna",
    lastName: "Esempio",
    side: "A",
    groupId: group,
    tableId: table,
  });
  await addGuest(w, {
    firstName: "Bruno",
    lastName: "Esempio",
    side: "A",
    groupId: group,
    tableId: table,
  });
  await addGuest(w, { firstName: "Carla", lastName: "Prova", side: "B", category: "child" });
  await addGuest(w, { firstName: "Neo", lastName: "Prova", side: "both", category: "infant" });
  await loginAs(page, w.wedding.founder, uniqueIp());
  const settled = () =>
    expect
      .poll(
        () =>
          page.evaluate(
            () =>
              document
                .getAnimations()
                .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).length,
          ),
        { timeout: 10_000 },
      )
      .toBe(0);
  const mixed = [
    "nome;cognome;tipo;lato;gruppo;telefono;email;note",
    "Dora;Nuova;adulto;Tony;Gruppo Nuovo;;;",
    "anna;esempio;;;;;;",
    ";Senzanome;;;;;;",
    "Ennio;Errore;;Marte;;;;",
  ].join("\n");
  const failures: string[] = [];
  const check = async (label: string) => {
    await settled();
    const findings = await axeFindings(page);
    if (findings.length) failures.push(`${label}\n${describeFindings(findings)}`);
  };
  for (const theme of THEMES) {
    const saved = await serviceClient()
      .from("weddings")
      .update({ theme_id: theme })
      .eq("id", w.weddingId);
    expect(saved.error).toBeNull();
    for (const scheme of ["light", "dark"] as const) {
      const at = `${theme} / ${scheme}`;
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/invitati");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await page.waitForLoadState("networkidle");
      // 1. the list with an active filter (chip) and the summary notice of the table over capacity
      await page.getByTestId("filters-button").click();
      await page.getByRole("dialog").getByRole("radio", { name: "Tony" }).click();
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("filter-chips")).toBeVisible();
      await check(`${at} / filter chips`);
      // 2. selection mode with one person selected
      await page.getByRole("button", { name: "Altro", exact: true }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Seleziona" }).click();
      await page.getByRole("checkbox", { name: "Seleziona Anna Esempio" }).check();
      await check(`${at} / selection`);
      await page.getByTestId("selection-bar").getByRole("button", { name: "Fine" }).click();
      // 3. the Tavoli tab: a table over its capacity
      await page.getByRole("tab", { name: "Tavoli" }).click();
      await expect(page.getByText("Oltre la capienza di 1").first()).toBeVisible();
      await check(`${at} / table over capacity`);
      await page.getByRole("tab", { name: "Persone" }).click();
      // 4. the import preview: error cards, a warning, a new group
      await page.getByRole("button", { name: "Altro", exact: true }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Importa" }).click();
      await page.getByLabel("Una persona per riga").fill(mixed);
      await page.getByRole("button", { name: "Vedi l'anteprima" }).click();
      await expect(page.getByTestId("import-row-error").first()).toBeVisible();
      await check(`${at} / import preview`);
      await page.keyboard.press("Escape");
    }
  }
  expect(failures, failures.join("\n\n")).toEqual([]);
});

test("12 themes x light/dark: a toast WITH a description is readable and clears the bottom bar (DES-02)", async ({
  page,
}) => {
  const w = await seedWedding({ templateTasks: false });
  await addGuest(w, { firstName: "Prova", lastName: "Esempio" }); // not empty: "Altro" menu path
  await loginAs(page, w.wedding.founder, uniqueIp());
  const failures: string[] = [];
  for (const theme of THEMES) {
    const saved = await serviceClient()
      .from("weddings")
      .update({ theme_id: theme })
      .eq("id", w.weddingId);
    expect(saved.error).toBeNull();
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/invitati");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await page.waitForLoadState("networkidle");
      // import one person: the sheet closes and the "Annulla importazione" toast has a description
      await page.getByRole("button", { name: "Altro", exact: true }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Importa" }).click();
      await page.getByLabel("Una persona per riga").fill("Nuovo Esempio");
      await page.getByRole("button", { name: "Vedi l'anteprima" }).click();
      await page.getByRole("button", { name: /^Importa 1 / }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      const toast = page.locator("li[data-sonner-toast]").first();
      await expect(toast.locator("[data-description]")).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
      const findings = await axeFindings(page, { include: "[data-sonner-toaster]" });
      if (findings.length) {
        failures.push(`${theme} / ${scheme}\n${describeFindings(findings)}`);
      }
      // under 768 px the toast sits above the bottom bar, not over it
      const viewport = page.viewportSize();
      if (viewport && viewport.width < 768) {
        const toastBox = await toast.boundingBox();
        const navBox = await page.getByRole("navigation", { name: "Principale" }).boundingBox();
        if (!toastBox || !navBox || toastBox.y + toastBox.height > navBox.y) {
          failures.push(`${theme} / ${scheme}: the toast covers the bottom bar`);
        }
      }
      await toast.locator("button[data-action]").click();
      await expect(page.locator("li[data-sonner-toast]")).toHaveCount(0);
    }
  }
  expect(failures, failures.join("\n\n")).toEqual([]);
});

test("the dark mode really changes the page for every theme (not a no-op)", async ({ page }) => {
  const w = await seedWedding();
  await loginAs(page, w.wedding.founder, uniqueIp());
  for (const theme of THEMES) {
    await serviceClient().from("weddings").update({ theme_id: theme }).eq("id", w.weddingId);
    const background: Record<string, string> = {};
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/");
      await expect(page.locator("html")).toHaveAttribute("data-mode", scheme);
      background[scheme] = await page.evaluate(
        () => getComputedStyle(document.body).backgroundColor,
      );
    }
    expect(background["light"], theme).not.toBe(background["dark"]);
  }
});

test("the theme is in the server-rendered HTML, the cookie is the fallback, an unknown theme falls back to the default (AC49)", async ({
  page,
  request,
  baseURL,
  ip,
}) => {
  // a visitor with only the cookie (login page): the cookie wins when there is no wedding theme
  const response = await request.get("/accesso", {
    headers: { cookie: "r2y-theme=sera", "x-forwarded-for": ip },
  });
  expect(await response.text()).toMatch(/<html[^>]*data-theme="sera"/);
  const unknown = await request.get("/accesso", {
    headers: { cookie: "r2y-theme=not-a-theme", "x-forwarded-for": ip },
  });
  expect(await unknown.text()).toMatch(/<html[^>]*data-theme="giardino"/);

  // a signed-in person: the wedding's theme, in the HTML the server sends (no flash of the default)
  const w = await seedWedding();
  await serviceClient().from("weddings").update({ theme_id: "velluto" }).eq("id", w.weddingId);
  await loginAs(page, w.wedding.founder, uniqueIp());
  const html = await page.request.get(new URL("/", baseURL!).toString());
  expect(await html.text()).toMatch(/<html[^>]*data-theme="velluto"/);
});

test("the theme gallery does not download every font up front (AC49, font budget)", async ({
  page,
}) => {
  const w = await seedWedding();
  const fonts = new Set<string>();
  page.on("request", (request) => {
    if (/\.woff2?(\?|$)/.test(request.url())) fonts.add(request.url());
  });
  await loginAs(page, w.wedding.founder, uniqueIp());
  await page.goto("/altro/aspetto");
  await page.waitForLoadState("networkidle");
  const upFront = fonts.size;
  // choosing a theme loads that theme's fonts, and only then
  await page.getByRole("radio", { name: /Velluto/ }).click();
  await page.waitForLoadState("networkidle");
  test.info().annotations.push({
    type: "fonts",
    description: `font files before selecting a theme: ${upFront}; after: ${fonts.size}`,
  });
  // 12 themes x (heading + body) would be 24+ files: the gallery must stay well under that
  expect(upFront).toBeLessThan(20);
  expect(fonts.size).toBeGreaterThanOrEqual(upFront);
});
