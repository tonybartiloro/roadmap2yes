/**
 * QA T10 (FEAT-2026-003 S2, project `mobile`): the Tavoli tab. Seeded with the helpers of
 * `support/seed.ts`, never through the UI; all data is invented.
 *
 * AC map
 *  - AC14  a table has a name and a capacity 1-50 (optional); "N / M posti"; infants take no seat;
 *          a person sits at one table at most
 *  - AC15  "Aggiungi un gruppo intero": someone seated elsewhere asks first ("Sposta" / "Lascia dove sono")
 *  - AC16  over the capacity is allowed and written ("Oltre la capienza di N", also in the summary);
 *          with no table: only the empty "Tavoli" tab, no table field, filter or "Assegna a tavolo"
 *  - AC10  a deleted table keeps its members ("Senza tavolo"), restoring brings them back;
 *          permanent delete asks first and names how many people stay
 *  - AC6   edit conflict on a table (two sessions)
 *  - NFR   axe on the empty tab, on the cards and on the open sheets
 */
import type { Page } from "@playwright/test";
import { axeFindings, describeFindings } from "./support/axe";
import { loginAs } from "./support/auth";
import { expect, newSession, serviceClient, test, uniqueIp } from "./support/fixtures";
import {
  addGuest,
  addGuestGroup,
  addGuestTable,
  seedWedding,
  type SeededWedding,
} from "./support/seed";

test.describe.configure({ timeout: 90_000 });

const start = (): Promise<SeededWedding> =>
  seedWedding({ templateTasks: false, names: { a: "Tony", b: "Jessica" } });
const open = async (page: Page, w: SeededWedding) => {
  await loginAs(page, w.wedding.founder, uniqueIp());
  await page.goto("/invitati");
  await expect(page.getByRole("heading", { level: 1, name: "Invitati" })).toBeVisible();
};
const sheet = (page: Page) => page.getByRole("dialog");
const card = (page: Page, name: string) => page.getByTestId("table-card").filter({ hasText: name });
const undo = (page: Page) =>
  page.getByRole("region", { name: /Notifications/ }).getByRole("button", { name: "Annulla" });
const tabs = {
  people: (page: Page) => page.getByRole("tab", { name: "Persone" }),
  tables: (page: Page) => page.getByRole("tab", { name: "Tavoli" }),
};
const db = () => serviceClient();
/** axe waits for the toast enter animation (it is mid-fade for 0.4 s): same approach as themes.spec. */
async function axeAfterAnimations(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.querySelector("[data-sonner-toaster]")?.getAnimations({ subtree: true }).length ??
          0,
      ),
    )
    .toBe(0);
  return axeFindings(page);
}
const guestRows = async (w: SeededWedding) =>
  (await db().from("guests").select("*").eq("wedding_id", w.weddingId)).data ?? [];
const tableOf = async (w: SeededWedding, first: string) =>
  (await guestRows(w)).find((g) => g.first_name === first)?.table_id;

test("no table: the Tavoli tab is a calm empty state and the table field, filter and bulk action do not exist; creating one makes them appear (AC16, AC14)", async ({
  page,
}) => {
  const w = await start();
  await addGuest(w, { firstName: "Anna", lastName: "Prova" });
  await open(page, w);
  await expect(page.getByRole("tablist")).toBeVisible();
  await expect(tabs.people(page)).toHaveAttribute("aria-selected", "true");

  // Persone without tables: nothing about tables anywhere
  await page.getByTestId("filters-button").click();
  await expect(sheet(page).getByText("Tavolo", { exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Altro", exact: true }).click();
  await sheet(page).getByRole("button", { name: "Seleziona" }).click();
  await expect(page.getByTestId("selection-bar").getByRole("button", { name: "Assegna a tavolo" })).toHaveCount(0);
  await page.getByTestId("selection-bar").getByRole("button", { name: "Fine" }).click();
  await page.getByRole("button", { name: /^Anna Prova/ }).click();
  await expect(sheet(page).getByLabel("Tavolo")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByText(/oltre la capienza/)).toHaveCount(0);

  await tabs.tables(page).click();
  await expect(page.getByText("Ti servono i tavoli? Creali quando vuoi.")).toBeVisible();
  const empty = await axeFindings(page);
  expect(empty, describeFindings(empty)).toEqual([]);

  await page.getByRole("button", { name: "Crea tavolo" }).click();
  const form = sheet(page);
  await expect(form.getByRole("heading", { name: "Crea tavolo" })).toBeVisible();
  await form.getByRole("button", { name: "Crea tavolo" }).click();
  await expect(form.getByText(/nome/i).first()).toBeVisible();
  for (const bad of ["0", "51", "abc", "2.5"]) {
    await form.getByLabel("Nome del tavolo").fill("Tavolo 1");
    await form.getByLabel("Capienza").fill(bad);
    await form.getByRole("button", { name: "Crea tavolo" }).click();
    await expect(form.getByText("La capienza è un numero intero da 1 a 50.")).toBeVisible();
  }
  expect((await db().from("guest_tables").select("id").eq("wedding_id", w.weddingId)).data).toEqual([]);
  await form.getByLabel("Capienza").fill("2");
  await form.getByRole("button", { name: "Crea tavolo" }).click();
  await expect(page.getByText("Tavolo creato.")).toBeVisible();
  await expect(card(page, "Tavolo 1")).toContainText("0 / 2 posti");

  // now the table parts exist
  await tabs.people(page).click();
  await page.getByTestId("filters-button").click();
  await expect(sheet(page).getByLabel("Tavolo")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Anna Prova/ }).click();
  await expect(sheet(page).getByLabel("Tavolo")).toBeVisible();
});

test("capacity: over it is allowed and written in text and in the summary; infants take no seat; 'Annulla' and 'Rimuovi dal tavolo' (AC14, AC16)", async ({
  page,
}) => {
  const w = await start();
  const table = await addGuestTable(w, "Rosa", { capacity: 2 });
  for (const first of ["Anna", "Bruno", "Carla"]) await addGuest(w, { firstName: first, lastName: "Prova" });
  await addGuest(w, { firstName: "Neo", lastName: "Prova", category: "infant" });
  await open(page, w);
  await tabs.tables(page).click();
  await expect(card(page, "Rosa")).toContainText("0 / 2 posti");

  await card(page, "Rosa").click();
  await sheet(page).getByRole("button", { name: "Aggiungi persone" }).click();
  const add = sheet(page).last();
  await add.getByRole("checkbox", { name: "Aggiungi Anna Prova" }).check();
  await add.getByRole("checkbox", { name: "Aggiungi Bruno Prova" }).check();
  await add.getByRole("button", { name: "Aggiungi 2 persone" }).click();
  await expect(page.getByText("2 persone al tavolo «Rosa».")).toBeVisible();
  await expect.poll(() => tableOf(w, "Anna")).toBe(table);

  // no sheet is left open: Annulla at once is reachable
  await expect(sheet(page)).toHaveCount(0);
  await undo(page).last().click();
  await expect.poll(() => tableOf(w, "Anna")).toBeNull();
  await expect(card(page, "Rosa")).toContainText("0 / 2 posti");

  // a full table plus one: allowed, with the warning in words
  await card(page, "Rosa").click();
  await sheet(page).getByRole("button", { name: "Aggiungi persone" }).click();
  for (const first of ["Anna", "Bruno", "Carla"]) {
    await sheet(page).last().getByRole("checkbox", { name: `Aggiungi ${first} Prova` }).check();
  }
  await sheet(page).last().getByRole("button", { name: "Aggiungi 3 persone" }).click();
  await expect(sheet(page)).toHaveCount(0); // nothing stays open behind the toast
  await expect(card(page, "Rosa")).toContainText("3 / 2 posti");
  await expect(card(page, "Rosa")).toContainText("Oltre la capienza di 2");
  await tabs.people(page).click();
  await expect(page.getByTestId("guests-summary")).toContainText("1 tavolo oltre la capienza");

  // an infant is seated but takes no place
  await tabs.tables(page).click();
  await card(page, "Rosa").click();
  await sheet(page).getByRole("button", { name: "Aggiungi persone" }).click();
  await sheet(page).last().getByRole("checkbox", { name: "Aggiungi Neo Prova" }).check();
  await sheet(page).last().getByRole("button", { name: "Aggiungi 1 persona" }).click();
  await expect(sheet(page)).toHaveCount(0); // nothing stays open behind the toast
  await expect.poll(() => tableOf(w, "Neo")).toBe(table);
  await expect(card(page, "Rosa")).toContainText("3 / 2 posti");
  await expect(card(page, "Rosa")).toContainText("Neonati: 1 (non occupano posto)");

  // axe on the cards, then on the open sheet
  const cards = await axeAfterAnimations(page);
  expect(cards, describeFindings(cards)).toEqual([]);
  await card(page, "Rosa").click();
  await expect(sheet(page).getByRole("heading", { name: "Al tavolo (4)" })).toBeVisible();
  await expect(sheet(page).getByText("Oltre la capienza di 2").first()).toBeVisible();
  const open_ = await axeAfterAnimations(page);
  expect(open_, describeFindings(open_)).toEqual([]);

  // remove one: the table goes back within its capacity
  await sheet(page).getByRole("button", { name: "Rimuovi dal tavolo Carla Prova" }).click();
  await expect(page.getByText("Carla Prova non è più al tavolo.")).toBeVisible();
  await expect.poll(() => tableOf(w, "Carla")).toBeNull();
});

test("a whole group at a table: those seated elsewhere are asked about; 'Lascia dove sono' and 'Sposta' (AC15, AC14)", async ({
  page,
}) => {
  const w = await start();
  const [t1, t2, t3] = [
    await addGuestTable(w, "Uno", { capacity: 10 }),
    await addGuestTable(w, "Due", { capacity: 10 }),
    await addGuestTable(w, "Tre", { capacity: 10 }),
  ];
  const rossi = await addGuestGroup(w, "Famiglia Rossi");
  for (const first of ["Mario", "Luisa", "Luca"]) {
    await addGuest(w, { firstName: first, lastName: "Rossi", groupId: rossi, ...(first === "Mario" ? { tableId: t1 } : {}) });
  }
  await open(page, w);
  await tabs.tables(page).click();

  const addGroup = async (table: string) => {
    await card(page, table).click();
    await sheet(page).getByRole("button", { name: "Aggiungi un gruppo intero" }).click();
    await sheet(page).last().getByLabel("Gruppo").selectOption({ label: "Famiglia Rossi" });
    await sheet(page).last().getByRole("button", { name: "Aggiungi il gruppo" }).click();
  };

  // 1. Mario sits at "Uno": the other two go to "Due" only after the question; "Lascia dove sono"
  await addGroup("Due");
  const ask = page.getByRole("alertdialog");
  await expect(ask).toContainText("1 di loro sono già al tavolo Uno: li sposto qui?");
  await ask.getByRole("button", { name: "Lascia dove sono" }).click();
  await expect(sheet(page)).toHaveCount(0); // nothing stays open behind the toast
  await expect.poll(() => tableOf(w, "Luisa")).toBe(t2);
  expect(await tableOf(w, "Luca")).toBe(t2);
  expect(await tableOf(w, "Mario")).toBe(t1);

  // 2. everybody is seated somewhere now: "Sposta" moves all three to "Tre"
  await expect(card(page, "Due")).toContainText("2 / 10 posti"); // the screen has the new seats
  await addGroup("Tre");
  await expect(ask).toContainText("3 di loro sono già ai tavoli");
  await ask.getByRole("button", { name: "Sposta" }).click();
  await expect(sheet(page)).toHaveCount(0); // nothing stays open behind the toast
  await expect.poll(() => tableOf(w, "Mario")).toBe(t3);
  expect(await tableOf(w, "Luisa")).toBe(t3);
  expect(await tableOf(w, "Luca")).toBe(t3);
  await expect(card(page, "Tre")).toContainText("3 / 10 posti");
  await expect(card(page, "Uno")).toContainText("0 / 10 posti");
});

test("delete a table: the members stay 'Senza tavolo' and return with the restore; Annulla; permanent delete names the people (AC10, AC16)", async ({
  page,
}) => {
  const w = await start();
  const blu = await addGuestTable(w, "Blu");
  const ids = [
    await addGuest(w, { firstName: "Anna", lastName: "Prova", tableId: blu }),
    await addGuest(w, { firstName: "Bruno", lastName: "Prova", tableId: blu }),
  ];
  await open(page, w);
  await tabs.tables(page).click();
  await expect(card(page, "Blu")).toContainText("2 posti occupati");
  const seats = async () => (await guestRows(w)).map((g) => g.table_id);

  // delete, with the consequence said first
  await card(page, "Blu").click();
  await sheet(page).getByRole("button", { name: "Elimina il tavolo" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("Elimini il tavolo «Blu»?");
  await expect(confirm).toContainText("Le 2 persone restano, senza tavolo.");
  await confirm.getByRole("button", { name: "Elimina il tavolo" }).click();
  await expect(card(page, "Blu")).toHaveCount(0);
  await expect(page.getByText("Ti servono i tavoli? Creali quando vuoi.")).toBeVisible();
  // the pointer is kept; the two people are in the list, with no table field since no table is live
  expect(await seats()).toEqual([blu, blu]);
  await tabs.people(page).click();
  await expect(page.getByTestId("guests-count")).toHaveText("2 persone");
  await page.getByTestId("filters-button").click();
  await expect(sheet(page).getByLabel("Tavolo")).toHaveCount(0);
  await page.keyboard.press("Escape");

  // restore from "Eliminati di recente": the members are back, nothing else to do
  await page.getByRole("button", { name: "Altro", exact: true }).click();
  await sheet(page).getByRole("button", { name: /^Eliminati di recente \(1\)/ }).click();
  await expect(sheet(page).getByRole("heading", { name: "Tavoli (1)" })).toBeVisible();
  await expect(sheet(page).getByText("2 persone, rientrano se lo ripristini")).toBeVisible();
  await sheet(page).getByRole("button", { name: "Ripristina Blu" }).click();
  await page.keyboard.press("Escape");
  await tabs.tables(page).click();
  await expect(card(page, "Blu")).toContainText("2 posti occupati");

  // delete again and take it back at once with Annulla
  await card(page, "Blu").click();
  await sheet(page).getByRole("button", { name: "Elimina il tavolo" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Elimina il tavolo" }).click();
  await expect(card(page, "Blu")).toHaveCount(0);
  await undo(page).last().click();
  await expect(card(page, "Blu")).toContainText("2 posti occupati");

  // delete once more and remove it for good: the confirmation says how many people stay
  await card(page, "Blu").click();
  await sheet(page).getByRole("button", { name: "Elimina il tavolo" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Elimina il tavolo" }).click();
  await tabs.people(page).click();
  await page.getByRole("button", { name: "Altro", exact: true }).click();
  await sheet(page).getByRole("button", { name: /^Eliminati di recente \(1\)/ }).click();
  await sheet(page).getByRole("button", { name: "Elimina definitivamente Blu" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Le 2 persone che ne fanno parte restano, senza tavolo.");
  await expect(page.getByRole("alertdialog")).toContainText("Non si può annullare.");
  await page.getByRole("alertdialog").getByRole("button", { name: "Elimina definitivamente" }).click();
  await expect(page.getByText("Eliminato per sempre.")).toBeVisible();
  await expect.poll(seats).toEqual([null, null]);
  expect((await db().from("guest_tables").select("id").eq("wedding_id", w.weddingId)).data).toEqual([]);
  const alive = (await guestRows(w)).filter((g) => ids.includes(g.id) && g.deleted_at === null);
  expect(alive).toHaveLength(2);
});

test("conflict on a table: the second save names the partner; 'Salva comunque' replaces (AC6)", async ({
  page,
  browser,
}, testInfo) => {
  const w = await start();
  await addGuestTable(w, "Verde", { capacity: 8 });
  await loginAs(page, w.wedding.founder, uniqueIp());
  await page.goto("/invitati");
  await tabs.tables(page).click();
  const b = await newSession(browser, testInfo);
  await loginAs(b.page, w.partnerB!.user, uniqueIp());
  await b.page.goto("/invitati");
  await tabs.tables(b.page).click();
  for (const p of [page, b.page]) await card(p, "Verde").click();

  await sheet(b.page).getByLabel("Capienza").fill("10");
  await sheet(b.page).getByRole("button", { name: "Salva", exact: true }).click();
  await expect(b.page.getByText("Tavolo salvato.")).toBeVisible();
  await sheet(page).getByLabel("Nome del tavolo").fill("Verde mare");
  await sheet(page).getByRole("button", { name: "Salva", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Jessica ha modificato questo elemento");
  const read = async () =>
    (await db().from("guest_tables").select("name,capacity").eq("wedding_id", w.weddingId).single()).data!;
  expect(await read()).toMatchObject({ name: "Verde", capacity: 10 });
  await dialog.getByRole("button", { name: "Salva comunque" }).click();
  await expect.poll(read).toMatchObject({ name: "Verde mare" });
  await b.context.close();
});

test("whole group: everybody already at this table, and a group with no people, are said in words and write nothing (AC15)", async ({
  page,
}) => {
  const w = await start();
  const uno = await addGuestTable(w, "Uno", { capacity: 10 });
  const rossi = await addGuestGroup(w, "Famiglia Rossi");
  await addGuestGroup(w, "Gruppo vuoto");
  for (const first of ["Mario", "Luisa"]) {
    await addGuest(w, { firstName: first, lastName: "Rossi", groupId: rossi, tableId: uno });
  }
  await open(page, w);
  await tabs.tables(page).click();
  const openGroupSheet = async () => {
    await card(page, "Uno").click();
    await sheet(page).getByRole("button", { name: "Aggiungi un gruppo intero" }).click();
  };

  await openGroupSheet();
  await sheet(page).last().getByLabel("Gruppo").selectOption({ label: "Gruppo vuoto" });
  await sheet(page).last().getByRole("button", { name: "Aggiungi il gruppo" }).click();
  await expect(
    sheet(page).last().getByText("Questo gruppo non ha ancora persone: aggiungine prima dal gruppo."),
  ).toBeVisible();
  await sheet(page).last().getByLabel("Gruppo").selectOption({ label: "Famiglia Rossi" });
  await sheet(page).last().getByRole("button", { name: "Aggiungi il gruppo" }).click();
  await expect(page.getByText("Nessuno da aggiungere: sono già tutti seduti.")).toBeVisible();
  await expect(sheet(page)).toHaveCount(0);
  expect(await tableOf(w, "Mario")).toBe(uno);
  await expect(card(page, "Uno")).toContainText("2 / 10 posti");
});
