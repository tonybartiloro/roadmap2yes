/**
 * QA T17b: the scenario preview of the Percorso (plan row "Anteprima").
 *
 * AC map
 *  - AC32  a fixed, non dismissible banner "Anteprima: <data> — nulla è salvato" with "Esci" and
 *          "Imposta come riferimento"; recalculated due dates with a distinct style and the number
 *          of changed deadlines; free switching between scenarios; NOTHING is written and the
 *          reference does not change; a period says "calcolata dal primo giorno"; the state is the
 *          URL (`?anteprima=`) and survives a reload; a vanished scenario closes the preview with
 *          a notice
 *  - AC24  "Imposta come riferimento" from the preview applies the reference (provisional, set by
 *          the person) and recalculates (AC28)
 *  - AC60  a location linked to the previewed date is shown in the banner and in the picker
 */
import { loginAs } from "./support/auth";
import { expect, serviceClient, test, uniqueIp } from "./support/fixtures";
import { addLocation, decisionId, romeDate, seedWedding, type SeededWedding } from "./support/seed";

test.describe.configure({ timeout: 60_000 });

async function seedTwoScenarios() {
  const near = romeDate(400);
  const far = romeDate(800);
  const w = await seedWedding({
    scenarios: [
      { kind: "fixed", date_from: near, label: "Primavera" },
      { kind: "fixed", date_from: far, label: "Autunno" },
      {
        kind: "period",
        date_from: romeDate(1000).slice(0, 8) + "01",
        date_to: romeDate(1060),
        label: "Periodo lungo",
      },
    ],
  });
  const date = await decisionId(w, "date");
  const options = await w.wedding.founderClient
    .from("decision_options")
    .select("id,title")
    .eq("decision_id", date);
  const id = (title: string) => options.data!.find((o) => o.title === title)!.id;
  return {
    w,
    near,
    far,
    ids: { near: id("Primavera"), far: id("Autunno"), period: id("Periodo lungo") },
  };
}

async function appliedReference(w: SeededWedding): Promise<string | null> {
  const row = await serviceClient()
    .from("weddings")
    .select("applied_reference_date")
    .eq("id", w.weddingId)
    .single();
  return row.data?.applied_reference_date ?? null;
}

async function dueDates(w: SeededWedding): Promise<string> {
  const rows = await serviceClient()
    .from("tasks")
    .select("id,due_date")
    .eq("wedding_id", w.weddingId)
    .order("id");
  return JSON.stringify(rows.data);
}

test.describe("preview (AC32)", () => {
  test("banner, changed count, reload, no write, reference untouched", async ({ page }) => {
    const { w, near, ids } = await seedTwoScenarios();
    await loginAs(page, w.wedding.founder, uniqueIp());
    const before = await dueDates(w);
    expect(await appliedReference(w)).toBe(near);

    const posts: string[] = [];
    page.on("request", (request) => {
      if (request.method() !== "GET" && request.method() !== "HEAD") posts.push(request.url());
    });
    await page.goto(`/percorso?anteprima=${ids.far}`);
    const banner = page.getByTestId("preview-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("nulla è salvato");
    await expect(banner).toContainText("Anteprima:");
    await expect(page.getByTestId("preview-changed")).toContainText(/scadenz[ae] cambi/);
    // recalculated rows are marked: "Anteprima:" + old date struck through → new date
    await expect(
      page.getByTestId("task-row").filter({ hasText: "Anteprima:" }).first(),
    ).toBeAttached();
    expect(
      await page.getByTestId("task-row").filter({ hasText: "Anteprima:" }).count(),
    ).toBeGreaterThan(0);
    // not dismissible: only "Esci", "Imposta come riferimento", "Scegli questa data" (or its menu)
    await expect(banner.getByRole("button", { name: /chiudi|dismiss|×/i })).toHaveCount(0);
    await expect(page.getByTestId("preview-exit")).toBeVisible();
    await expect(page.getByTestId("preview-set-reference")).toBeVisible();

    // the state is the URL: a reload keeps the preview
    await page.reload();
    await expect(page.getByTestId("preview-banner")).toBeVisible();

    // free switching between scenarios (picker)
    await page.getByTestId("scenario-picker-trigger").click();
    await page.getByTestId(`scenario-option-${ids.near}`).click(); // the reference: back to the normal view
    await expect(page.getByTestId("preview-banner")).toHaveCount(0);
    await page.getByTestId("scenario-picker-trigger").click();
    await page.getByTestId(`scenario-option-${ids.far}`).click();
    await expect(page.getByTestId("preview-banner")).toBeVisible();
    await page.getByTestId("scenario-picker-trigger").click();
    await page.getByTestId(`scenario-option-${ids.period}`).click();
    await expect(page.getByTestId("preview-banner")).toContainText("Anteprima:");

    // nothing was written: no mutating request, reference and due dates unchanged
    expect(posts).toEqual([]);
    expect(await appliedReference(w)).toBe(near);
    expect(await dueDates(w)).toBe(before);

    // "Esci" goes back to the normal view
    await page.getByTestId("preview-exit").click();
    await expect(page).toHaveURL(/\/percorso$/);
    await expect(page.getByTestId("preview-banner")).toHaveCount(0);
  });

  test("a period preview says it is calculated from the first day", async ({ page }) => {
    const { w, ids } = await seedTwoScenarios();
    await loginAs(page, w.wedding.founder, uniqueIp());
    await page.goto(`/percorso?anteprima=${ids.period}`);
    await expect(page.getByTestId("preview-banner")).toBeVisible();
    // the reference line / banner / confirmation spell out "primo giorno"
    await page.getByTestId("preview-set-reference").click();
    await expect(page.getByTestId("reference-confirm")).toContainText("primo giorno del periodo");
  });

  test("no banner when the previewed scenario is already the reference", async ({ page }) => {
    const { w, ids } = await seedTwoScenarios();
    await loginAs(page, w.wedding.founder, uniqueIp());
    await page.goto(`/percorso?anteprima=${ids.near}`);
    await expect(page.getByTestId("preview-banner")).toHaveCount(0);
    await expect(page.getByTestId("reference-status")).toContainText("provvisorio");
  });

  test("a scenario that disappears closes the preview with a notice", async ({ page }) => {
    const { w, ids } = await seedTwoScenarios();
    await loginAs(page, w.wedding.founder, uniqueIp());
    await page.goto(`/percorso?anteprima=${ids.far}`);
    await expect(page.getByTestId("preview-banner")).toBeVisible();
    const gone = await serviceClient()
      .from("decision_options")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", ids.far);
    expect(gone.error).toBeNull();
    await page.reload();
    await expect(page.getByTestId("preview-banner")).toHaveCount(0);
    await expect(page.getByTestId("preview-closed")).toContainText("l'anteprima si è chiusa");
  });

  test("a linked location is shown in the picker and in the banner (AC60)", async ({ page }) => {
    const { w, ids } = await seedTwoScenarios();
    const location = await addLocation(w, "Villa Rosa");
    const link = await serviceClient()
      .from("date_scenarios")
      .update({ location_option_id: location })
      .eq("option_id", ids.far);
    expect(link.error).toBeNull();
    await loginAs(page, w.wedding.founder, uniqueIp());
    await page.goto(`/percorso?anteprima=${ids.far}`);
    await expect(page.getByTestId("preview-banner")).toContainText("Villa Rosa");
    await page.getByTestId("scenario-picker-trigger").click();
    await expect(
      page.getByTestId(`scenario-option-${ids.far}`).locator("xpath=ancestor::div[1]"),
    ).toContainText("Villa Rosa");
  });
});

test.describe("set as reference from the preview (AC24, AC28)", () => {
  test("confirm sheet with the consequence, then the reference is manual and the due dates follow", async ({
    page,
  }) => {
    const { w, near, far, ids } = await seedTwoScenarios();
    await loginAs(page, w.wedding.founder, uniqueIp());
    await page.goto(`/percorso?anteprima=${ids.far}`);
    await page.getByTestId("preview-set-reference").click();
    const sheet = page.getByTestId("reference-confirm");
    await expect(sheet).toContainText("Le scadenze dei compiti si ricalcolano sul");
    await expect(sheet).toContainText("restano come sono");

    // cancel first: nothing changes
    await sheet.getByRole("button", { name: "Annulla" }).click();
    expect(await appliedReference(w)).toBe(near);

    await page.getByTestId("preview-set-reference").click();
    await page.getByTestId("reference-confirm-ok").click();
    await expect(page.getByTestId("preview-banner")).toHaveCount(0);
    await expect(page.getByTestId("reference-status")).toContainText("provvisorio");
    await expect(page.getByTestId("reference-status")).toContainText("Tony");
    expect(await appliedReference(w)).toBe(far);
    // the decision is still open: it is a provisional reference, not a choice (AC24)
    const decision = await serviceClient()
      .from("decisions")
      .select("status")
      .eq("wedding_id", w.weddingId)
      .eq("type", "date")
      .single();
    expect(decision.data?.status).toBe("open");
  });
});
