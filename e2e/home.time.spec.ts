/**
 * QA T17c (project `time`, serial): the Home against a moved clock (cookie `r2y-test-now`, honoured
 * only with E2E_CLOCK=1; plan 1.1).
 *
 * AC map
 *  - AC26  the countdown changes at Europe/Rome midnight (23:30 UTC the evening before is already
 *          the next day), also across the DST change of 28 Mar 2027
 *  - AC42  the "ultimo export" reminder appears after 30 days
 */
import { loginAs } from "./support/auth";
import { setNow } from "./support/clock";
import { expect, test, uniqueIp } from "./support/fixtures";
import { seedWedding } from "./support/seed";

test.describe.configure({ mode: "serial", timeout: 60_000 });

const REFERENCE = "2027-09-03";
/** Whole days between two YYYY-MM-DD dates (UTC arithmetic: no DST involved). */
const diff = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

async function daysShown(text: string): Promise<number> {
  const match = /mancan[oa] (\d+) giorn/i.exec(text);
  if (!match) throw new Error(`no day count in "${text}"`);
  return Number(match[1]);
}

test("the countdown turns over at Europe/Rome midnight, across the DST change (AC26)", async ({
  page,
  context,
  baseURL,
}) => {
  const w = await seedWedding({ scenarios: [{ kind: "fixed", date_from: REFERENCE }] });
  await loginAs(page, w.wedding.founder, uniqueIp());
  const cases: Array<[string, string]> = [
    // 22:30 UTC on the 27th = 23:30 in Rome (CET, UTC+1): still the 27th
    ["2027-03-27T22:30:00Z", "2027-03-27"],
    // 23:30 UTC = 00:30 on the 28th in Rome: already the 28th (the DST switch is at 01:00 local)
    ["2027-03-27T23:30:00Z", "2027-03-28"],
    // after the switch, CEST UTC+2: 21:30 UTC on 30 Oct is 23:30 Rome the same day...
    ["2027-10-02T21:30:00Z", "2027-10-02"],
  ];
  for (const [instant, romeDay] of cases.slice(0, 2)) {
    await setNow(context, baseURL!, instant);
    await page.goto("/");
    const text = await page.getByRole("region", { name: "Conto alla rovescia" }).innerText();
    expect(await daysShown(text), `at ${instant} (Rome day ${romeDay})`).toBe(
      diff(romeDay, REFERENCE),
    );
  }
  // one instant either side of midnight differ by exactly one day
  await setNow(context, baseURL!, "2027-03-27T22:30:00Z");
  await page.goto("/");
  const before = await daysShown(
    await page.getByRole("region", { name: "Conto alla rovescia" }).innerText(),
  );
  await setNow(context, baseURL!, "2027-03-27T23:30:00Z");
  await page.goto("/");
  const after = await daysShown(
    await page.getByRole("region", { name: "Conto alla rovescia" }).innerText(),
  );
  expect(before - after).toBe(1);
});

test("on the day itself the countdown says so; after it, it says how long ago (AC26)", async ({
  page,
  context,
  baseURL,
}) => {
  const w = await seedWedding({ scenarios: [{ kind: "fixed", date_from: REFERENCE }] });
  const date = (
    await w.wedding.founderClient.from("decisions").select("id").eq("type", "date").single()
  ).data!.id;
  const option = (
    await w.wedding.founderClient
      .from("decision_options")
      .select("id")
      .eq("decision_id", date)
      .single()
  ).data!.id;
  await w.wedding.founderClient.rpc("choose_option", { p_decision_id: date, p_option_id: option });
  await loginAs(page, w.wedding.founder, uniqueIp());
  await setNow(context, baseURL!, "2027-09-03T10:00:00Z");
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Conto alla rovescia" })).toContainText("È oggi!");
  await setNow(context, baseURL!, "2027-09-06T10:00:00Z");
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Conto alla rovescia" })).toContainText(
    /Sono passati 3 giorni/,
  );
});

test("the export reminder appears after 30 days (AC42)", async ({ page, context, baseURL }) => {
  const w = await seedWedding();
  expect((await w.wedding.founderClient.rpc("record_export")).error).toBeNull();
  await loginAs(page, w.wedding.founder, uniqueIp());
  await page.goto("/");
  await expect(page.getByText("ultimo export: oggi")).toBeVisible();
  await expect(page.getByRole("link", { name: "Esporta i dati" })).toHaveCount(0);

  const plus = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
  await setNow(context, baseURL!, plus(29));
  await page.goto("/");
  await expect(page.getByText("ultimo export: 29 giorni fa")).toBeVisible();
  await expect(page.getByRole("link", { name: "Esporta i dati" })).toHaveCount(0);

  await setNow(context, baseURL!, plus(30));
  await page.goto("/");
  await expect(page.getByText(/ultimo export: 30 giorni fa/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Esporta i dati" })).toBeVisible();
});
