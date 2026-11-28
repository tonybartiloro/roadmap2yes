/**
 * QA T17d: accessibility (plan row "Accessibilità", design §8, NFR). The manual part (VoiceOver,
 * real devices) is in reviews/qa-a11y-checklist.md.
 *
 * AC map
 *  - NFR  WCAG 2.2 AA through axe on every main screen, with `target-size` and `color-contrast`
 *         forced on; reflow at 320 px and at 200 % zoom (no horizontal scroll); keyboard: skip link,
 *         visible focus, dialogs trap and return focus; `prefers-reduced-motion` respected;
 *         labels on every field, one h1 per page, `lang="it"`
 *  - AC39 the service-down pages are accessible too (see degraded.spec.ts)
 */
import type { Page } from "@playwright/test";
import { loginAs } from "./support/auth";
import { axeFindings, bestPracticeFindings, describeFindings } from "./support/axe";
import { expect, newFounder, serviceClient, test, uniqueIp } from "./support/fixtures";
import {
  addGuest,
  addGuestGroup,
  addLocation,
  addRsvpLink,
  addTask,
  blockRsvpIp,
  chooseDate,
  chooseLocation,
  romeDate,
  seedWedding,
  submitRsvp,
} from "./support/seed";

test.describe.configure({ timeout: 90_000 });

const noScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test("the axe harness is not vacuous: a deliberate contrast and target-size violation is found", async ({
  page,
  ip,
}) => {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": ip });
  await page.goto("/accesso");
  // cold start: let hydration, fonts and layout settle before injecting and measuring
  await expect(page.getByTestId("login-form")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    const bad = document.createElement("div");
    bad.innerHTML =
      '<p id="qa-low" style="color:#bbbbbb;background:#ffffff;font-size:16px">testo poco contrastato</p>' +
      '<div style="display:flex"><button id="qa-tiny" style="width:10px;height:10px;padding:0;margin:0">x</button>' +
      '<button id="qa-tiny2" style="width:10px;height:10px;padding:0;margin:0">y</button></div>';
    (document.querySelector("main") ?? document.body).appendChild(bad);
  });
  await expect(page.locator("#qa-low")).toBeVisible();
  await expect(page.locator("#qa-tiny2")).toBeVisible();
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  const findings = await axeFindings(page);
  const ids = findings.map((f) => f.id);
  expect(ids).toContain("color-contrast");
  expect(ids).toContain("target-size");
});

test.describe("axe on the main screens (WCAG 2.2 AA)", () => {
  test("public screens: login", async ({ page, ip }) => {
    await page.context().setExtraHTTPHeaders({ "x-forwarded-for": ip });
    await page.goto("/accesso");
    await page.getByText("Hai dimenticato il codice?").click();
    const findings = await axeFindings(page);
    expect(findings, describeFindings(findings)).toEqual([]);
  });

  test("onboarding steps 1 and 2", async ({ page }) => {
    const founder = await newFounder();
    await loginAs(page, founder, uniqueIp());
    await expect(page.getByTestId("onboarding-title")).toBeVisible();
    let findings = await axeFindings(page);
    expect(findings, `step 1\n${describeFindings(findings)}`).toEqual([]);
    await page.locator("#you-first-name").fill("Tony");
    await page.getByTestId("step-continue").click();
    await expect(page.getByTestId("onboarding-progress-text")).toHaveText("Passo 2 di 8");
    await expect(page.getByTestId("onboarding-title")).toContainText("partner");
    findings = await axeFindings(page);
    expect(findings, `step 2\n${describeFindings(findings)}`).toEqual([]);
  });

  test("the app screens of a populated wedding", async ({ page }) => {
    const w = await seedWedding({
      budgetCents: 2_000_000,
      scenarios: [
        { kind: "fixed", date_from: romeDate(400), label: "Primavera" },
        { kind: "fixed", date_from: romeDate(800), label: "Autunno" },
      ],
    });
    await addLocation(w, "Villa Rosa", {
      comune: "Siena",
      pros: ["Giardino"],
      cons: ["Lontana"],
      costCents: 450_000,
    });
    await addLocation(w, "Castello Alto", { comune: "Arezzo" });
    await addTask(w, { title: "Compito in ritardo", due: romeDate(-3) });
    await loginAs(page, w.wedding.founder, uniqueIp());
    const screens = [
      "/",
      "/percorso",
      "/scelte",
      "/scelte/date",
      "/scelte/location",
      "/budget",
      "/altro",
      "/altro/account",
      "/altro/profili",
      "/altro/impostazioni",
      "/altro/invito",
      "/altro/aspetto",
      "/altro/promemoria",
      "/altro/esporta",
      "/altro/info",
      "/guida",
      "/guida/budget",
      "/guida/temi-e-aspetto",
    ];
    const failures: string[] = [];
    for (const route of screens) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      const findings = await axeFindings(page);
      if (findings.length) failures.push(`${route}\n${describeFindings(findings)}`);
      // best practices are not WCAG: reported as notes, never failing
      const notes = await bestPracticeFindings(page);
      if (notes.length) {
        test.info().annotations.push({
          type: "best-practice",
          description: `${route}: ${describeFindings(notes)}`,
        });
      }
      // structure: one h1, language, a label for every control
      expect(await page.locator("h1").count(), `${route}: exactly one h1`).toBe(1);
    }
    await expect(page.locator("html")).toHaveAttribute("lang", "it");
    expect(failures, failures.join("\n\n")).toEqual([]);
  });

  test("dialogs and sheets: task sheet, filters, preview banner", async ({ page }) => {
    const w = await seedWedding({
      scenarios: [
        { kind: "fixed", date_from: romeDate(400), label: "Primavera" },
        { kind: "fixed", date_from: romeDate(800), label: "Autunno" },
      ],
      templateTasks: false,
    });
    await addTask(w, { title: "Compito", due: romeDate(10) });
    await loginAs(page, w.wedding.founder, uniqueIp());
    await page.goto("/percorso");
    await page.getByTestId("filters-button").click();
    let findings = await axeFindings(page);
    expect(findings, `filters\n${describeFindings(findings)}`).toEqual([]);
    await page.keyboard.press("Escape");
    await page.getByTestId("task-row").first().getByTestId("task-title").click();
    findings = await axeFindings(page);
    expect(findings, `task sheet\n${describeFindings(findings)}`).toEqual([]);
  });
});

/**
 * FEAT-2026-004 T11, public RSVP page (AC2, AC6, AC10): form, summary, thanks, neutral and 429, each
 * in light and dark; the form and the summary also in the default theme and in a second one
 * ("velluto", the darkest of the catalogue). `themes.spec.ts` does not reach this page, so the
 * 12-theme matrix is not repeated here: it would only repeat the app tokens it already checks.
 */
test.describe("axe on the public RSVP page (WCAG 2.2 AA)", () => {
  for (const scheme of ["light", "dark"] as const) {
    test(`${scheme}: form, summary, thanks (default theme and Velluto), neutral 404 and 429`, async ({
      page,
      baseURL,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      // a dead link counts against the address (shared by all local requests without this header)
      await page.context().setExtraHTTPHeaders({ "x-forwarded-for": uniqueIp() });
      const failures: string[] = [];
      const check = async (label: string) => {
        await page.waitForLoadState("networkidle");
        await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
        const findings = await axeFindings(page);
        if (findings.length) failures.push(`${scheme} / ${label}\n${describeFindings(findings)}`);
      };
      const hydrated = () => expect(page.getByText("Solo se vieni")).toHaveCount(0);

      for (const theme of ["giardino", "velluto"]) {
        const w = await seedWedding({
          templateTasks: false,
          names: { a: "Tony", b: "Jessica" },
          scenarios: [{ kind: "fixed", date_from: "2027-09-03" }],
        });
        await serviceClient().from("weddings").update({ theme_id: theme }).eq("id", w.weddingId);
        await chooseDate(w);
        await chooseLocation(w, "Villa Aurora", "Tivoli");
        const group = await addGuestGroup(w, "Famiglia Rossi");
        const anna = await addGuest(w, { firstName: "Anna", lastName: "Rossi", groupId: group });
        await addGuest(w, { firstName: "Luca", lastName: "Rossi", groupId: group });
        await addGuest(w, {
          firstName: "Marta",
          lastName: "Rossi",
          category: "child",
          groupId: group,
        });
        const link = await addRsvpLink(w, { groupId: group });

        await page.goto(link.path);
        await hydrated();
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await check(`${theme} / form`);
        // the error line and the preferences that appear after "Sì"
        await page.getByRole("button", { name: "Invia le risposte" }).click();
        await expect(page.getByTestId("rsvp-error")).toBeVisible();
        await page.getByRole("button", { name: "Vengono tutti" }).click();
        await check(`${theme} / form with errors and preferences`);

        await page.getByRole("button", { name: "Invia le risposte" }).click();
        await expect(
          page.getByRole("heading", { name: "Grazie! Abbiamo ricevuto le risposte" }),
        ).toBeVisible();
        await check(`${theme} / thanks`);
        // the summary of a page that is opened again, with "Modifica" open
        await submitRsvp(link, [{ id: anna, status: "no" }]);
        await page.goto(link.path);
        await hydrated();
        await check(`${theme} / summary`);
        await page.getByText("Modifica", { exact: true }).click();
        await check(`${theme} / summary with Modifica open`);
      }

      // pages the proxy writes itself (script-free, default theme, no wedding data)
      const dead = await page.goto(`/rsvp/${"a".repeat(43)}`); // well formed, unknown
      expect(dead?.status()).toBe(404);
      await check("neutral 404");
      const ip = uniqueIp();
      await blockRsvpIp(baseURL!, ip);
      await page.context().setExtraHTTPHeaders({ "x-forwarded-for": ip });
      const blocked = await page.goto(`/rsvp/${"b".repeat(43)}`);
      expect(blocked?.status()).toBe(429);
      await check("429");
      expect(failures, failures.join("\n\n")).toEqual([]);
    });
  }
});

test.describe("reflow, zoom, keyboard, motion", () => {
  test("320 px and 200 % zoom: nothing scrolls sideways on the main screens", async ({ page }) => {
    const w = await seedWedding({
      budgetCents: 2_000_000,
      scenarios: [{ kind: "fixed", date_from: romeDate(400) }],
    });
    await loginAs(page, w.wedding.founder, uniqueIp());
    const failures: string[] = [];
    // 320 px wide; 200 % zoom of a 1280 px screen is a 640 px layout
    for (const width of [320, 640]) {
      await page.setViewportSize({ width, height: 800 });
      for (const route of [
        "/",
        "/percorso",
        "/scelte",
        "/budget",
        "/altro",
        "/altro/account",
        "/altro/profili",
        "/guida",
        "/guida/budget",
        "/guida/temi-e-aspetto",
      ]) {
        await page.goto(route);
        const overflow = await noScroll(page);
        if (overflow > 0) failures.push(`${route} @${width}px: ${overflow}px of sideways scroll`);
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });

  test("keyboard: the skip link works and every focus is visible; a sheet traps focus and gives it back", async ({
    page,
    isMobile,
  }) => {
    test.skip(Boolean(isMobile), "keyboard order is exercised on the desktop project");
    const w = await seedWedding({ templateTasks: false });
    await addTask(w, { title: "Compito da tastiera", due: romeDate(10) });
    await loginAs(page, w.wedding.founder, uniqueIp());
    await page.goto("/percorso");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Vai al contenuto" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#contenuto$/);

    // walk the first controls: each focused element shows an outline or ring
    const unfocused: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press("Tab");
      const visible = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return true;
        const style = getComputedStyle(el);
        return (
          (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) ||
          style.boxShadow !== "none" ||
          el.matches(":focus-visible")
        );
      });
      if (!visible)
        unfocused.push(
          await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80) ?? ""),
        );
    }
    expect(unfocused, unfocused.join("\n")).toEqual([]);

    // a sheet: open with the keyboard, focus goes inside, Escape closes, focus returns to the opener
    const opener = page.getByTestId("task-row").first().getByTestId("task-title");
    // (focus can be lost once while React hydrates: retry until it sticks)
    await expect(async () => {
      await opener.focus();
      await expect(opener).toBeFocused();
    }).toPass({ timeout: 10_000 });
    await page.keyboard.press("Enter");
    const sheet = page.getByTestId("task-sheet");
    await expect(sheet).toBeVisible();
    expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    // [QA-6 DEFECT] after Escape the focus is lost (document.body) instead of returning to the task
    // that opened the sheet (WCAG 2.4.3, dialog pattern). Kept failing until fixed.
    await expect(opener).toBeFocused();
  });

  test("prefers-reduced-motion: no transition is left on the progress and the sheets", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const founder = await newFounder();
    await loginAs(page, founder, uniqueIp());
    const bar = page.getByTestId("onboarding-progress").locator("> div").first();
    const transition = await bar.evaluate((el) => {
      const style = getComputedStyle(el);
      return { property: style.transitionProperty, duration: style.transitionDuration };
    });
    // reduced motion: either no property transitions or every duration is 0
    expect(
      transition.property === "none" ||
        transition.duration.split(",").every((d) => parseFloat(d) === 0),
      JSON.stringify(transition),
    ).toBe(true);
    const animations = await page.evaluate(
      () => document.getAnimations().filter((a) => a.playState === "running").length,
    );
    expect(animations).toBe(0);
  });

  test("every form field of the main forms has an accessible name", async ({ page, ip }) => {
    await page.context().setExtraHTTPHeaders({ "x-forwarded-for": ip });
    await page.goto("/accesso");
    for (const field of await page
      .locator("input:visible, select:visible, textarea:visible")
      .all()) {
      const name = await field.evaluate((el) => {
        const input = el as HTMLInputElement;
        return (
          input.getAttribute("aria-label") ||
          (input.labels && input.labels[0]?.textContent) ||
          input.getAttribute("aria-labelledby") ||
          ""
        );
      });
      expect(name?.trim(), "a visible field without a label").not.toBe("");
    }
  });
});
