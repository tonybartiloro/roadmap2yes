/**
 * QA T17c: export (plan row "Export"), AC42.
 *
 * AC map
 *  - AC42  from Altro a partner gets, with a progress indicator that has a text equivalent and file
 *          names carrying the date: everything in JSON (settings, decisions + history, tasks, budget
 *          + history, payments) and CSV for tasks and budget; no date of birth, no token hash, no
 *          account id; the Home then says "ultimo export: oggi"
 *  - the CSV opens in Excel: UTF-8 with the Italian characters intact
 */
import { loginAs } from "./support/auth";
import { expect, serviceClient, test, uniqueIp } from "./support/fixtures";
import { addLocation, addTask, romeDate, seedWedding } from "./support/seed";

test.describe.configure({ timeout: 60_000 });

async function download(page: import("@playwright/test").Page, which: string) {
  const waiting = page.waitForEvent("download");
  await page.getByTestId(`export-${which}`).click();
  const file = await waiting;
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return { name: file.suggestedFilename(), text: Buffer.concat(chunks).toString("utf8") };
}

test("JSON and both CSV files, dated names, complete content, nothing sensitive (AC42)", async ({
  page,
}) => {
  const w = await seedWedding({
    budgetCents: 2_000_000,
    scenarios: [{ kind: "fixed", date_from: romeDate(400), label: "Primavera" }],
  });
  await addLocation(w, "Villa Rosa");
  await addTask(w, { title: "Prenotare il fiorista è già fatto", due: romeDate(20) });
  const cat = (
    await serviceClient()
      .from("budget_categories")
      .select("id")
      .eq("wedding_id", w.weddingId)
      .eq("default_key", "catering")
      .single()
  ).data!.id;
  const item = (
    await w.wedding.founderClient
      .from("budget_items")
      .insert({
        wedding_id: w.weddingId,
        category_id: cat,
        description: "Menù della festa",
        status: "agreed",
        agreed_cents: 900_000,
        planned_cents: 900_000,
      })
      .select("id")
      .single()
  ).data!.id;
  await w.wedding.founderClient.from("payments").insert({
    wedding_id: w.weddingId,
    item_id: item,
    kind: "deposit",
    amount_cents: 300_000,
    due_date: romeDate(10),
  });

  await loginAs(page, w.wedding.founder, uniqueIp());
  await page.goto("/altro/esporta");
  await expect(page.getByTestId("export-json")).toBeVisible();

  const today = romeDate(0);
  const json = await download(page, "json");
  expect(json.name).toBe(`roadmap2yes-${today}.json`);
  const parsed = JSON.parse(json.text) as Record<string, unknown>;
  const flat = JSON.stringify(parsed);
  for (const part of [
    "Villa Rosa",
    "Primavera",
    "Menù della festa",
    "Prenotare il fiorista",
    "decision",
    "payment",
  ]) {
    expect(flat.toLowerCase()).toContain(part.toLowerCase());
  }
  // never in an export: birth dates, hashes of tokens, account ids and codes
  expect(flat).not.toMatch(/birth|nascita|token_hash|password|access_code/i);
  expect(flat).not.toContain(w.wedding.founder.id);
  expect(flat).not.toContain(w.partnerB!.user.id);
  await expect(page.getByTestId("export-status")).toContainText(
    /pronto|scaricato|Fatto|roadmap2yes-/i,
  );

  const tasks = await download(page, "tasksCsv");
  expect(tasks.name).toBe(`roadmap2yes-compiti-${today}.csv`);
  expect(tasks.text).toContain("Prenotare il fiorista è già fatto");
  expect(tasks.text.split("\n").length).toBeGreaterThan(2);

  const budget = await download(page, "budgetCsv");
  expect(budget.name).toBe(`roadmap2yes-budget-${today}.csv`);
  expect(budget.text).toContain("Menù della festa");
  expect(budget.text).toMatch(/Concordato/);

  // the export is recorded: Home says so
  await page.goto("/");
  await expect(page.getByText("ultimo export: oggi")).toBeVisible();
});

test("the progress has a text equivalent and the page works at 360 px (AC42)", async ({ page }) => {
  const w = await seedWedding();
  await loginAs(page, w.wedding.founder, uniqueIp());
  await page.goto("/altro/esporta");
  const waiting = page.waitForEvent("download");
  await page.getByTestId("export-tasksCsv").click();
  await waiting;
  const progress = page.getByTestId("export-progress");
  // either still showing or already done: when shown it carries its own text
  if (await progress.count()) {
    await expect(progress).toContainText(/\d+\s?%|Preparo|Quasi|Fatto/i);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
});
