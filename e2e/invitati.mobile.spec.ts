/**
 * QA T8 (FEAT-2026-003 S1, project `mobile`, 360 px): the people flows and the bulk actions.
 * Annulla is clicked at once (the 8 s guarantee is a Vitest fake-timer test, QA-9). Everything is
 * seeded through `seedGuests`/`addGuest`, never through the UI; all data is invented.
 *
 * AC map
 *  - AC1   empty state with "Aggiungi invitato"; list, summary and actions; no sideways scroll at 320 px
 *  - AC2   name required (Italian message), phone/email rules, tel/email fields, saved to the list
 *  - AC3   "Salva e aggiungi un altro" keeps type, side and group, clears the name, focus on the name
 *  - AC4   the options are the partners' names, "Entrambi", "Non indicato"; the stored value is A/B/both/null
 *  - AC5   "Nuova famiglia", "Nuovo gruppo…", "Aggiungi persona" from the group; group summary
 *  - AC7   multiple selection, "Seleziona tutti i N filtrati", assign / delete with Annulla
 *  - AC8   summary (infants counted, deleted never), "Per lato", "12 di 42" with filters
 *  - AC9   search, filters sheet, chips, "Azzera filtri"
 *  - AC10  person and group: Annulla, "Eliminati di recente", restore (members come back)
 *  - AC11  "Elimina definitivamente" and "Svuota" with a confirmation that carries the number
 *  - NFR   axe on the list and on the open sheets
 */
import type { Page } from "@playwright/test";
import { axeFindings, describeFindings } from "./support/axe";
import { loginAs } from "./support/auth";
import { expect, serviceClient, test, uniqueIp } from "./support/fixtures";
import { addGuest, addGuestGroup, seedGuests, seedWedding, type SeededWedding } from "./support/seed";

test.describe.configure({ timeout: 90_000 });

const NAMES = { a: "Tony", b: "Jessica" };

const start = (): Promise<SeededWedding> => seedWedding({ templateTasks: false, names: NAMES });
const open = async (page: Page, w: SeededWedding) => {
  await loginAs(page, w.wedding.founder, uniqueIp());
  await page.goto("/invitati");
  await expect(page.getByRole("heading", { level: 1, name: "Invitati" })).toBeVisible();
};
const sheet = (page: Page) => page.getByRole("dialog");
const row = (page: Page, name: string) => page.getByTestId("guest-row").filter({ hasText: name });
/** The "Annulla" of the toast (not the one of a sheet or dialog). */
const undo = (page: Page) =>
  page.getByRole("region", { name: /Notifications/ }).getByRole("button", { name: "Annulla" });
const db = () => serviceClient();
const guestsOf = async (w: SeededWedding) =>
  (await db().from("guests").select("*").eq("wedding_id", w.weddingId)).data ?? [];

async function openMenu(page: Page, item: string | RegExp) {
  await page.getByRole("button", { name: "Altro", exact: true }).click();
  await sheet(page).getByRole("button", { name: item }).click();
}

test("empty state, then a person with every field: rules, keyboards and the stored side (AC1, AC2, AC4)", async ({
  page,
}) => {
  const w = await start();
  await open(page, w);
  await expect(page.getByText("Ancora nessun invitato")).toBeVisible();
  await expect(page.getByText("Aggiungili uno a uno o incolla la tua lista.")).toBeVisible();
  const empty = await axeFindings(page);
  expect(empty, describeFindings(empty)).toEqual([]);

  await page.getByRole("button", { name: "Aggiungi invitato" }).click();
  const form = sheet(page);
  await expect(form.getByRole("heading", { name: "Nuovo invitato" })).toBeVisible();
  // no name: refused, in Italian, and nothing is written
  await form.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(form.getByText("Scrivi il nome.")).toBeVisible();
  expect(await guestsOf(w)).toHaveLength(0);

  // the side options are the partners' names, never "A" / "B"
  const side = form.getByLabel("Lato");
  await expect(side.locator("option")).toHaveText(["Non indicato", "Tony", "Jessica", "Entrambi"]);
  await expect(side).toHaveValue("");

  await form.getByLabel("Nome", { exact: true }).fill("Marta");
  await form.getByLabel("Cognome").fill("Prova");
  await form.getByText("Bambino", { exact: true }).click();
  await side.selectOption({ label: "Jessica" });
  await form.getByRole("button", { name: "Altri dati" }).click();
  await expect(form.getByLabel("Telefono")).toHaveAttribute("type", "tel");
  await expect(form.getByLabel("Email")).toHaveAttribute("type", "email");
  await form.getByLabel("Telefono").fill("abc");
  await form.getByLabel("Email").fill("senza-chiocciola");
  await form.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(form.getByText(/Il telefono può contenere solo/)).toBeVisible();
  await expect(form.getByText("Controlla l'email: manca qualcosa.")).toBeVisible();
  expect(await guestsOf(w)).toHaveLength(0);

  await form.getByLabel("Telefono").fill("+39 000 000111");
  await form.getByLabel("Email").fill("marta.prova@example.test");
  await form.getByLabel("Note").fill("Allergica ai kiwi (dato inventato)");
  const filled = await axeFindings(page);
  expect(filled, describeFindings(filled)).toEqual([]);
  await form.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(page.getByText("Aggiunto.")).toBeVisible();
  await expect(row(page, "Marta Prova")).toBeVisible();

  const saved = await guestsOf(w);
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({
    first_name: "Marta",
    last_name: "Prova",
    category: "child",
    side: "B", // the slot, not the name "Jessica"
    phone: "+39 000 000111",
    email: "marta.prova@example.test",
  });
});

test("'Salva e aggiungi un altro' keeps type, side and group, clears the name and refocuses it; a duplicate only warns (AC3, AC5, BR4)", async ({
  page,
}) => {
  const w = await start();
  await open(page, w);
  await page.getByRole("button", { name: "Aggiungi invitato" }).click();
  const form = sheet(page);
  await form.getByLabel("Nome", { exact: true }).fill("Pino");
  await form.getByLabel("Cognome").fill("Rossi");
  await form.getByText("Bambino", { exact: true }).click();
  await form.getByLabel("Lato").selectOption({ label: "Entrambi" });
  await form.getByLabel("Gruppo", { exact: true }).selectOption({ label: "Nuovo gruppo…" });
  await form.getByLabel("Nome del nuovo gruppo").fill("Famiglia Rossi");
  await form.getByRole("button", { name: "Salva e aggiungi un altro" }).click();

  await expect(form.getByRole("status").filter({ hasText: "Pino Rossi aggiunto" })).toHaveCount(1);
  const name = form.getByLabel("Nome", { exact: true });
  await expect(name).toHaveValue("");
  await expect(name).toBeFocused();
  await expect(form.getByLabel("Cognome")).toHaveValue("");
  await expect(form.getByRole("radio", { name: "Bambino" })).toBeChecked();
  await expect(form.getByLabel("Lato")).toHaveValue("both");
  await expect(form.getByLabel("Gruppo", { exact: true }).locator("option:checked")).toHaveText(
    "Famiglia Rossi",
  );

  // the same person again: a warning that does not block
  await name.fill("Pino");
  await form.getByLabel("Cognome").fill("Rossi");
  await expect(form.getByText("Hai già un Pino Rossi. Puoi salvare lo stesso.")).toBeVisible();
  await form.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(page.getByText("Aggiunto.")).toBeVisible();

  const saved = await guestsOf(w);
  expect(saved).toHaveLength(2);
  expect(new Set(saved.map((g) => g.group_id)).size).toBe(1);
  expect(saved.every((g) => g.category === "child" && g.side === "both")).toBe(true);
});

test("a family in one save, then 'Aggiungi persona' from the group; the group shows its adults and children (AC5)", async ({
  page,
}) => {
  const w = await start();
  await open(page, w);
  await page.getByRole("button", { name: "Aggiungi invitato" }).click();
  await sheet(page).getByLabel("Nome", { exact: true }).fill("Capo");
  await sheet(page).getByRole("button", { name: "Salva", exact: true }).click();
  await expect(row(page, "Capo")).toBeVisible();

  await page.getByRole("button", { name: "Aggiungi", exact: true }).click();
  await sheet(page).getByRole("button", { name: "Una famiglia" }).click();
  const form = sheet(page);
  await expect(form.getByRole("heading", { name: "Nuova famiglia" })).toBeVisible();
  // no person at all: refused
  await form.getByLabel("Nome del gruppo").fill("Famiglia Verdi");
  await form.getByRole("button", { name: "Salva la famiglia" }).click();
  await expect(form.getByText("Aggiungi almeno una persona.")).toBeVisible();

  await form.getByLabel("Lato di tutta la famiglia").selectOption({ label: "Tony" });
  await form.getByLabel("Nome (persona 1)", { exact: true }).fill("Gino");
  await expect(form.getByLabel("Cognome (persona 1)", { exact: true })).toHaveValue("Verdi");
  await form.getByLabel("Nome (persona 2)", { exact: true }).fill("Rita");
  await form.getByRole("button", { name: "Aggiungi un'altra riga" }).click();
  await form.getByLabel("Nome (persona 3)", { exact: true }).fill("Lulù");
  await form.getByLabel("Tipo (persona 3)", { exact: true }).selectOption({ label: "Bambino" });
  await form.getByRole("button", { name: "Salva la famiglia" }).click();
  await expect(page.getByText("Famiglia aggiunta: 3 persone.")).toBeVisible();

  await expect(
    page.getByRole("heading", { level: 2, name: /Famiglia Verdi · 2 adulti, 1 bambino/ }),
  ).toBeVisible();
  const group = (
    await db().from("guest_groups").select("id").eq("wedding_id", w.weddingId).eq("name", "Famiglia Verdi")
  ).data!;
  expect(group).toHaveLength(1);
  const members = (await guestsOf(w)).filter((g) => g.group_id === group[0]!.id);
  expect(members.map((g) => g.first_name).sort()).toEqual(["Gino", "Lulù", "Rita"]);
  expect(members.every((g) => g.side === "A")).toBe(true);

  // "Aggiungi persona" from the group menu pre-selects the group
  await page.getByRole("button", { name: "Azioni del gruppo Famiglia Verdi" }).click();
  await sheet(page).getByRole("button", { name: "Aggiungi persona" }).click();
  const add = sheet(page);
  await expect(add.getByLabel("Gruppo", { exact: true }).locator("option:checked")).toHaveText(
    "Famiglia Verdi",
  );
  await add.getByLabel("Nome", { exact: true }).fill("Nonna");
  await add.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: /Famiglia Verdi · 3 adulti, 1 bambino/ }),
  ).toBeVisible();
});

test("summary, 'Per lato', search and filters: infants counted, deleted never, '3 di 7' with the sides on the total (AC8, AC9, AC1)", async ({
  page,
}) => {
  const w = await start();
  const rossi = await addGuestGroup(w, "Famiglia Rossi");
  await addGuest(w, { firstName: "Mario", lastName: "Rossi", side: "A", groupId: rossi });
  await addGuest(w, { firstName: "Luisa", lastName: "Rossi", side: "A", groupId: rossi });
  await addGuest(w, { firstName: "Luca", lastName: "Rossi", side: "A", groupId: rossi, category: "child" });
  await addGuest(w, { firstName: "Sara", lastName: "Bianchi", side: "B" });
  await addGuest(w, { firstName: "Neo", lastName: "Bianchi", side: "B", category: "infant" });
  await addGuest(w, { firstName: "Ugo", lastName: "Verdi", side: "both" });
  await addGuest(w, { firstName: "Gino", lastName: "Neri" });
  await addGuest(w, { firstName: "Cancellato", lastName: "Prova", deleted: true });
  await open(page, w);

  const count = page.getByTestId("guests-count");
  const summary = page.getByTestId("guests-summary");
  await expect(count).toHaveText("7 persone");
  await expect(summary).toContainText("5 adulti · 1 bambino · 1 neonato");
  await expect(page.getByText("Cancellato")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { level: 2, name: /Famiglia Rossi · 2 adulti, 1 bambino/ }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /Senza gruppo/ })).toBeVisible();

  await page.getByRole("button", { name: "Per lato" }).click();
  await expect(page.getByTestId("side-A")).toContainText("Tony: 3 persone");
  await expect(page.getByTestId("side-B")).toContainText("Jessica: 2 persone");
  await expect(page.getByTestId("side-B")).toContainText("1 adulto · 0 bambini · 1 neonato");
  await expect(page.getByTestId("side-both")).toContainText("Entrambi: 1 persona");
  await expect(page.getByTestId("side-none")).toContainText("Non indicato: 1 persona");

  // search: the list is flat, the summary says "3 di 7", the sides stay on the total
  await page.getByRole("searchbox", { name: "Cerca per nome" }).fill("rossi");
  await expect(count).toHaveText("3 di 7 persone");
  await expect(page.getByTestId("guest-list-flat")).toBeVisible();
  await expect(page.getByTestId("guest-row")).toHaveCount(3);
  await expect(page.getByTestId("side-B")).toContainText("Jessica: 2 persone");

  // filters in a sheet, with removable chips
  await page.getByRole("searchbox", { name: "Cerca per nome" }).fill("");
  await page.getByTestId("filters-button").click();
  const filters = sheet(page);
  await filters.getByRole("radio", { name: "Jessica" }).click();
  await expect(filters.getByRole("button", { name: "Mostra 2 persone" })).toBeVisible();
  await filters.getByRole("radio", { name: "Neonato (0-2 anni)" }).click();
  await expect(filters.getByRole("button", { name: "Mostra 1 persona" })).toBeVisible();
  await filters.getByRole("button", { name: "Mostra 1 persona" }).click();
  await expect(count).toHaveText("1 di 7 persone");
  await expect(page.getByTestId("filter-chips").getByRole("button")).toHaveCount(2);
  await expect(row(page, "Neo Bianchi")).toBeVisible();
  await page.getByTestId("filter-chips").getByRole("button").first().click();
  await expect(page.getByTestId("filter-chips").getByRole("button")).toHaveCount(1);

  // no match: a calm empty state with "Azzera filtri"
  await page.getByRole("searchbox", { name: "Cerca per nome" }).fill("zzzz");
  await expect(page.getByText("Nessun invitato con questi filtri")).toBeVisible();
  await page.getByRole("button", { name: "Azzera filtri" }).click();
  // it resets the search and the filters together
  await expect(page.getByRole("searchbox", { name: "Cerca per nome" })).toHaveValue("");
  await expect(page.getByTestId("filter-chips")).toHaveCount(0);
  await expect(count).toHaveText("7 persone");

  // 320 px: nothing sideways
  await page.setViewportSize({ width: 320, height: 700 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
});

test("axe on the list with people, groups and sides (NFR)", async ({ page }) => {
  const w = await start();
  const rossi = await addGuestGroup(w, "Famiglia Rossi");
  await addGuest(w, { firstName: "Mario", lastName: "Rossi", side: "A", groupId: rossi });
  await addGuest(w, { firstName: "Neo", lastName: "Bianchi", side: "B", category: "infant" });
  await open(page, w);
  await expect(row(page, "Mario Rossi")).toBeVisible();
  const list = await axeFindings(page);
  expect(list, describeFindings(list)).toEqual([]);
});

test("delete a person: Annulla at once; without it 'Eliminati di recente' restores it; 'Elimina definitivamente' and 'Svuota' ask first (AC10, AC11)", async ({
  page,
}) => {
  const w = await start();
  for (const first of ["Anna", "Bruno", "Carla"]) await addGuest(w, { firstName: first, lastName: "Prova" });
  await open(page, w);
  const stateOf = async (first: string) => {
    const found = (await guestsOf(w)).find((g) => g.first_name === first);
    return found ? found.deleted_at : "gone";
  };

  // 1. delete, then Annulla straight away
  await row(page, "Anna Prova").click();
  await sheet(page).getByRole("button", { name: "Elimina", exact: true }).click();
  await expect(row(page, "Anna Prova")).toHaveCount(0);
  await expect(page.getByTestId("guests-count")).toHaveText("2 persone");
  await undo(page).click();
  await expect(row(page, "Anna Prova")).toBeVisible();
  await expect.poll(() => stateOf("Anna")).toBeNull();

  // 2. delete and leave it: it is in "Eliminati di recente", restorable
  await row(page, "Anna Prova").click();
  await sheet(page).getByRole("button", { name: "Elimina", exact: true }).click();
  await expect(row(page, "Anna Prova")).toHaveCount(0);
  await openMenu(page, /^Eliminati di recente \(1\)/);
  const recent = sheet(page);
  await expect(recent.getByText("Restano qui finché non li elimini definitivamente.")).toBeVisible();
  await expect(recent.getByRole("heading", { name: "Persone (1)" })).toBeVisible();
  await expect(recent.getByRole("heading", { name: /Gruppi|Tavoli/ })).toHaveCount(0);
  await recent.getByRole("button", { name: "Ripristina Anna Prova" }).click();
  await expect(page.getByText("Ripristinato.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(row(page, "Anna Prova")).toBeVisible();
  await expect.poll(() => stateOf("Anna")).toBeNull();

  // 3. two deleted; one is removed for good after a confirmation with consequences
  for (const first of ["Anna", "Bruno"]) {
    await row(page, `${first} Prova`).click();
    await sheet(page).getByRole("button", { name: "Elimina", exact: true }).click();
    await expect(row(page, `${first} Prova`)).toHaveCount(0);
  }
  await openMenu(page, /^Eliminati di recente \(2\)/);
  await sheet(page).getByRole("button", { name: "Elimina definitivamente Anna Prova" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("Elimini definitivamente «Anna Prova»?");
  await expect(confirm).toContainText("Non si può annullare.");
  await expect(confirm).toContainText("Spariscono anche dalle esportazioni.");
  await expect(confirm.getByRole("button", { name: "Annulla" })).toBeFocused();
  // refusing does nothing
  await confirm.getByRole("button", { name: "Annulla" }).click();
  expect(await stateOf("Anna")).not.toBeNull();
  expect(await stateOf("Anna")).not.toBe("gone");
  await sheet(page).getByRole("button", { name: "Elimina definitivamente Anna Prova" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Elimina definitivamente" }).click();
  await expect(page.getByText("Eliminato per sempre.")).toBeVisible();
  await expect.poll(() => stateOf("Anna")).toBe("gone");

  // 4. "Svuota": the confirmation carries the number; no expiry exists, so nothing else vanishes
  await sheet(page).getByRole("button", { name: /^Svuota tutto \(1\)/ }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Elimini definitivamente 1 persona?");
  await page.getByRole("alertdialog").getByRole("button", { name: "Elimina definitivamente" }).click();
  await expect(page.getByText("Eliminati per sempre.")).toBeVisible();
  await expect.poll(() => stateOf("Bruno")).toBe("gone");
  await expect(sheet(page).getByText("Niente di eliminato di recente.")).toBeVisible();
  expect(await stateOf("Carla")).toBeNull();
  const sheetOpen = await axeFindings(page);
  expect(sheetOpen, describeFindings(sheetOpen)).toEqual([]);
});

test("delete a group: the members stay 'Senza gruppo', come back when it is restored; removed for good they only lose the pointer (AC10, AC11)", async ({
  page,
}) => {
  const w = await start();
  const rossi = await addGuestGroup(w, "Famiglia Rossi");
  await addGuest(w, { firstName: "Mario", lastName: "Rossi", groupId: rossi });
  await addGuest(w, { firstName: "Luisa", lastName: "Rossi", groupId: rossi });
  await addGuest(w, { firstName: "Solo", lastName: "Prova" });
  await open(page, w);
  const groupHeading = page.getByRole("heading", { level: 2, name: /Famiglia Rossi/ });
  const memberGroups = async () =>
    (await guestsOf(w)).filter((g) => g.last_name === "Rossi").map((g) => g.group_id);

  await page.getByRole("button", { name: "Azioni del gruppo Famiglia Rossi" }).click();
  await sheet(page).getByRole("button", { name: "Elimina gruppo" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("Elimini il gruppo «Famiglia Rossi»?");
  await expect(confirm).toContainText("Le 2 persone restano, senza gruppo.");
  await confirm.getByRole("button", { name: "Elimina gruppo" }).click();
  await expect(groupHeading).toHaveCount(0);
  // the 2 people are still in the list, now under "Senza gruppo"
  await expect(page.getByTestId("guests-count")).toHaveText("3 persone");
  await expect(row(page, "Mario Rossi")).toBeVisible();
  // the pointer is kept: restoring brings them back with no other step
  expect(await memberGroups()).toEqual([rossi, rossi]);

  await openMenu(page, /^Eliminati di recente \(1\)/);
  await expect(sheet(page).getByRole("heading", { name: "Gruppi (1)" })).toBeVisible();
  await expect(sheet(page).getByText("2 persone, rientrano se lo ripristini")).toBeVisible();
  await sheet(page).getByRole("button", { name: "Ripristina Famiglia Rossi" }).click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("heading", { level: 2, name: /Famiglia Rossi · 2 adulti/ }),
  ).toBeVisible();

  // delete again, then remove for good: the members live on, with no group at all
  await page.getByRole("button", { name: "Azioni del gruppo Famiglia Rossi" }).click();
  await sheet(page).getByRole("button", { name: "Elimina gruppo" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Elimina gruppo" }).click();
  await openMenu(page, /^Eliminati di recente \(1\)/);
  await sheet(page).getByRole("button", { name: "Elimina definitivamente Famiglia Rossi" }).click();
  await expect(page.getByRole("alertdialog")).toContainText(
    "Non si può annullare. Le 2 persone che ne fanno parte restano, senza gruppo.",
  );
  await page.getByRole("alertdialog").getByRole("button", { name: "Elimina definitivamente" }).click();
  await expect(page.getByText("Eliminato per sempre.")).toBeVisible();
  await expect.poll(memberGroups).toEqual([null, null]);
  expect((await guestsOf(w)).filter((g) => g.deleted_at !== null)).toHaveLength(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("guests-count")).toHaveText("3 persone");
});

test("multiple selection: assign to a group and delete, each undone with Annulla at once (AC7)", async ({
  page,
}) => {
  const w = await start();
  const seeded = await seedGuests(w, 5);
  const group = await addGuestGroup(w, "Gruppo Prova");
  await open(page, w);
  const groupsOf = async () => (await guestsOf(w)).map((g) => g.group_id);
  const names = seeded.firstNames.map((f, i) => `${f} Esempio${i + 1}`);

  await openMenu(page, "Seleziona");
  const bar = page.getByTestId("selection-bar");
  await expect(bar).toContainText("0 selezionati");
  await expect(bar.getByRole("button", { name: "Assegna a gruppo" })).toBeDisabled();
  await expect(bar.getByRole("button", { name: "Elimina" })).toBeDisabled();
  for (const name of names.slice(0, 3)) await page.getByRole("checkbox", { name: `Seleziona ${name}` }).check();
  await expect(bar).toContainText("3 selezionati");

  await bar.getByRole("button", { name: "Assegna a gruppo" }).click();
  await sheet(page).getByLabel("Gruppo", { exact: true }).selectOption({ label: "Gruppo Prova" });
  await sheet(page).getByRole("button", { name: "Assegna", exact: true }).click();
  await expect(page.getByText("3 persone in «Gruppo Prova».")).toBeVisible();
  await expect.poll(async () => (await groupsOf()).filter((g) => g === group).length).toBe(3);
  await undo(page).click();
  await expect(page.getByText("Annullato: 3 persone ripristinate")).toBeVisible();
  await expect.poll(async () => (await groupsOf()).filter((g) => g !== null).length).toBe(0);

  // delete all of them through "Seleziona tutti", then undo
  await openMenu(page, "Seleziona");
  // without search or filters the label has no "filtrati"
  await page.getByRole("button", { name: "Seleziona tutti i 5", exact: true }).click();
  await expect(page.getByTestId("selection-bar")).toContainText("5 selezionati");
  await page.getByTestId("selection-bar").getByRole("button", { name: "Elimina" }).click();
  await expect(page.getByText("5 persone eliminate.")).toBeVisible();
  await expect(page.getByText("Ancora nessun invitato")).toBeVisible();
  expect((await guestsOf(w)).every((g) => g.deleted_at !== null)).toBe(true);
  await undo(page).click();
  await expect(page.getByTestId("guests-count")).toHaveText("5 persone");
  await expect
    .poll(async () => (await guestsOf(w)).filter((g) => g.deleted_at !== null).length)
    .toBe(0);
});

test("at 320 px neither the add button nor the selection bar covers the last row or 'Mostra altre' (REV-24); selection resets with the search (AC7)", async ({
  page,
}) => {
  const w = await start();
  await seedGuests(w, 150);
  await open(page, w);
  await page.setViewportSize({ width: 320, height: 640 });
  // above 100 people the group starts closed: open it, 100 rows and a "Mostra altre"
  await expect(page.getByTestId("guests-count")).toHaveText("150 persone");
  await page.getByRole("heading", { level: 2, name: /Senza gruppo/ }).getByRole("button").click();
  await expect(page.getByTestId("guest-row")).toHaveCount(100);
  const more = page.getByRole("button", { name: /^Mostra altre 50 \(ne restano 50\)/ });

  /** Is the element's box free of every fixed element (FAB, selection bar) once scrolled to the end? */
  const clear = async (target: import("@playwright/test").Locator) => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await target.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const box = await target.boundingBox();
    const covers = await page.evaluate((b) => {
      const fixed = [...document.querySelectorAll("body *")]
        .filter((el) => getComputedStyle(el).position === "fixed")
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0);
      return fixed.some(
        (r) => r.left < b!.x + b!.width && r.right > b!.x && r.top < b!.y + b!.height && r.bottom > b!.y,
      );
    }, box);
    return !covers;
  };
  expect(await clear(more), "FAB over 'Mostra altre'").toBe(true);
  await more.click();
  await expect(page.getByTestId("guest-row")).toHaveCount(150);
  expect(await clear(page.getByTestId("guest-row").last()), "FAB over the last row").toBe(true);

  await openMenu(page, "Seleziona");
  await expect(page.getByTestId("selection-bar")).toBeVisible();
  expect(await clear(page.getByTestId("guest-row").last()), "bar over the last row").toBe(true);

  // the selection is cleared when the search changes
  await page.getByRole("checkbox", { name: /^Seleziona Prova1 / }).first().check();
  await expect(page.getByTestId("selection-bar")).toContainText("1 selezionato");
  await page.getByRole("searchbox", { name: "Cerca per nome" }).fill("Prova14");
  await expect(page.getByTestId("selection-bar")).toContainText("0 selezionati");
  await expect(
    page.getByTestId("selection-bar").getByRole("button", { name: /^Seleziona tutti i \d+ filtrati$/ }),
  ).toBeVisible();
});
