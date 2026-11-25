/**
 * QA T15 (FEAT-2026-003 S3, project `mobile`): import and export of the guests. Seeded with the
 * helpers of `support/seed.ts`, never through the UI; all data is invented (`@example.test`).
 *
 * AC map
 *  - AC17  paste text or choose a CSV (UTF-8, Windows-1252 bytes built here, "Niccolo" stays right);
 *          the preview is a set of cards
 *  - AC18  type / side (partner name, letter, "entrambi") / group (existing by name, new) / errors /
 *          duplicate = warning only
 *  - AC19  valid rows are imported, the skipped ones are listed with the reason; max 500 rows;
 *          "Torna indietro" keeps the text; closing without "Importa" saves nothing
 *  - AC20  "Annulla importazione" removes everything the import created (guests and new groups)
 *  - AC21  "Esporta CSV" exports ALL guests even with a filter active and says so; the file
 *          imported again gives the same data (phones with "+", notes with ; and quotes, a formula)
 *  - NFR   axe on the three steps of the sheet
 */
import type { Page } from "@playwright/test";
import { axeFindings, describeFindings } from "./support/axe";
import { loginAs } from "./support/auth";
import { expect, newSession, serviceClient, test, uniqueIp } from "./support/fixtures";
import { addGuest, addGuestGroup, romeDate, seedWedding, type SeededWedding } from "./support/seed";

test.describe.configure({ timeout: 90_000 });

const start = (): Promise<SeededWedding> =>
  seedWedding({ templateTasks: false, names: { a: "Tony", b: "Jessica" } });
const open = async (page: Page, w: SeededWedding) => {
  await loginAs(page, w.wedding.founder, uniqueIp());
  await page.goto("/invitati");
  await expect(page.getByRole("heading", { level: 1, name: "Invitati" })).toBeVisible();
};
const sheet = (page: Page) => page.getByRole("dialog");
const toasts = (page: Page) => page.getByRole("region", { name: /Notifications/ });
const db = () => serviceClient();
const guestRows = async (w: SeededWedding) =>
  (await db().from("guests").select("*").eq("wedding_id", w.weddingId)).data ?? [];
const groupRows = async (w: SeededWedding) =>
  (await db().from("guest_groups").select("*").eq("wedding_id", w.weddingId)).data ?? [];

async function openImport(page: Page) {
  const menu = page.getByRole("button", { name: "Altro", exact: true });
  if (await menu.count()) {
    // a list with people: the Altro menu; an empty one: the button of the empty state
    await menu.click();
    await sheet(page).getByRole("button", { name: "Importa" }).click();
  } else {
    await page.getByRole("button", { name: "Importa", exact: true }).click();
  }
  await expect(sheet(page).getByRole("heading", { name: "Importa invitati" })).toBeVisible();
}
/** axe once the enter animations of sheet and toasts are over. */
async function axeSettled(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.getAnimations().length))
    .toBe(0);
  return axeFindings(page);
}

const HEADER = "nome;cognome;tipo;lato;gruppo;telefono;email;note";
const MIXED = [
  HEADER,
  "Anna;Nuova;adulto;Tony;Famiglia Esempio;+39 000 000201;anna.nuova@example.test;Vegetariana",
  "Bruno;Nuova;bambino;Jessica;famiglia  esempio;;;",
  "Luisa;Rossi;adulto;entrambi;famiglia rossi;;;",
  "mario;rossi;;;;;;",
  ";Senzanome;;;;;;",
  "Carla;Errore;adulto;Marte;;;;",
  "Dario;Errore;;;;abc;;",
  "Ennio;Errore;;;;;non-una-email;",
].join("\n");

test("pasted text: preview cards, errors and warning, 'Torna indietro', import with skipped rows, Annulla importazione (AC17-AC20)", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const w = await start();
  const rossi = await addGuestGroup(w, "Famiglia Rossi");
  await addGuest(w, { firstName: "Mario", lastName: "Rossi", groupId: rossi });
  await open(page, w);
  await openImport(page);
  const form = sheet(page);
  await expect(form.getByText("Passo 1 di 3. Il file resta nel tuo dispositivo.")).toBeVisible();
  const input = await axeSettled(page);
  expect(input, describeFindings(input)).toEqual([]);

  await form.getByLabel("Una persona per riga").fill(MIXED);
  await form.getByRole("button", { name: "Vedi l'anteprima" }).click();
  await expect(form.getByText("Passo 2 di 3. Il file resta nel tuo dispositivo.")).toBeVisible();
  await expect(form.getByText("Pronte 4 · Da correggere 4 · Avvisi 1")).toBeVisible();
  await expect(form.getByText("Creo 1 gruppo: Famiglia Esempio.")).toBeVisible();
  await expect(form.getByTestId("import-row-error")).toHaveCount(4);
  await expect(form.getByText(/Riga 5: c'è già mario rossi/i)).toBeVisible();
  await expect(form.getByText("Riga 8: ", { exact: false }).first()).toBeVisible();
  const preview = await axeSettled(page);
  expect(preview, describeFindings(preview)).toEqual([]);
  // nothing is written by looking
  expect(await guestRows(w)).toHaveLength(1);

  // "Torna indietro" keeps the text
  await form.getByRole("button", { name: "Torna indietro" }).click();
  await expect(form.getByLabel("Una persona per riga")).toHaveValue(MIXED);
  await form.getByRole("button", { name: "Vedi l'anteprima" }).click();
  await form.getByRole("button", { name: "Importa 4 invitati" }).click();

  await expect(form.getByText("4 invitati importati. 4 righe saltate.")).toBeVisible();
  await expect(form.getByText("Passo 3 di 3. Il file resta nel tuo dispositivo.")).toBeVisible();
  const done = await axeSettled(page);
  expect(done, describeFindings(done)).toEqual([]);
  await form.getByRole("button", { name: "Copia le righe saltate" }).click();
  await expect(page.getByText("Righe copiate.")).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.split("\n")).toEqual([
    ";Senzanome;;;;;;",
    "Carla;Errore;adulto;Marte;;;;",
    "Dario;Errore;;;;abc;;",
    "Ennio;Errore;;;;;non-una-email;",
  ]);

  // what was saved: groups reused by name and created once; the stored side is the slot
  const saved = await guestRows(w);
  expect(saved).toHaveLength(5);
  const by = (first: string) => saved.find((g) => g.first_name === first)!;
  expect(by("Luisa").group_id).toBe(rossi);
  expect(by("Luisa").side).toBe("both");
  expect(by("Anna").side).toBe("A");
  expect(by("Bruno").side).toBe("B");
  expect(by("Bruno").category).toBe("child");
  expect(by("Anna").phone).toBe("+39 000 000201");
  expect(by("Anna").group_id).toBe(by("Bruno").group_id);
  expect(await groupRows(w)).toHaveLength(2);

  // closing the result keeps the import and offers Annulla importazione
  await form.getByRole("button", { name: "Fine" }).click();
  await expect(page.getByText("4 invitati importati.", { exact: true })).toBeVisible();
  await expect(page.getByText("Annulla importazione rimuove le 4 persone importate.")).toBeVisible();
  await toasts(page).getByRole("button", { name: "Annulla importazione" }).click();
  await expect(page.getByText("Importazione annullata: 4 persone rimosse.")).toBeVisible();
  // everything the import made is gone; what was there before is untouched
  expect((await guestRows(w)).map((g) => g.first_name)).toEqual(["Mario"]);
  expect((await groupRows(w)).map((g) => g.name)).toEqual(["Famiglia Rossi"]);
});

test("a CSV in Windows-1252 bytes: 'Niccolò' stays right; no error row means the sheet closes with the undo toast (AC17)", async ({
  page,
}) => {
  const w = await start();
  await open(page, w);
  const bytes = Buffer.from("nome;cognome\nNiccolò;Prova\nZoë;Esempio\n", "latin1");
  // the proof the file is NOT UTF-8: a fatal decoder refuses it
  expect(() => new TextDecoder("utf-8", { fatal: true }).decode(bytes)).toThrow();
  await openImport(page);
  await page
    .getByLabel("File CSV")
    .setInputFiles({ name: "lista.csv", mimeType: "text/csv", buffer: bytes });
  await expect(sheet(page).getByText("File letto: 3 righe.")).toBeVisible();
  await sheet(page).getByRole("button", { name: "Vedi l'anteprima" }).click();
  await expect(sheet(page).getByText("Niccolò Prova")).toBeVisible();
  await expect(sheet(page).getByText("Pronte 2 · Da correggere 0 · Avvisi 0")).toBeVisible();
  await sheet(page).getByRole("button", { name: "Importa 2 invitati" }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.getByText("2 invitati importati.", { exact: true })).toBeVisible();
  await expect(page.getByTestId("guests-count")).toHaveText("2 persone");
  expect((await guestRows(w)).map((g) => g.first_name).sort()).toEqual(["Niccolò", "Zoë"]);
});

test("the result step has its own 'Annulla importazione'; closing before 'Importa' writes nothing; limits (AC19, AC20)", async ({
  page,
}) => {
  const w = await start();
  await open(page, w);

  // 1. look at the preview, then leave: nothing written, in three ways
  await openImport(page);
  await sheet(page).getByLabel("Una persona per riga").fill(`${HEADER}\nAnna;Prova;;;;;;`);
  await sheet(page).getByRole("button", { name: "Annulla" }).click();
  await expect(sheet(page)).toHaveCount(0);
  await openImport(page);
  await sheet(page).getByLabel("Una persona per riga").fill(`${HEADER}\nAnna;Prova;;;;;;`);
  await sheet(page).getByRole("button", { name: "Vedi l'anteprima" }).click();
  await page.keyboard.press("Escape");
  await expect(sheet(page)).toHaveCount(0);
  expect(await guestRows(w)).toHaveLength(0);

  // 2. nothing valid: no "Importa" to press
  await openImport(page);
  await sheet(page).getByLabel("Una persona per riga").fill(`${HEADER}\n;Solo;;;;;;\nB;C;;Marte;;;;`);
  await sheet(page).getByRole("button", { name: "Vedi l'anteprima" }).click();
  await expect(sheet(page).getByText("Pronte 0 · Da correggere 2 · Avvisi 0")).toBeVisible();
  await expect(sheet(page).getByRole("button", { name: /^Importa 0/ })).toBeDisabled();
  await sheet(page).getByRole("button", { name: "Torna indietro" }).click();

  // 3. more than 500 rows: one clear message
  const many = [HEADER, ...Array.from({ length: 501 }, (_, i) => `Prova${i};Esempio;;;;;;`)].join("\n");
  await sheet(page).getByLabel("Una persona per riga").fill(many);
  await sheet(page).getByRole("button", { name: "Vedi l'anteprima" }).click();
  await expect(
    sheet(page).getByText("Sono più di 500 righe: importane al massimo 500 alla volta."),
  ).toBeVisible();
  expect(await guestRows(w)).toHaveLength(0);

  // 4. exactly 500 is accepted; one row with an error shows the result step and its own undo button
  const ok500 = [HEADER, ...Array.from({ length: 499 }, (_, i) => `Prova${i};Esempio;;;;;;`), ";Errore;;;;;;"].join("\n");
  await sheet(page).getByLabel("Una persona per riga").fill(ok500);
  await sheet(page).getByRole("button", { name: "Vedi l'anteprima" }).click();
  await expect(sheet(page).getByText("Pronte 499 · Da correggere 1 · Avvisi 0")).toBeVisible();
  await expect(sheet(page).getByTestId("import-row-error")).toHaveCount(1);
  await sheet(page).getByRole("button", { name: "Importa 499 invitati" }).click();
  await expect(sheet(page).getByText("499 invitati importati. 1 riga saltata.")).toBeVisible();
  expect(await guestRows(w)).toHaveLength(499);
  await sheet(page).getByRole("button", { name: "Annulla importazione" }).click();
  await expect(page.getByText("Importazione annullata: 499 persone rimosse.")).toBeVisible();
  expect(await guestRows(w)).toHaveLength(0);
});

test("the empty state offers 'Importa' too (AC1, AC17)", async ({ page }) => {
  const w = await start();
  await open(page, w);
  await page.getByRole("button", { name: "Importa", exact: true }).click();
  await expect(sheet(page).getByRole("heading", { name: "Importa invitati" })).toBeVisible();
});

test("export with a filter on: all the guests, said in text; the file imported again gives the same data (AC21)", async ({
  page,
  browser,
}, testInfo) => {
  const w = await start();
  const esempio = await addGuestGroup(w, "Famiglia Esempio");
  await addGuest(w, { firstName: "Niccolò", lastName: "Prova", side: "A", phone: "+39 000 000301", email: "nic@example.test" });
  await addGuest(w, { firstName: "Maria", lastName: "Esempio", side: "B", category: "child", groupId: esempio, notes: 'Allergica; vegana "forte"' });
  await addGuest(w, { firstName: "Neo", lastName: "Esempio", side: "both", category: "infant", groupId: esempio, notes: "=SOMMA(1;1)" });
  await addGuest(w, { firstName: "Cancellato", lastName: "Prova", deleted: true });
  await open(page, w);

  await page.getByRole("searchbox", { name: "Cerca per nome" }).fill("Esempio");
  await expect(page.getByTestId("guests-count")).toHaveText("2 di 3 persone");
  await page.getByRole("button", { name: "Altro", exact: true }).click();
  await expect(sheet(page).getByText("Esporta tutti i 3 invitati, anche se hai dei filtri attivi.")).toBeVisible();
  const waiting = page.waitForEvent("download");
  await sheet(page).getByRole("button", { name: "Esporta CSV" }).click();
  const file = await waiting;
  expect(file.suggestedFilename()).toBe(`roadmap2yes-invitati-${romeDate(0)}.csv`);
  const chunks: Buffer[] = [];
  for await (const chunk of await file.createReadStream()) chunks.push(chunk as Buffer);
  const bytes = Buffer.concat(chunks);
  const text = bytes.toString("utf8");
  expect(text).not.toContain("Cancellato");
  expect(text.replace(/^﻿/, "").split("\r\n").filter(Boolean)).toHaveLength(4); // header + 3
  expect(text).toContain("'=SOMMA(1;1)"); // the formula is neutralized in the file...
  expect(text).toContain("Tony"); // ...and the side is the partner's name

  // import it into a second wedding with the same partner names: same data, formula restored
  const w2 = await start();
  const b = await newSession(browser, testInfo);
  await open(b.page, w2);
  await openImport(b.page);
  await b.page.getByLabel("File CSV").setInputFiles({ name: "invitati.csv", mimeType: "text/csv", buffer: bytes });
  await sheet(b.page).getByRole("button", { name: "Vedi l'anteprima" }).click();
  await expect(sheet(b.page).getByText("Pronte 3 · Da correggere 0 · Avvisi 0")).toBeVisible();
  await sheet(b.page).getByRole("button", { name: "Importa 3 invitati" }).click();
  await expect(b.page.getByTestId("guests-count")).toHaveText("3 persone");

  const shape = async (wedding: SeededWedding) => {
    const groups = new Map((await groupRows(wedding)).map((g) => [g.id, g.name]));
    return (await guestRows(wedding))
      .map((g) => ({
        first: g.first_name,
        last: g.last_name,
        category: g.category,
        side: g.side,
        group: g.group_id ? groups.get(g.group_id) : null,
        phone: g.phone,
        email: g.email,
        notes: g.notes,
        deleted: g.deleted_at !== null,
      }))
      .filter((g) => !g.deleted)
      .sort((x, y) => x.first.localeCompare(y.first));
  };
  expect(await shape(w2)).toEqual(await shape(w));
  expect((await shape(w2)).find((g) => g.first === "Neo")?.notes).toBe("=SOMMA(1;1)");
  await b.context.close();
});
