/**
 * QA T11 (FEAT-2026-004, projects `mobile` 360 px and `desktop` 1280 px): the couple side of RSVP in
 * Invitati, only what pgTAP and the integration tests do not already prove (QA-13): the screens, the
 * copy, the clipboard, WhatsApp, and what a guest gets from the link afterwards. Links come from
 * `seed.ts` (token.ts + `rsvp_create_links`); everything else goes through the UI. Invented data.
 * "Sola lettura" is not here: only the partner role holds `guests` permissions and it can always
 * write, so a read-only member cannot exist without editing the shared `role_permissions` (component
 * tests cover the hidden actions).
 *
 * AC map
 *  - AC1   "Crea link", "Copia link" (only the URL), "Condividi", "WhatsApp" (href, greeting, edited
 *          text), "Crea link per tutti (N)"; the copied URL opens the guest page
 *  - AC7   "Nuovo link" and "Revoca link": the old link is dead at once, the answers stay
 *  - AC8   "Condiviso il" only after a real copy / share / WhatsApp tap, Annulla; presence and the
 *          group summary; the read-only presence in the person sheet
 *  - AC9   mode switch, delete, restore, delete for good: which links work, "Da rimandare"
 *  - AC13  (the export is proved in tests/integration/rsvp.actions.test.ts)
 *  - REV-127 a note with <script> is text; "Annulla importazione" says how many stay
 */
import type { Page } from "@playwright/test";
import { loginAs } from "./support/auth";
import { expect, serviceClient, test, uniqueIp } from "./support/fixtures";
import {
  addGuest,
  addGuestGroup,
  addRsvpLink,
  currentRsvpLink,
  seedWedding,
  submitRsvp,
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
const confirmDialog = (page: Page) => page.getByRole("alertdialog");
const row = (page: Page, name: string) => page.getByTestId("guest-row").filter({ hasText: name });
const toasts = (page: Page) => page.getByRole("region", { name: /Notifications/ });
const db = () => serviceClient();

async function openMenu(page: Page, item: string | RegExp) {
  await page.getByRole("button", { name: "Altro", exact: true }).click();
  await sheet(page).getByRole("button", { name: item }).click();
}
/**
 * HTTP status of a guest link, without following anything. A dead link counts against the caller's
 * address and every local request shares one unless `x-forwarded-for` says otherwise (BR9), so each
 * call comes from its own fake address.
 */
const statusOf = async (page: Page, path: string) =>
  (
    await page.request.get(path, {
      maxRedirects: 0,
      headers: { "x-forwarded-for": uniqueIp() },
    })
  ).status();
const sharedAt = async (linkId: string) =>
  (await db().from("rsvp_links").select("shared_at").eq("id", linkId).single()).data?.shared_at;

async function family(w: SeededWedding, names = ["Anna", "Luca"]) {
  const group = await addGuestGroup(w, "Famiglia Rossi");
  const ids: string[] = [];
  for (const name of names)
    ids.push(await addGuest(w, { firstName: name, lastName: "Rossi", groupId: group }));
  return { group, ids };
}

test("create a link, copy it, edit the WhatsApp message; the copied URL opens the guest page (AC1, AC8)", async ({
  page,
  context,
  baseURL,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await context.route("https://wa.me/**", (route) => route.fulfill({ status: 200, body: "ok" }));
  const w = await start(); // no date chosen: the sheet warns about it
  const { group } = await family(w);
  await open(page, w);
  await expect(page.getByText("Nessun link")).toBeVisible();

  await page.getByRole("button", { name: "Invia il link di Famiglia Rossi" }).click();
  const link = sheet(page);
  await expect(link.getByRole("heading", { name: "Link di Famiglia Rossi" })).toBeVisible();
  await expect(link.getByText("La data non è ancora decisa")).toBeVisible();
  await expect(link.getByText("Non scade finché non scegli la data.")).toBeVisible();
  await link.getByRole("button", { name: "Crea link", exact: true }).click();
  const message = link.getByLabel("Messaggio");
  await expect(message).toHaveValue(
    // (the order of the two names follows the list, which does not tie-break equal surnames)
    /^Ciao (Anna e Luca|Luca e Anna)! Tony e Jessica si sposano e vorrebbero sapere se ci sarete\. Rispondi da qui, ci vuole un minuto: http/,
  );
  const made = (await currentRsvpLink(w, { groupId: group }))!;
  const url = `${baseURL}${made.path}`;
  await expect(message).toHaveValue(new RegExp(`${url}$`));

  // Copia link copies only the URL, marks "Condiviso il", and Annulla puts it back
  await link.getByRole("button", { name: "Copia link" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
  const done = link.getByRole("status").filter({ hasText: /^Link copiato · Condiviso il \d/ });
  await expect(done).toBeVisible();
  await expect.poll(() => sharedAt(made.linkId)).not.toBeNull();
  await done.getByRole("button", { name: "Annulla" }).click();
  await expect(done).toHaveCount(0);
  await expect.poll(() => sharedAt(made.linkId)).toBeNull();

  // WhatsApp: an <a> with the edited text, and the tap marks it shared
  await message.fill("Ciao a voi! Ci trovate qui:");
  const whatsapp = link.getByRole("link", { name: "WhatsApp" });
  const href = (await whatsapp.getAttribute("href"))!;
  expect(href.startsWith("https://wa.me/?text=")).toBe(true);
  expect(decodeURIComponent(href.slice("https://wa.me/?text=".length))).toBe(
    "Ciao a voi! Ci trovate qui:",
  );
  const [popup] = await Promise.all([context.waitForEvent("page"), whatsapp.click()]);
  await popup.close();
  await expect(
    link.getByRole("status").filter({ hasText: /^Aperto in WhatsApp · Condiviso il \d/ }),
  ).toBeVisible();
  await expect.poll(() => sharedAt(made.linkId)).not.toBeNull();
  await page.keyboard.press("Escape");
  await expect(page.getByText(/^Condiviso il \d/)).toBeVisible();

  // what the guest gets from the copied link
  const guest = await context.newPage();
  await guest.goto(url);
  await expect(guest.getByRole("heading", { level: 1 })).toHaveText("Tony e Jessica si sposano");
  await expect(guest.getByText("Data da confermare")).toBeVisible();
  await expect(guest.getByText("Luogo da confermare")).toBeVisible();
  await expect(guest.getByTestId(/^rsvp-person-/)).toHaveCount(2);
});

test("a cancelled share or a refused copy marks nothing; a completed share does (AC8, D11)", async ({
  page,
}) => {
  const w = await start();
  const mario = await addGuest(w, { firstName: "Mario", lastName: "Verdi" });
  const made = await addRsvpLink(w, { guestId: mario });
  await open(page, w);
  await page.evaluate(() => {
    const abort = () => Promise.reject(new DOMException("cancelled", "AbortError"));
    Object.defineProperty(navigator, "share", { configurable: true, value: abort });
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: () => Promise.reject(new DOMException("denied", "NotAllowedError")),
    });
  });
  await page.getByRole("button", { name: "Invia il link di Mario Verdi" }).click();
  const link = sheet(page);
  await expect(link.getByLabel("Messaggio")).toHaveValue(/\/rsvp\//);

  await link.getByRole("button", { name: "Condividi" }).click(); // the person closes the system sheet
  await link.getByRole("button", { name: "Copia link" }).click(); // the browser refuses
  await expect(link.getByRole("alert")).toHaveText(
    "Non sono riuscito a copiare. Selezionalo e copialo da qui.",
  );
  await expect(link.getByLabel("Indirizzo del link")).toHaveValue(/\/rsvp\/[A-Za-z0-9_-]{43}$/);
  await expect(link.getByRole("status").filter({ hasText: "Condiviso il" })).toHaveCount(0);
  expect(await sharedAt(made.linkId)).toBeNull();

  await page.evaluate(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: () => Promise.resolve(),
    });
  });
  await link.getByRole("button", { name: "Condividi" }).click();
  await expect(
    link.getByRole("status").filter({ hasText: /^Link condiviso · Condiviso il \d/ }),
  ).toBeVisible();
  await expect.poll(() => sharedAt(made.linkId)).not.toBeNull();
});

test("'Nuovo link' and 'Revoca link' ask first; the old link is dead at once, the URL changes, the answers stay (AC7)", async ({
  page,
  context,
  baseURL,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const w = await start();
  const mario = await addGuest(w, { firstName: "Mario", lastName: "Verdi" });
  const old = await addRsvpLink(w, { guestId: mario }, { shared: true });
  await submitRsvp(old, [{ id: mario, status: "yes", diet: ["vegan"] }]);
  await open(page, w);
  await expect(row(page, "Mario Verdi")).toContainText("Condiviso il");
  expect(await statusOf(page, old.path)).toBe(200);

  await page.getByRole("button", { name: "Invia il link di Mario Verdi" }).click();
  const link = sheet(page);
  await link.getByRole("button", { name: "Nuovo link" }).click();
  await expect(confirmDialog(page)).toContainText(
    "Creo un nuovo link per Mario Verdi? Quello vecchio smette di funzionare: dovrai rimandarlo.",
  );
  await confirmDialog(page).getByRole("button", { name: "Crea nuovo link" }).click();
  await expect(toasts(page).getByText("Ho creato un nuovo link.")).toBeVisible();
  const fresh = (await currentRsvpLink(w, { guestId: mario }))!;
  expect(fresh.linkId).not.toBe(old.linkId);
  expect(await statusOf(page, old.path)).toBe(404);
  expect(await statusOf(page, fresh.path)).toBe(200);
  // the sheet now offers the NEW url (REV-123)
  await link.getByRole("button", { name: "Copia link" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${baseURL}${fresh.path}`);
  await link.getByRole("status").getByRole("button", { name: "Annulla" }).click();

  await link.getByRole("button", { name: "Revoca link" }).click();
  await expect(confirmDialog(page)).toContainText(
    "Revoco il link di Mario Verdi? Chi lo apre vedrà che non funziona più. Le risposte già date restano.",
  );
  await confirmDialog(page).getByRole("button", { name: "Revoca", exact: true }).click();
  await expect(toasts(page).getByText("Link revocato.")).toBeVisible();
  await expect(link.getByRole("button", { name: "Crea un nuovo link" })).toBeVisible();
  await expect(link.getByRole("button", { name: "Revoca link" })).toHaveCount(0);
  await expect(link.getByRole("button", { name: "Copia link" })).toHaveCount(0);
  expect(await statusOf(page, fresh.path)).toBe(404);
  const kept = await db().from("rsvp_responses").select("status, diet").eq("id", mario);
  expect(kept.data).toEqual([{ status: "yes", diet: ["vegan"] }]);

  // the label survives a reopened sheet, and a new link works again
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Invia il link di Mario Verdi" }).click();
  await sheet(page).getByRole("button", { name: "Crea un nuovo link" }).click();
  await expect(sheet(page).getByRole("button", { name: "Copia link" })).toBeVisible();
  const again = (await currentRsvpLink(w, { guestId: mario }))!;
  expect(await statusOf(page, again.path)).toBe(200);
});

test("'Crea link per tutti (N)' confirms the number, creates the missing links, then says all have one (AC1)", async ({
  page,
}) => {
  const w = await start(); // no date: the dialog warns
  const { group } = await family(w);
  const mario = await addGuest(w, { firstName: "Mario", lastName: "Verdi" });
  const sara = await addGuest(w, { firstName: "Sara", lastName: "Bianchi" });
  await open(page, w);

  await openMenu(page, /^Crea link per tutti \(3\)/);
  await expect(confirmDialog(page)).toContainText(
    "Creo 3 link nuovi? Poi li condividi uno a uno da ogni gruppo o persona.",
  );
  await expect(confirmDialog(page).getByText("La data non è ancora decisa")).toBeVisible();
  await confirmDialog(page).getByRole("button", { name: "Crea link", exact: true }).click();
  await expect(toasts(page).getByText("Ho creato 3 link.")).toBeVisible();

  for (const target of [{ groupId: group }, { guestId: mario }, { guestId: sara }]) {
    const made = await currentRsvpLink(w, target);
    expect(made).not.toBeNull();
    expect(await statusOf(page, made!.path)).toBe(200);
  }
  await page.getByRole("button", { name: "Altro", exact: true }).click();
  const all = sheet(page).getByRole("button", { name: /^Crea link per tutti \(0\)/ });
  await expect(all).toBeDisabled();
  await expect(sheet(page).getByText("Tutti hanno già un link.")).toBeVisible();
});

test("a group's mode: 'ognuno per sé' kills the group link and asks for new ones, 'insieme' brings it back (AC9, BR3, BR4)", async ({
  page,
}) => {
  const w = await start();
  const { group, ids } = await family(w);
  const shared = await addRsvpLink(w, { groupId: group }, { shared: true });
  await open(page, w);
  const menu = async () => {
    await page.getByRole("button", { name: "Azioni del gruppo Famiglia Rossi" }).click();
    await sheet(page).getByRole("button", { name: "Come rispondono" }).click();
  };

  await menu();
  await expect(confirmDialog(page)).toContainText(
    'Famiglia Rossi: ora risponde insieme. Passando a "ognuno per sé" il link del gruppo smette di funzionare: servono 2 link nuovi.',
  );
  await confirmDialog(page).getByRole("button", { name: "Passa a ognuno per sé" }).click();
  await expect(toasts(page).getByText("Ora risponde ognuno per sé.")).toBeVisible();
  await expect(page.getByText("Risponde ognuno per sé")).toBeVisible();
  expect(await statusOf(page, shared.path)).toBe(404);
  // each person is a recipient on their own and the old shared link is gone: "Da rimandare"
  await expect(row(page, "Anna Rossi")).toContainText("Da rimandare");
  await expect(row(page, "Luca Rossi")).toContainText("Da rimandare");
  await expect(page.getByRole("button", { name: "Invia il link di Anna Rossi" })).toBeVisible();

  // a personal link for Anna, then back to "insieme": hers stops, the group's works again
  const personal = await addRsvpLink(w, { guestId: ids[0]! });
  await page.reload();
  await menu();
  await expect(confirmDialog(page)).toContainText(
    'Passando a "insieme" il link personale smette di funzionare: basta un solo link per il gruppo.',
  );
  await confirmDialog(page).getByRole("button", { name: "Passa a insieme" }).click();
  await expect(toasts(page).getByText("Ora il gruppo risponde insieme.")).toBeVisible();
  await expect.poll(() => statusOf(page, personal.path)).toBe(404);
  expect(await statusOf(page, shared.path)).toBe(200);
  await expect(page.getByText(/^Condiviso il \d/)).toBeVisible();
  await expect(page.getByText("Da rimandare")).toHaveCount(0);
});

test("a person moved out of a shared group shows 'Da rimandare'; the group's link still works for the rest (AC9, BR3)", async ({
  page,
}) => {
  const w = await start();
  const { group, ids } = await family(w, ["Anna", "Luca", "Marco"]);
  const shared = await addRsvpLink(w, { groupId: group }, { shared: true });
  const moved = await w.wedding.founderClient
    .from("guests")
    .update({ group_id: null })
    .eq("id", ids[2]!);
  expect(moved.error).toBeNull();
  await open(page, w);
  await expect(row(page, "Marco Rossi")).toContainText("Da rimandare");
  await expect(page.getByRole("button", { name: "Invia il link di Marco Rossi" })).toBeVisible();
  expect(await statusOf(page, shared.path)).toBe(200);
});

test("delete a group, restore it, delete it for good; delete a person for good: links and answers follow (AC9, BR4, BR5)", async ({
  page,
}) => {
  const w = await start();
  const { group, ids } = await family(w);
  const shared = await addRsvpLink(w, { groupId: group }, { shared: true });
  await submitRsvp(shared, [{ id: ids[0]!, status: "yes" }]);
  await open(page, w);

  const deleteGroup = async () => {
    await page.getByRole("button", { name: "Azioni del gruppo Famiglia Rossi" }).click();
    await sheet(page).getByRole("button", { name: "Elimina gruppo" }).click();
    await confirmDialog(page).getByRole("button", { name: "Elimina gruppo" }).click();
  };
  await deleteGroup();
  await expect(page.getByRole("heading", { level: 2, name: /Famiglia Rossi/ })).toHaveCount(0);
  await expect.poll(() => statusOf(page, shared.path)).toBe(404);
  await expect(row(page, "Anna Rossi")).toContainText("Da rimandare");

  // restore: the dormant link wakes up by itself (BR4)
  await openMenu(page, /^Eliminati di recente \(1\)/);
  await sheet(page).getByRole("button", { name: "Ripristina Famiglia Rossi" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { level: 2, name: /Famiglia Rossi/ })).toBeVisible();
  await expect.poll(() => statusOf(page, shared.path)).toBe(200);

  // delete again and remove for good: the link row is physically gone
  await deleteGroup();
  await openMenu(page, /^Eliminati di recente \(1\)/);
  await sheet(page).getByRole("button", { name: "Elimina definitivamente Famiglia Rossi" }).click();
  await confirmDialog(page).getByRole("button", { name: "Elimina definitivamente" }).click();
  await expect(page.getByText("Eliminato per sempre.")).toBeVisible();
  const left = await db().from("rsvp_links").select("id").eq("id", shared.linkId);
  expect(left.data).toEqual([]);
  expect(await statusOf(page, shared.path)).toBe(404);
  await page.keyboard.press("Escape");

  // a person: their answer goes with them
  expect((await db().from("rsvp_responses").select("id").eq("id", ids[0]!)).data).toHaveLength(1);
  await row(page, "Anna Rossi").click();
  await sheet(page).getByRole("button", { name: "Elimina", exact: true }).click();
  await openMenu(page, /^Eliminati di recente \(1\)/);
  await sheet(page).getByRole("button", { name: "Elimina definitivamente Anna Rossi" }).click();
  await confirmDialog(page).getByRole("button", { name: "Elimina definitivamente" }).click();
  await expect(page.getByText("Eliminato per sempre.")).toBeVisible();
  await expect
    .poll(async () => (await db().from("rsvp_responses").select("id").eq("id", ids[0]!)).data)
    .toEqual([]);
});

test("'Annulla importazione' keeps who already has a link and says how many stay (AC8)", async ({
  page,
}) => {
  const w = await start();
  await addGuest(w, { firstName: "Gia", lastName: "Presente" });
  await open(page, w);
  await openMenu(page, "Importa");
  const form = sheet(page);
  await form.getByLabel("Una persona per riga").fill("nome;cognome\nAnna;Nuova\nBruno;Nuovo");
  await form.getByRole("button", { name: "Vedi l'anteprima" }).click();
  await form.getByRole("button", { name: "Importa 2 invitati" }).click();
  await expect(toasts(page).getByText("2 invitati importati.", { exact: true })).toBeVisible();
  if (await sheet(page).count()) await page.keyboard.press("Escape");

  // Anna gets a link meanwhile: she is no longer "not yet touched"
  const anna = (
    await db().from("guests").select("id").eq("wedding_id", w.weddingId).eq("first_name", "Anna")
  ).data![0]!;
  await addRsvpLink(w, { guestId: anna.id });
  await toasts(page).getByRole("button", { name: "Annulla importazione" }).click();
  await expect(
    page.getByText("Ho annullato 1 persona; 1 resta perché ha già risposto o ha un link."),
  ).toBeVisible();
  const names = (await db().from("guests").select("first_name").eq("wedding_id", w.weddingId))
    .data!;
  expect(names.map((g) => g.first_name).sort()).toEqual(["Anna", "Gia"]);
});

test("presence in the list and the person sheet; a note with <script> is only text (AC8, REV-127)", async ({
  page,
}) => {
  const w = await start();
  const { group, ids } = await family(w, ["Anna", "Luca", "Marta"]);
  const link = await addRsvpLink(w, { groupId: group }, { shared: true });
  await submitRsvp(link, [
    {
      id: ids[0]!,
      status: "yes",
      diet: ["vegetarian"],
      diet_note: "<script>window.__xss = 1</script>",
    },
    { id: ids[1]!, status: "no" },
  ]);
  await open(page, w);

  const header = page.getByRole("heading", { level: 2, name: /Famiglia Rossi/ });
  await expect(header).toContainText("1 sì · 1 no · 1 in attesa");
  await expect(header).toHaveAccessibleName(
    /^Famiglia Rossi, .*1 sì, 1 no, 1 in attesa, link condiviso il \d/,
  );
  await expect(row(page, "Anna Rossi")).toContainText("Sì");
  await expect(row(page, "Luca Rossi")).toContainText("No");
  await expect(row(page, "Marta Rossi")).toContainText("In attesa");

  await row(page, "Anna Rossi").click();
  const person = sheet(page);
  await expect(person.getByRole("heading", { name: "Presenza" })).toBeVisible();
  await expect(
    person.getByText("Preferenze: Vegetariano, <script>window.__xss = 1</script>"),
  ).toBeVisible();
  await expect(person.getByText(/^Ultima risposta: .+, dall'invitato$/)).toBeVisible();
  await expect(person.getByText("Invito: risponde con il gruppo Famiglia Rossi")).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { __xss?: number }).__xss),
  ).toBeUndefined();
  expect(await person.locator("script").count()).toBe(0);

  await person.getByRole("button", { name: "Apri link" }).click();
  await expect(sheet(page).getByRole("heading", { name: "Link di Famiglia Rossi" })).toBeVisible();
});
