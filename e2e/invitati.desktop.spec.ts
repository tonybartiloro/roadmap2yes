/**
 * QA T8 (FEAT-2026-003 S1, project `desktop`, 1280 px): the edit conflict (two sessions) and the
 * scale (QA-9). Seeded with `seedGuests`, never through the UI; all data is invented.
 *
 * AC map
 *  - AC6   the second save on a changed guest opens the conflict dialog; "Salva comunque" replaces,
 *          "Annulla" keeps the partner's version; nothing is overwritten silently
 *  - AC12  1200 guests (500, then +700 in the same wedding): all counted, one beyond the first
 *          thousand is searchable, nothing is cut without "Mostra altre"
 *  - AC22  the complete export holds the 1200 (JSON marks the deleted one; the guests CSV has the live ones)
 *  - NFR   500 guests: list ready < 1 s measured in the page (median of 3 loads); 1200: search and
 *          "Mostra altre" stay responsive (REV-27)
 *  - AC13  the partner's Home ("Novita") shows nothing of the guest that was edited
 */
import type { Page } from "@playwright/test";
import { loginAs } from "./support/auth";
import { expect, newSession, serviceClient, test, uniqueIp } from "./support/fixtures";
import { axeFindings, describeFindings } from "./support/axe";
import {
  addGuest,
  addGuestGroup,
  addGuestTable,
  seedGuests,
  seedWedding,
  type SeededGuests,
  type SeededWedding,
} from "./support/seed";

test.describe.configure({ timeout: 120_000 });

const sheet = (page: Page) => page.getByRole("dialog");
const row = (page: Page, name: string) => page.getByTestId("guest-row").filter({ hasText: name });
const guestOf = async (w: SeededWedding, first: string) =>
  (await serviceClient().from("guests").select("*").eq("wedding_id", w.weddingId).eq("first_name", first).single())
    .data!;

async function bothOpenMario(page: Page, browser: import("@playwright/test").Browser, testInfo: import("@playwright/test").TestInfo) {
  const w = await seedWedding({ templateTasks: false, names: { a: "Tony", b: "Jessica" } });
  await addGuest(w, { firstName: "Mario", lastName: "Rossi", side: "A" });
  await loginAs(page, w.wedding.founder, uniqueIp());
  await page.goto("/invitati");
  const b = await newSession(browser, testInfo);
  await loginAs(b.page, w.partnerB!.user, uniqueIp());
  await b.page.goto("/invitati");
  for (const p of [page, b.page]) {
    await row(p, "Mario Rossi").click();
    await expect(sheet(p).getByRole("heading", { name: "Modifica l'invitato" })).toBeVisible();
  }
  // Jessica saves first: a new surname
  await sheet(b.page).getByLabel("Cognome").fill("Bianchi");
  await sheet(b.page).getByRole("button", { name: "Salva", exact: true }).click();
  await expect(b.page.getByText("Modifiche salvate.")).toBeVisible();
  // Tony saves a different change on the old version
  await sheet(page).getByRole("button", { name: "Altri dati" }).click();
  await sheet(page).getByLabel("Note").fill("Nota di Tony");
  await sheet(page).getByRole("button", { name: "Salva", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Jessica ha modificato questo elemento");
  return { w, b, dialog };
}

test("conflict: the second save names the partner; 'Salva comunque' replaces with the visible difference (AC6)", async ({
  page,
  browser,
}, testInfo) => {
  const { w, b, dialog } = await bothOpenMario(page, browser, testInfo);
  await dialog.getByRole("button", { name: "Vedi cosa è cambiato" }).click();
  await expect(dialog).toContainText("Cognome");
  await expect(dialog).toContainText("Bianchi");
  // nothing was overwritten yet
  expect((await guestOf(w, "Mario")).last_name).toBe("Bianchi");
  expect((await guestOf(w, "Mario")).notes).toBeNull();

  await dialog.getByRole("button", { name: "Salva comunque" }).click();
  await expect.poll(async () => (await guestOf(w, "Mario")).notes).toBe("Nota di Tony");
  await expect(page.getByText("Modifiche salvate.")).toBeVisible();
  await b.context.close();
});

test("conflict: 'Annulla' keeps the partner's version and shows it; the Home of the other partner carries no guest data (AC6, AC13)", async ({
  page,
  browser,
}, testInfo) => {
  const { w, b, dialog } = await bothOpenMario(page, browser, testInfo);
  await dialog.getByRole("button", { name: "Annulla" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  const mario = await guestOf(w, "Mario");
  expect(mario.last_name).toBe("Bianchi");
  expect(mario.notes).toBeNull();
  await expect(row(page, "Mario Bianchi")).toBeVisible();

  // "Novita" of the partner who did not make the change: no name, no note
  await page.goto("/");
  await expect(page.getByRole("main")).not.toContainText(/Mario|Bianchi|Nota di Tony/);
  await b.context.close();
});

test("desktop columns: 6 columns at 768 px keep the name readable and the rows short; no sideways scroll and axe clean at 1100 px, also while selecting (DES-03)", async ({
  page,
}) => {
  const w = await seedWedding({ templateTasks: false, names: { a: "Tony", b: "Jessica" } });
  // realistic group and table names; the person's name is the long one (stress on the Nome column)
  const group = await addGuestGroup(w, "Famiglia Esempio");
  const table = await addGuestTable(w, "Tavolo 3", { capacity: 8 });
  const people: [string, string, "adult" | "child" | "infant", "A" | "B" | "both" | null][] = [
    ["Bartolomeo", "Esempio-Montefiascone", "adult", "A"],
    ["Luca", "Esempio", "child", "B"],
    ["Neo", "Esempio", "infant", "both"],
    ["Anna", "Esempio", "adult", null],
  ];
  for (const [first, last, category, side] of people) {
    await addGuest(w, { firstName: first, lastName: last, category, side, groupId: group, tableId: table });
  }
  await loginAs(page, w.wedding.founder, uniqueIp());
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto("/invitati");
  // a search makes the list flat: name, type, side, group, table and presence = 6 columns
  await page.getByRole("searchbox", { name: "Cerca per nome" }).fill("Esempio");
  await expect(page.getByTestId("guest-row")).toHaveCount(4);
  await expect(page.locator('[aria-hidden="true"].md\\:grid')).toHaveCount(1); // one header per list
  const rows = page.getByTestId("guest-row");
  for (let i = 0; i < 4; i++) {
    const row = rows.nth(i);
    const grid = row.locator("button > span").first();
    const name = grid.locator("> span").first();
    const tracks = await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
    expect(tracks, "6 columns").toBe(6);
    const nameBox = (await name.boundingBox())!;
    const rowBox = (await row.boundingBox())!;
    const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    expect(nameBox.width, `name cell of row ${i}`).toBeGreaterThanOrEqual(7 * rem);
    expect(rowBox.height, `height of row ${i}`).toBeLessThanOrEqual(80);
  }

  await page.setViewportSize({ width: 1100, height: 900 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
  ).toBeLessThanOrEqual(0);
  const list = await axeFindings(page);
  expect(list, describeFindings(list)).toEqual([]);

  await page.getByRole("button", { name: "Altro", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Seleziona" }).click();
  await page.getByRole("checkbox", { name: "Seleziona Luca Esempio" }).check();
  await expect(page.getByTestId("selection-bar")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).length))
    .toBe(0);
  const selecting = await axeFindings(page);
  expect(selecting, describeFindings(selecting)).toEqual([]);
});

test.describe.serial("scale: 500, then 1200 guests in one wedding", () => {
  let w: SeededWedding;
  const seeded: SeededGuests[] = [];
  const median = (values: number[]) => [...values].sort((x, y) => x - y)[Math.floor(values.length / 2)]!;

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    w = await seedWedding({ templateTasks: false, names: { a: "Tony", b: "Jessica" } });
    seeded.push(await seedGuests(w, 500));
  });

  test("500 guests: the list is ready in under 1 s, measured in the page (median of 3)", async ({ page }) => {
    // performance.now() counts from the navigation start: stamp when the count AND the list exist
    await page.addInitScript(() => {
      const w2 = window as unknown as { __ready?: number };
      new MutationObserver((_, observer) => {
        const count = document.querySelector('[data-testid="guests-count"]')?.textContent ?? "";
        if (/persone$/.test(count) && document.querySelector('[data-testid="guest-list"]')) {
          w2.__ready = performance.now();
          observer.disconnect();
        }
      }).observe(document, { childList: true, subtree: true });
    });
    await loginAs(page, w.wedding.founder, uniqueIp());
    const ready: number[] = [];
    for (let i = 0; i < 3; i++) {
      await page.goto("/invitati");
      await page.waitForFunction(() => (window as unknown as { __ready?: number }).__ready !== undefined);
      ready.push(await page.evaluate(() => (window as unknown as { __ready: number }).__ready));
    }
    await expect(page.getByTestId("guests-count")).toHaveText("500 persone");
    // the stamp is the server-rendered list; a click before hydration would be lost
    await page.waitForLoadState("networkidle");
    // above 100 people the group starts closed: opening it renders 100 rows (not 500) and says so
    const open = await page.evaluate(async () => {
      const button = document.querySelector<HTMLButtonElement>('[data-testid="guest-group"] h2 button')!;
      const started = performance.now();
      const rows = new Promise<number>((resolve) => {
        const watch = new MutationObserver(() => {
          if (document.querySelectorAll('[data-testid="guest-row"]').length >= 100) {
            watch.disconnect();
            resolve(performance.now() - started);
          }
        });
        watch.observe(document.body, { childList: true, subtree: true });
      });
      button.click();
      return rows;
    });
    await expect(page.getByTestId("guest-row")).toHaveCount(100);
    await expect(page.getByRole("button", { name: "Mostra altre 100 (ne restano 400)" })).toBeVisible();
    test.info().annotations.push({ type: "list ready ms (3 loads)", description: ready.map(Math.round).join(", ") });
    test.info().annotations.push({ type: "open group ms", description: String(Math.round(open)) });
    console.log(`[scale] 500: list ready ${ready.map(Math.round)} ms, open group ${Math.round(open)} ms`);
    expect(median(ready),`list ready: ${ready.join(", ")} ms`).toBeLessThan(1000);
    expect(open, "open the group").toBeLessThan(1000);
  });

  test("1200 guests: all counted, one past the first thousand found by search, 'Mostra altre' never cuts silently (AC12)", async ({
    page,
  }) => {
    seeded.push(await seedGuests(w, 700));
    const sum = (key: "adults" | "children" | "infants") => seeded.reduce((total, s) => total + s[key], 0);
    expect(seeded.reduce((total, s) => total + s.total, 0)).toBe(1200);
    await loginAs(page, w.wedding.founder, uniqueIp());
    await page.goto("/invitati");
    await expect(page.getByTestId("guests-count")).toHaveText("1200 persone");
    await expect(page.getByTestId("guests-summary")).toContainText(
      `${sum("adults")} adulti · ${sum("children")} bambini · ${sum("infants")} neonati`,
    );

    await page.waitForLoadState("networkidle"); // hydrated: the in-page input event is handled
    // one of the 700 added later (past the first 1000 by id): searchable, measured in the page
    const search = page.getByRole("searchbox", { name: "Cerca per nome" });
    const ms = await page.evaluate(async () => {
      const input = document.querySelector<HTMLInputElement>("#guest-search")!;
      const target = document.querySelector('[data-testid="guests-count"]')!;
      const started = performance.now();
      const done = new Promise<number>((resolve) => {
        new MutationObserver((_, observer) => {
          if (target.textContent?.startsWith("1 di 1200")) {
            observer.disconnect();
            resolve(performance.now() - started);
          }
        }).observe(target, { childList: true, subtree: true, characterData: true });
      });
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(input, "Prova1150");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return done;
    });
    test.info().annotations.push({ type: "search 1200 ms", description: String(Math.round(ms)) });
    console.log(`[scale] 1200: search ${Math.round(ms)} ms`);
    expect(ms, "search over 1200 guests").toBeLessThan(1000);
    await expect(page.getByTestId("guests-count")).toHaveText("1 di 1200 persone");
    await expect(row(page, "Prova1150 Esempio1150")).toBeVisible();

    // a search matching many: 100 at a time, with the remainder stated ("Prova1" matches 111 people)
    await search.fill("Prova11");
    const matchesNow = async () =>
      Number((/^(\d+) di 1200/.exec((await page.getByTestId("guests-count").textContent()) ?? "") ?? [])[1]);
    // the count follows the deferred query: wait for it instead of reading it once
    await expect.poll(matchesNow).toBeGreaterThan(100);
    const matches = await matchesNow();
    await expect(page.getByTestId("guest-row")).toHaveCount(100);
    await page.getByRole("button", { name: new RegExp(`^Mostra altre ${Math.min(100, matches - 100)} \\(ne restano ${matches - 100}\\)`) }).click();
    await expect(page.getByTestId("guest-row")).toHaveCount(Math.min(200, matches));
  });

  test("the complete export holds all 1200: JSON marks the deleted one, the guests CSV has only the live ones (AC12, AC21, AC22)", async ({
    page,
  }) => {
    await addGuest(w, { firstName: "Eliminata", lastName: "Prova", deleted: true });
    await loginAs(page, w.wedding.founder, uniqueIp());
    await page.goto("/altro/esporta");
    const download = async (which: string) => {
      const waiting = page.waitForEvent("download");
      await page.getByTestId(`export-${which}`).click();
      const file = await waiting;
      const chunks: Buffer[] = [];
      for await (const chunk of await file.createReadStream()) chunks.push(chunk as Buffer);
      return Buffer.concat(chunks).toString("utf8");
    };
    const parsed = JSON.parse(await download("json")) as {
      guests: { firstName: string; deleted: boolean }[];
      guestGroups: unknown[];
      guestTables: unknown[];
    };
    expect(parsed.guests).toHaveLength(1201);
    expect(parsed.guests.filter((g) => g.deleted).map((g) => g.firstName)).toEqual(["Eliminata"]);
    expect(Array.isArray(parsed.guestGroups) && Array.isArray(parsed.guestTables)).toBe(true);

    const lines = (await download("guestsCsv")).replace(/^﻿/, "").split("\r\n").filter(Boolean);
    expect(lines).toHaveLength(1201); // header + 1200 live guests
    const names = lines.slice(1).map((line) => line.split(";")[0]);
    expect(new Set(names)).toEqual(new Set(seeded.flatMap((s) => s.firstNames)));
  });
});
