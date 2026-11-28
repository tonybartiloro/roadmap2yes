/**
 * QA T11 (FEAT-2026-004, project `time`, serial): the expiry of the RSVP links against a moved clock
 * (cookie `r2y-test-now`, honoured only with E2E_CLOCK=1 and never on Vercel). The link works until
 * the end of the Europe/Rome day of "chosen date + 30 days" and not after (BR7); moving the date
 * wakes the links up again (BR4).
 *
 * AC map
 *  - AC12  expired = the neutral 404 (and, on a submit, the neutral view); the sheet says "Scade il"
 *          then "Scaduto il ... Se sposti la data, i link tornano a funzionare da soli." with no
 *          creation or rotation; "Crea link per tutti" is off with its reason; a moved date revives
 *  - AC6   an expired link looks like any dead link
 */
import type { Page } from "@playwright/test";
import { loginAs } from "./support/auth";
import { setNow } from "./support/clock";
import { expect, test, uniqueIp } from "./support/fixtures";
import {
  addGuest,
  addRsvpLink,
  chooseDate,
  moveDate,
  seedWedding,
  type SeededWedding,
} from "./support/seed";

test.describe.configure({ mode: "serial", timeout: 90_000 });

// A dead link counts against the caller's address and `next start` gives every local request the
// same one unless `x-forwarded-for` says otherwise (BR9): each test gets its own fake address.
test.beforeEach(async ({ context, ip }) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": ip });
});

/** Date 3 Sep 2027 + 30 days = 3 Oct 2027, the last working day. Rome is on CEST (UTC+2) then. */
const DATE = "2027-09-03";
const LATER = "2027-12-01";
const LAST_DAY_EVENING = "2027-10-03T21:30:00Z"; // 23:30 in Rome on 3 October: still works
const NEXT_DAY_AFTER_MIDNIGHT = "2027-10-03T22:30:00Z"; // 00:30 in Rome on 4 October: expired

const seed = (): Promise<SeededWedding> =>
  seedWedding({
    templateTasks: false,
    names: { a: "Tony", b: "Jessica" },
    scenarios: [
      { kind: "fixed", date_from: DATE, label: "Settembre" },
      { kind: "fixed", date_from: LATER, label: "Dicembre" },
    ],
  });
const send = (page: Page) => page.getByRole("button", { name: "Invia le risposte" });

test("the link works until the end of the Rome day of date + 30 and is neutral after; a moved date revives it (AC6, AC12)", async ({
  page,
  context,
  baseURL,
}) => {
  const w = await seed();
  await chooseDate(w, DATE);
  const sara = await addGuest(w, { firstName: "Sara", lastName: "Bianchi" });
  const link = await addRsvpLink(w, { guestId: sara });

  await setNow(context, baseURL!, LAST_DAY_EVENING);
  const open = await page.goto(link.path);
  expect(open?.status()).toBe(200);
  await expect(page.getByTestId(`rsvp-person-${sara}`)).toBeVisible();
  await expect(page.getByText(/3 settembre 2027/)).toBeVisible();

  // midnight in Rome passes while the form is open: the submit gets the neutral view
  await expect(page.getByText("Solo se vieni")).toHaveCount(0);
  await page.getByTestId(`rsvp-person-${sara}`).getByText("Sì, ci sono").click();
  await setNow(context, baseURL!, NEXT_DAY_AFTER_MIDNIGHT);
  await send(page).click();
  await expect(page.getByTestId("rsvp-unavailable")).toContainText("Questo link non funziona più");

  // opening it now: the same neutral 404 as any dead link
  const expired = await page.goto(link.path);
  expect(expired?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Questo link non funziona più");

  // the couple moves the date: the same link works again, with no new link and nothing resent
  await moveDate(w, LATER);
  const revived = await page.goto(link.path);
  expect(revived?.status()).toBe(200);
  await expect(page.getByTestId(`rsvp-person-${sara}`)).toBeVisible();
  await expect(page.getByText(/1 dicembre 2027/)).toBeVisible();
});

test("couple side: 'Scade il', then 'Scaduto il' with no creation or rotation; moving the date revives the state (AC12)", async ({
  page,
  context,
  baseURL,
}) => {
  const w = await seed();
  await chooseDate(w, DATE);
  const sara = await addGuest(w, { firstName: "Sara", lastName: "Bianchi" });
  await addGuest(w, { firstName: "Mario", lastName: "Verdi" }); // no link yet
  const link = await addRsvpLink(w, { guestId: sara });
  await loginAs(page, w.wedding.founder, uniqueIp());

  await setNow(context, baseURL!, "2027-10-03T10:00:00Z");
  await page.goto("/invitati");
  await page.getByRole("button", { name: "Invia il link di Sara Bianchi" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText(/Da condividere\. Scade il 3 ottobre 2027\./)).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Nuovo link" })).toBeVisible();
  await page.keyboard.press("Escape");

  await setNow(context, baseURL!, "2027-10-04T10:00:00Z");
  await page.goto("/invitati");
  await expect(page.getByTestId("guest-row").filter({ hasText: "Sara Bianchi" })).toContainText(
    "Scaduto il 3 ottobre 2027",
  );
  await page.getByRole("button", { name: "Invia il link di Sara Bianchi" }).click();
  await expect(
    sheet.getByText(
      "Scaduto il 3 ottobre 2027. Se sposti la data, i link tornano a funzionare da soli.",
    ),
  ).toBeVisible();
  for (const name of [
    "Crea link",
    "Crea un nuovo link",
    "Nuovo link",
    "Revoca link",
    "Copia link",
  ]) {
    await expect(sheet.getByRole("button", { name, exact: true })).toHaveCount(0);
  }
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Altro", exact: true }).click();
  await expect(sheet.getByRole("button", { name: /^Crea link per tutti/ })).toBeDisabled();
  await expect(
    sheet.getByText("I link sono scaduti: sposta la data per riattivarli."),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  // the date moves: the list says the link works again (still "Da condividere"), the link opens
  await moveDate(w, LATER);
  await page.goto("/invitati");
  const row = page.getByTestId("guest-row").filter({ hasText: "Sara Bianchi" });
  await expect(row).toContainText("Da condividere");
  await expect(row).not.toContainText("Scaduto");
  expect((await page.request.get(link.path)).status()).toBe(200);
});
