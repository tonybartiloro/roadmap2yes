/**
 * QA T11 (FEAT-2026-004, projects `mobile` 360 px and `desktop` 1280 px): the public RSVP page, the
 * way a guest meets it. Every link is made through `token.ts` + the RPC `rsvp_create_links` (never the
 * token of the local seed, QA-6); every person is invented. The expiry is in `rsvp.time.spec.ts`.
 *
 * AC map
 *  - AC2   opens without login at 320 px and on desktop, without JavaScript; no third-party request
 *  - AC3   couple, date, place, the people of the recipient with their type, privacy note; no brand
 *  - AC4   "Vengono tutti", counter, partial submit, "Grazie!", "In attesa" stays, reopen, Modifica,
 *          zero choices explained
 *  - AC5   a "together" group answers for all its people (infant included), one answer per person
 *  - AC6   dead links (unknown, revoked, malformed) = the same neutral 404; a submit on a link
 *          revoked meanwhile = the neutral view; with and without JavaScript
 *  - AC10  429 with Retry-After over the IP limit, the same words inside the form over the link limit;
 *          the server output never carries the token
 *  - AC11  two tabs ("erano già cambiate"), revoked while filling, offline keeps the choices
 *  - QA-14 a signed-in partner sees the page of the wedding the link belongs to
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { loginAs } from "./support/auth";
import { expect, serviceClient, test, uniqueIp } from "./support/fixtures";
import {
  addGuest,
  addGuestGroup,
  addRsvpLink,
  blockRsvpIp,
  chooseDate,
  chooseLocation,
  revokeRsvpLink,
  seedWedding,
  submitRsvp,
  type SeededLink,
  type SeededWedding,
} from "./support/seed";

test.describe.configure({ timeout: 90_000 });

// `next start` hands every local request the same address when no `x-forwarded-for` comes in, and a
// dead link counts against that address (BR9: 10 in 15 minutes). Every test gets its own fake one.
test.beforeEach(async ({ context, ip }) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": ip });
});

const NEUTRAL = "Questo link non funziona più";
const BLOCKED = "Troppi tentativi: riprova tra 15 minuti";

type Family = {
  w: SeededWedding;
  link: SeededLink;
  anna: string;
  luca: string;
  marta: string;
  teo: string;
};

/** Famiglia Rossi: two adults, a child and an infant, one "together" link, date and place chosen. */
async function family(): Promise<Family> {
  const w = await seedWedding({
    templateTasks: false,
    names: { a: "Tony", b: "Jessica" },
    scenarios: [{ kind: "fixed", date_from: "2027-09-03" }],
  });
  await chooseDate(w);
  await chooseLocation(w, "Villa Aurora", "Tivoli");
  const group = await addGuestGroup(w, "Famiglia Rossi");
  const anna = await addGuest(w, { firstName: "Anna", lastName: "Rossi", groupId: group });
  const luca = await addGuest(w, { firstName: "Luca", lastName: "Rossi", groupId: group });
  const marta = await addGuest(w, {
    firstName: "Marta",
    lastName: "Rossi",
    category: "child",
    groupId: group,
  });
  const teo = await addGuest(w, {
    firstName: "Teo",
    lastName: "Rossi",
    category: "infant",
    groupId: group,
  });
  return { w, link: await addRsvpLink(w, { groupId: group }), anna, luca, marta, teo };
}

/** One person on their own with a personal link (the simplest form: one card). */
async function lone(name = "Sara") {
  const w = await seedWedding({ templateTasks: false, names: { a: "Tony", b: "Jessica" } });
  const id = await addGuest(w, { firstName: name, lastName: "Bianchi" });
  return { w, id, link: await addRsvpLink(w, { guestId: id }) };
}

const card = (page: Page, id: string) => page.getByTestId(`rsvp-person-${id}`);
const yes = (page: Page, id: string) => card(page, id).getByText("Sì, ci sono");
const no = (page: Page, id: string) => card(page, id).getByText("No, non posso");
const send = (page: Page) => page.getByRole("button", { name: "Invia le risposte" });
const thanks = (page: Page) =>
  page.getByRole("heading", { name: "Grazie! Abbiamo ricevuto le risposte" });
const summary = (page: Page) => page.getByTestId("rsvp-summary");
/** The page is interactive once the "Solo se vieni" hint (shown without JavaScript) is gone. */
const hydrated = (page: Page) => expect(page.getByText("Solo se vieni")).toHaveCount(0);

const responses = async (w: SeededWedding) =>
  (await serviceClient().from("rsvp_responses").select("*").eq("wedding_id", w.weddingId)).data ??
  [];
const randomToken = () => randomBytes(32).toString("base64url");

test("the page shows only what AC3 allows: couple, date, place, the people with their type, notes (AC2, AC3, AC5)", async ({
  page,
  baseURL,
}) => {
  const f = await family();
  const origins = new Set<string>();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith("http")) origins.add(url.origin);
  });
  const response = await page.goto(f.link.path);
  expect(response?.status()).toBe(200);
  const headers = response!.headers();
  expect(headers["cache-control"]).toBe("private, no-store");
  expect(headers["referrer-policy"]).toBe("same-origin");
  await hydrated(page);

  await expect(page).toHaveTitle("Conferma la tua presenza");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tony e Jessica si sposano");
  await expect(page.getByText(/3 settembre 2027/)).toBeVisible();
  await expect(page.getByText("Villa Aurora, Tivoli")).toBeVisible();
  await expect(page.getByText("Dicci chi di voi viene.")).toBeVisible();
  // every person of the group, the infant too, each with their own card (no head of family)
  await expect(page.getByTestId(/^rsvp-person-/)).toHaveCount(4);
  for (const [id, name] of [
    [f.anna, "Anna Rossi"],
    [f.luca, "Luca Rossi"],
    [f.marta, "Marta Rossi · Bambino"],
    [f.teo, "Teo Rossi · Neonato"],
  ] as const) {
    await expect(page.getByRole("group", { name, exact: true })).toHaveCount(1);
    await expect(yes(page, id)).toBeVisible();
    await expect(no(page, id)).toBeVisible();
  }
  await expect(
    page.getByText(
      "Le risposte le vedono solo Tony e Jessica, servono per organizzare il matrimonio; per farle cancellare scrivi a loro.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Manca qualcuno o c'è un nome sbagliato? Scrivi a chi ti ha invitato."),
  ).toBeVisible();

  // no brand and nothing else of the app or of the wedding
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(/roadmap2yes/i);
  await expect(page.getByRole("navigation")).toHaveCount(0);
  expect(await page.locator('meta[name="robots"]').getAttribute("content")).toContain("noindex");

  // no request to another origin, for the load and for a submit
  await yes(page, f.anna).click();
  await send(page).click();
  await expect(thanks(page)).toBeVisible();
  expect([...origins]).toEqual([new URL(baseURL!).origin]);
});

test("'Vengono tutti', the counter, a partial submit, the summary; reopening and Modifica (AC4, AC5)", async ({
  page,
}) => {
  const f = await family();
  await page.goto(f.link.path);
  await hydrated(page);
  await expect(page.getByRole("status").filter({ hasText: "Hai scelto per 0 di 4" })).toBeVisible();
  // the preferences of a person appear only after "Sì"
  await expect(card(page, f.anna).getByText("Preferenze alimentari")).toHaveCount(0);

  await page.getByRole("button", { name: "Vengono tutti" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Hai scelto per 4 di 4" })).toBeVisible();
  await expect(page.getByText("Preferenze alimentari (facoltative)")).toHaveCount(4);

  // a partial answer: Anna yes with a preference and a note, Luca no, Marta yes, Teo left alone
  await page.reload();
  await hydrated(page);
  await yes(page, f.anna).click();
  await card(page, f.anna).getByLabel("Vegetariano").check();
  await card(page, f.anna)
    .getByLabel(/Allergie o altro/)
    .fill("Noci (dato inventato)");
  await no(page, f.luca).click();
  await yes(page, f.marta).click();
  await expect(page.getByRole("status").filter({ hasText: "Hai scelto per 3 di 4" })).toBeVisible();
  await send(page).click();

  await expect(thanks(page)).toBeVisible();
  const saved = summary(page);
  await expect(saved).toContainText("Anna Rossi: Sì, vegetariano");
  await expect(saved).toContainText("Luca Rossi: No");
  await expect(saved).toContainText("Marta Rossi: Sì");
  await expect(saved).toContainText("Teo Rossi: In attesa");
  const rows = await responses(f.w);
  expect(rows).toHaveLength(3); // the person left alone has no answer
  const anna = rows.find((r) => r.id === f.anna)!;
  expect(anna).toMatchObject({
    status: "yes",
    diet: ["vegetarian"],
    diet_note: "Noci (dato inventato)",
  });

  // reopening the link finds the answers; "Modifica" opens the form with them
  await page.goto(f.link.path);
  await hydrated(page);
  await expect(thanks(page)).toHaveCount(0);
  await expect(summary(page)).toContainText("Luca Rossi: No");
  await page.getByText("Modifica", { exact: true }).click();
  await expect(card(page, f.luca).getByRole("radio", { name: "No, non posso" })).toBeChecked();
  await expect(card(page, f.anna).getByLabel("Vegetariano")).toBeChecked();
  await page.getByRole("button", { name: "Vengono tutti" }).click();
  await send(page).click();
  await expect(thanks(page)).toBeVisible();
  await expect(summary(page)).toContainText("Luca Rossi: Sì");
  await expect(summary(page)).toContainText("Teo Rossi: Sì");
  expect((await responses(f.w)).filter((r) => r.status === "yes")).toHaveLength(4);
});

test("zero choices: a line says what is missing and nothing is saved; a 'No' clears the preferences (AC4, BR11)", async ({
  page,
}) => {
  const { w, id, link } = await lone();
  await page.goto(link.path);
  await hydrated(page);
  await expect(page.getByText("Dicci se ci sei.")).toBeVisible();
  await send(page).click();
  const error = page.getByTestId("rsvp-error");
  await expect(error).toHaveText("Scegli Sì o No per almeno una persona.");
  await expect(error).toBeFocused();
  expect(await responses(w)).toHaveLength(0);

  await yes(page, id).click();
  await card(page, id).getByLabel("Senza glutine").check();
  await send(page).click();
  await expect(thanks(page)).toBeVisible();
  expect((await responses(w))[0]).toMatchObject({ status: "yes", diet: ["gluten_free"] });

  await page.getByText("Modifica", { exact: true }).click();
  await no(page, id).click();
  await send(page).click();
  await expect(summary(page)).toContainText("Sara Bianchi: No");
  expect((await responses(w))[0]).toMatchObject({ status: "no", diet: [], diet_note: null });
});

test("at 320 px nothing scrolls sideways and the controls are at least 44 px (AC2)", async ({
  page,
}) => {
  const f = await family();
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(f.link.path);
  await hydrated(page);
  await page.getByRole("button", { name: "Vengono tutti" }).click();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const label = (text: string) => card(page, f.anna).locator("label").filter({ hasText: text });
  for (const control of [label("Sì, ci sono"), label("No, non posso"), send(page)]) {
    const box = (await control.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});

test("two tabs: the one that saves second says whose answers had already changed (AC11)", async ({
  page,
  context,
}) => {
  const { w, id, link } = await lone();
  await page.goto(link.path);
  await hydrated(page);
  const other = await context.newPage();
  await other.goto(link.path);
  await hydrated(other);
  await yes(other, id).click();
  await send(other).click();
  await expect(thanks(other)).toBeVisible();

  // this tab still shows "In attesa" for Sara: its answer wins, and it is told
  await no(page, id).click();
  await send(page).click();
  await expect(thanks(page)).toBeVisible();
  await expect(page.getByTestId("rsvp-changed")).toHaveText(
    "Le risposte di Sara Bianchi erano già cambiate: ecco quelle salvate.",
  );
  expect((await responses(w))[0]).toMatchObject({ status: "no" });
});

test("a link revoked while the form is open: the whole page becomes the neutral view (AC6, AC11)", async ({
  page,
}) => {
  const { w, id, link } = await lone();
  await page.goto(link.path);
  await hydrated(page);
  await yes(page, id).click();
  await revokeRsvpLink(w, link.linkId);
  await send(page).click();
  const neutral = page.getByTestId("rsvp-unavailable");
  await expect(neutral).toContainText(NEUTRAL);
  await expect(neutral).toContainText("Se pensi sia un errore, scrivi a chi ti ha invitato.");
  // nothing of the form, the names or the wedding is left, and nothing was saved
  await expect(page.getByRole("button", { name: "Invia le risposte" })).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toMatch(/Sara|Tony|Jessica/);
  expect(await responses(w)).toHaveLength(0);
});

test("offline: the choices stay, an alert says so, and the same submit works once back online (AC11)", async ({
  page,
  context,
}) => {
  const { w, id, link } = await lone();
  await page.goto(link.path);
  await hydrated(page);
  await yes(page, id).click();
  await card(page, id).getByLabel("Vegano").check();
  await context.setOffline(true);
  await send(page).click();
  await expect(page.getByTestId("rsvp-error")).toHaveText(
    "Non sono riuscito a salvare. Controlla la connessione e riprova.",
  );
  await expect(card(page, id).getByRole("radio", { name: "Sì, ci sono" })).toBeChecked();
  await expect(card(page, id).getByLabel("Vegano")).toBeChecked();
  expect(await responses(w)).toHaveLength(0);

  await context.setOffline(false);
  await send(page).click();
  await expect(thanks(page)).toBeVisible();
  expect((await responses(w))[0]).toMatchObject({ status: "yes", diet: ["vegan"] });
});

test("a link that does not work is the same neutral 404 for every cause (AC6, AC10)", async ({
  page,
  ip,
}) => {
  const { w, link } = await lone();
  const revoked = await addRsvpLink(w, {
    guestId: await addGuest(w, { firstName: "Mario", lastName: "Verdi" }),
  });
  await revokeRsvpLink(w, revoked.linkId);
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": ip });

  const bodies: string[] = [];
  for (const path of [`/rsvp/${randomToken()}`, revoked.path, "/rsvp/abc"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
    const headers = response!.headers();
    expect(headers["cache-control"]).toBe("private, no-store");
    expect(headers["x-robots-tag"]).toBe("noindex, nofollow");
    expect(headers["referrer-policy"]).toBe("no-referrer");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(NEUTRAL);
    await expect(
      page.getByText("Se pensi sia un errore, scrivi a chi ti ha invitato."),
    ).toBeVisible();
    bodies.push(await response!.text());
  }
  expect(new Set(bodies).size).toBe(1);
  expect(bodies[0]).not.toMatch(/<script|Tony|Jessica|data-theme/);
  // the working link of the same wedding still opens
  expect((await page.goto(link.path))?.status()).toBe(200);
});

test("over the IP limit the page is a 429 with Retry-After; over the link limit the form says the same (AC10)", async ({
  page,
  baseURL,
}) => {
  const ip = uniqueIp();
  await blockRsvpIp(baseURL!, ip);
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": ip });
  const response = await page.goto(`/rsvp/${randomToken()}`);
  expect(response?.status()).toBe(429);
  const wait = Number(response!.headers()["retry-after"]);
  expect(wait).toBeGreaterThan(0);
  expect(wait).toBeLessThanOrEqual(900);
  expect(response!.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  await expect(page.getByText(BLOCKED)).toBeVisible();

  // 20 submits on one link in 15 minutes, then the page of that link answers inside the form
  const { id, link } = await lone("Elisa");
  for (let n = 0; n < 20; n += 1) await submitRsvp(link, [{ id, status: n % 2 ? "no" : "yes" }]);
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": uniqueIp() });
  await page.goto(link.path);
  await hydrated(page);
  await page.getByText("Modifica", { exact: true }).click(); // it has answers by now
  await yes(page, id).click();
  await send(page).click();
  await expect(page.getByTestId("rsvp-error")).toHaveText(BLOCKED);
  await expect(card(page, id).getByRole("radio", { name: "Sì, ci sono" })).toBeChecked();
});

test("a signed-in partner sees the page of the wedding the link belongs to (QA-14)", async ({
  page,
}) => {
  const { w, link } = await lone();
  await serviceClient().from("weddings").update({ theme_id: "velluto" }).eq("id", w.weddingId);
  const mine = await seedWedding({ templateTasks: false });
  await serviceClient().from("weddings").update({ theme_id: "toscana" }).eq("id", mine.weddingId);
  await loginAs(page, mine.wedding.founder, uniqueIp());
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "toscana");
  await page.goto(link.path);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "velluto");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tony e Jessica si sposano");
});

test("the server output never carries the token (AC10, plan T11)", async ({ page }) => {
  const log = process.env["E2E_SERVER_LOG"];
  test.skip(
    !log || !existsSync(log),
    "the server was not started by Playwright: no output to read",
  );
  const { w, id, link } = await lone();
  await page.goto(link.path);
  await hydrated(page);
  await yes(page, id).click();
  await send(page).click();
  await expect(thanks(page)).toBeVisible();
  await revokeRsvpLink(w, link.linkId);
  await page.goto(link.path); // the dead open is the other path that touches the token
  const read = () => readFileSync(log!, "utf8");
  // the capture works (the server printed its start-up line) and the token is nowhere in it
  await expect.poll(() => read().length).toBeGreaterThan(0);
  expect(read()).not.toContain(link.token);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the form submits for real: zero choices, then answers with preferences, then Modifica in a <details> (AC2, AC4)", async ({
    page,
  }) => {
    const f = await family();
    await page.goto(f.link.path);
    // no script: the preferences are always there, labelled, and there is no "Vengono tutti"
    await expect(page.getByText("Solo se vieni").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Vengono tutti" })).toHaveCount(0);

    // zero choices: the server answers with the line that says what is missing
    await send(page).click();
    await expect(page.getByTestId("rsvp-error")).toHaveText(
      "Scegli Sì o No per almeno una persona.",
    );
    expect(await responses(f.w)).toHaveLength(0);

    await yes(page, f.anna).click();
    await card(page, f.anna).getByLabel("Senza lattosio").check();
    await card(page, f.anna)
      .getByLabel(/Allergie o altro/)
      .fill("Arachidi (dato inventato)");
    await no(page, f.luca).click();
    await send(page).click();

    await expect(thanks(page)).toBeVisible();
    await expect(summary(page)).toContainText("Anna Rossi: Sì, senza lattosio");
    await expect(summary(page)).toContainText("Luca Rossi: No");
    await expect(summary(page)).toContainText("Marta Rossi: In attesa");
    const rows = await responses(f.w);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === f.anna)).toMatchObject({
      status: "yes",
      diet: ["lactose_free"],
      diet_note: "Arachidi (dato inventato)",
    });

    // "Modifica" is the summary of a native <details>: it opens without script
    const form = page.locator("details");
    await expect(form).not.toHaveAttribute("open", "");
    await page.getByText("Modifica", { exact: true }).click();
    await expect(form).toHaveAttribute("open", "");
    await yes(page, f.marta).click();
    await send(page).click();
    await expect(summary(page)).toContainText("Marta Rossi: Sì");
    expect((await responses(f.w)).filter((r) => r.status === "yes")).toHaveLength(2);
  });

  test("a dead link and a submit on a link revoked meanwhile show the neutral text (AC6)", async ({
    page,
    ip,
  }) => {
    await page.context().setExtraHTTPHeaders({ "x-forwarded-for": ip });
    const dead = await page.goto(`/rsvp/${randomToken()}`);
    expect(dead?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(NEUTRAL);
    expect(await dead!.text()).not.toContain("<script");

    const { w, id, link } = await lone();
    await page.goto(link.path);
    await yes(page, id).click();
    await revokeRsvpLink(w, link.linkId);
    await send(page).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(NEUTRAL);
    await expect(
      page.getByText("Se pensi sia un errore, scrivi a chi ti ha invitato."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Invia le risposte" })).toHaveCount(0);
    expect(await responses(w)).toHaveLength(0);
  });
});
