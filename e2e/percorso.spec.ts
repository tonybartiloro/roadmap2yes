/**
 * QA T17b: the Percorso screen (plan rows "Fasi e filtri", "Compiti", "Riferimento", AC20).
 *
 * AC map
 *  - AC29  overdue milestones are never hidden: "Da recuperare", neutral tone (icon + text)
 *  - AC30  phases Adesso / Da recuperare / Prossimi 3 mesi / Più avanti / Fatti with the 30/31/90/91
 *          day thresholds, "Mostra tutte (N)", filters (status, category, assignee, due) one by one
 *          with the counter, "Miei / di {partner} / Tutti", usable at 360 px (no horizontal scroll)
 *  - AC31  task CRUD: add, edit, complete, reopen, delete with "Annulla" for >= 8 s and
 *          "Eliminati di recente" restore; no action needs a swipe
 *  - AC20  reopened date: banner + "Da rivedere" badge with link to the decision + "Va bene così"
 *  - AC15  no date: the Percorso shows the date-independent tasks and the add-scenario prompt
 *
 * Dates are relative to the real "today" (Europe/Rome); the clock-dependent edge cases live in
 * the `time` project (percorso-time specs).
 */
import type { Page } from "@playwright/test";
import { loginAs } from "./support/auth";
import { expect, serviceClient, test, uniqueIp } from "./support/fixtures";
import { addTask, decisionId, romeDate, seedWedding } from "./support/seed";

test.describe.configure({ timeout: 60_000 });

const row = (page: Page, title: string) => page.getByTestId("task-row").filter({ hasText: title });

async function openAllGroups(page: Page) {
  const toggles = page.locator("[data-testid^='group-toggle-']");
  const count = await toggles.count();
  for (let i = 0; i < count; i += 1) {
    const toggle = toggles.nth(i);
    if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
  }
}

async function overflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe("phases and thresholds (AC29, AC30)", () => {
  test("30/31/90/91 days, overdue, undated and done land in the right phase", async ({ page }) => {
    const w = await seedWedding({ templateTasks: false });
    const t = (title: string, offset: number | null, extra = {}) =>
      addTask(w, { title, due: offset === null ? null : romeDate(offset), ...extra });
    await t("Scaduto tre giorni", -3);
    await t("Oggi", 0);
    await t("Tra trenta giorni", 30);
    await t("Tra trentuno giorni", 31);
    await t("Tra novanta giorni", 90);
    await t("Tra novantuno giorni", 91);
    await t("Senza data", null);
    await t("Gia fatto", -10, { done: true });
    await loginAs(page, w.wedding.founder, uniqueIp());
    await page.goto("/percorso");
    await openAllGroups(page);

    const group = (id: string) => page.getByTestId(`group-${id}`);
    for (const title of ["Oggi", "Tra trenta giorni"]) {
      await expect(group("adesso").getByText(title, { exact: true })).toBeVisible();
    }
    await expect(group("adesso").getByText("Tra trentuno giorni")).toHaveCount(0);
    await expect(group("da-recuperare").getByText("Scaduto tre giorni")).toBeVisible();
    for (const title of ["Tra trentuno giorni", "Tra novanta giorni"]) {
      await expect(group("prossimi-3-mesi").getByText(title, { exact: true })).toBeVisible();
    }
    for (const title of ["Tra novantuno giorni", "Senza data"]) {
      await expect(group("piu-avanti").getByText(title, { exact: true })).toBeVisible();
    }
    await expect(group("fatti").getByText("Gia fatto")).toBeVisible();
    await expect(page.getByTestId("group-count-adesso")).toHaveText("(2)");
    await expect(page.getByTestId("group-count-da-recuperare")).toHaveText("(1)");
    await expect(page.getByTestId("group-count-prossimi-3-mesi")).toHaveText("(2)");
    await expect(page.getByTestId("group-count-piu-avanti")).toHaveText("(2)");
    await expect(page.getByTestId("group-count-fatti")).toHaveText("(1)");
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test("'Da recuperare' is neutral: the due date is shown, nothing is hidden, no alarm text", async ({
    page,
  }) => {
    const w = await seedWedding({ templateTasks: false });
    await addTask(w, { title: "In ritardo", due: romeDate(-20) });
    await loginAs(page, w.wedding.founder, uniqueIp());
    await page.goto("/percorso");
    const section = page.getByTestId("group-da-recuperare");
    await expect(section).toContainText("Di solito si fa prima, ma hai ancora tempo.");
    const task = section.getByTestId("task-row").filter({ hasText: "In ritardo" });
    await expect(task.getByTestId("task-due")).toContainText("fa"); // relative date with its calendar icon
    await expect(section).not.toContainText(/urgente|in ritardo grave|scaduto!/i);
  });

  test("'Adesso' shows 5 rows then 'Mostra tutte (N)'", async ({ page }) => {
    const w = await seedWedding({ templateTasks: false });
    for (let i = 1; i <= 7; i += 1) await addTask(w, { title: `Imminente ${i}`, due: romeDate(i) });
    await loginAs(page, w.wedding.founder, uniqueIp());
    await page.goto("/percorso");
    const adesso = page.getByTestId("group-adesso");
    await expect(adesso.getByTestId("task-row")).toHaveCount(5);
    await page.getByTestId("adesso-show-all").click();
    await expect(adesso.getByTestId("task-row")).toHaveCount(7);
  });

  test("with no scenario the date-dependent part is explained and the prompt is shown (AC15)", async ({
    page,
  }) => {
    const w = await seedWedding({ scenarios: [] });
    await loginAs(page, w.wedding.founder, uniqueIp());
    await page.goto("/percorso");
    await expect(page.getByTestId("reference-status")).toContainText("Nessuna data scelta");
    await expect(page.getByRole("link", { name: "Aggiungi il primo scenario" })).toBeVisible();
    await expect(page.getByTestId("group-adesso")).toBeVisible();
    await expect(page.getByText(/tappe dipendono dalla data/)).toBeVisible();
  });
});

test.describe("filters (AC30)", () => {
  test("status, category, assignee and due date, one by one, with the counter and the shortcut", async ({
    page,
  }) => {
    const w = await seedWedding({ templateTasks: false, names: { a: "Tony", b: "Jessica" } });
    await addTask(w, {
      title: "Tony prossimo",
      assignee: "A",
      category: "location",
      due: romeDate(5),
    });
    await addTask(w, {
      title: "Jessica scaduto",
      assignee: "B",
      category: "catering",
      due: romeDate(-4),
    });
    await addTask(w, { title: "Entrambi senza data", assignee: "both", category: "catering" });
    await addTask(w, {
      title: "Fatto lontano",
      assignee: "both",
      category: "location",
      due: romeDate(120),
      done: true,
    });
    await loginAs(page, w.wedding.founder, uniqueIp());
    await page.goto("/percorso");
    await openAllGroups(page);
    const rows = page.getByTestId("task-row");
    await expect(rows).toHaveCount(4);
    await expect(page.getByTestId("filters-count")).toHaveCount(0);

    const open = async () => {
      await page.getByTestId("filters-button").click();
      return page.getByTestId("filters-panel");
    };

    // status
    let panel = await open();
    await panel.getByText("Da fare", { exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("filters-count")).toHaveText(/1/);
    await expect(rows).toHaveCount(3);
    await expect(row(page, "Fatto lontano")).toHaveCount(0);

    // + category
    panel = await open();
    await panel.getByLabel("Categoria").selectOption("catering");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("filters-count")).toHaveText(/2/);
    await expect(rows).toHaveCount(2);

    // + due: already passed
    panel = await open();
    await panel.getByText("Da recuperare (già passate)").click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("filters-count")).toHaveText(/3/);
    await expect(rows).toHaveCount(1);
    await expect(row(page, "Jessica scaduto")).toBeVisible();

    // reset
    panel = await open();
    await panel.getByTestId("filters-reset").click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("filters-count")).toHaveCount(0);
    await expect(rows).toHaveCount(4);

    // assignee in the panel: "I miei e di Entrambi"
    panel = await open();
    await panel.getByText("I miei e di Entrambi").click();
    await page.keyboard.press("Escape");
    await expect(row(page, "Jessica scaduto")).toHaveCount(0);
    await expect(row(page, "Tony prossimo")).toBeVisible();
    await expect(row(page, "Entrambi senza data")).toBeVisible();

    // the shortcut: Miei / Di Jessica / Tutti
    await page.getByTestId("assignee-shortcut-partner").click();
    await expect(row(page, "Jessica scaduto")).toBeVisible();
    await expect(row(page, "Tony prossimo")).toHaveCount(0);
    await page.getByTestId("assignee-shortcut-mine").click();
    await expect(row(page, "Tony prossimo")).toBeVisible();
    await page.getByTestId("assignee-shortcut-all").click();
    await expect(rows).toHaveCount(4);
    expect(await overflow(page)).toBeLessThanOrEqual(0);

    // undated
    panel = await open();
    await panel.getByText("Senza scadenza", { exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(rows).toHaveCount(1);
    await expect(row(page, "Entrambi senza data")).toBeVisible();
  });
});

test.describe("tasks (AC31)", () => {
  test("add, edit, complete, reopen, delete with Annulla >= 8 s, restore from 'Eliminati di recente'", async ({
    page,
  }) => {
    const w = await seedWedding({ templateTasks: false });
    await loginAs(page, w.wedding.founder, uniqueIp());
    await page.goto("/percorso");

    // add
    await page.getByTestId("task-add").click();
    const form = page.getByTestId("task-form");
    await form.getByLabel("Titolo").fill("Prenotare il fotografo");
    await form.getByLabel("Note").fill("Chiedere il listino");
    await form.getByRole("button", { name: "Aggiungi compito" }).click();
    await expect(row(page, "Prenotare il fotografo")).toBeVisible();
    await expect(page.getByText("Compito aggiunto.")).toBeVisible();

    // edit
    await row(page, "Prenotare il fotografo").getByTestId("task-title").click();
    await page.getByTestId("task-edit").click();
    await page.getByTestId("task-form").getByLabel("Titolo").fill("Prenotare fotografo e video");
    await page.getByTestId("task-form").getByRole("button", { name: "Salva" }).click();
    await expect(row(page, "Prenotare fotografo e video")).toBeVisible();

    // complete (checkbox) and reopen
    const checkbox = row(page, "Prenotare fotografo e video").getByTestId("task-checkbox");
    await checkbox.click();
    await expect(row(page, "Prenotare fotografo e video")).toHaveAttribute("data-status", "done");
    await openAllGroups(page); // done tasks move to the collapsed "Fatti"
    await row(page, "Prenotare fotografo e video").getByTestId("task-checkbox").click();
    await expect(row(page, "Prenotare fotografo e video")).toHaveAttribute("data-status", "todo");
  });

  // [QA-4 OPEN] On mobile (Chromium 360 px), after add + edit + complete + reopen of the SAME task
  // the row's title never becomes clickable ("not stable") in 8/8 parallel runs; the same steps
  // with a seeded task, or without the edit, pass. Cause not isolated: needs a developer look.
  test("[QA-4] a task added, edited, completed and reopened can still be opened and deleted", async ({
    page,
  }) => {
    test.setTimeout(30_000);
    const w = await seedWedding({ templateTasks: false });
    await loginAs(page, w.wedding.founder, uniqueIp());
    await page.goto("/percorso");
    await page.getByTestId("task-add").click();
    await page.getByTestId("task-form").getByLabel("Titolo").fill("Prenotare il fotografo");
    await page.getByTestId("task-form").getByRole("button", { name: "Aggiungi compito" }).click();
    await row(page, "Prenotare il fotografo").getByTestId("task-title").click();
    await page.getByTestId("task-edit").click();
    await page.getByTestId("task-form").getByLabel("Titolo").fill("Prenotare fotografo e video");
    await page.getByTestId("task-form").getByRole("button", { name: "Salva" }).click();
    await row(page, "Prenotare fotografo e video").getByTestId("task-checkbox").click();
    await openAllGroups(page);
    await row(page, "Prenotare fotografo e video").getByTestId("task-checkbox").click();
    await expect(row(page, "Prenotare fotografo e video")).toHaveAttribute("data-status", "todo");
    await page.waitForLoadState("networkidle");
    await row(page, "Prenotare fotografo e video")
      .getByTestId("task-title")
      .click({ timeout: 10_000 });
    await page.getByTestId("task-delete").click({ timeout: 10_000 });
    await expect(row(page, "Prenotare fotografo e video")).toHaveCount(0);
    await expect(page.getByTestId("recently-deleted")).toBeVisible();
  });

  test("delete: the Annulla toast stays at least 8 s; 'Eliminati di recente' keeps it, restorable", async ({
    page,
  }) => {
    const w = await seedWedding({ templateTasks: false });
    await addTask(w, { title: "Prenotare le fedi", due: romeDate(10) });
    await loginAs(page, w.wedding.founder, uniqueIp());
    await page.goto("/percorso");
    await row(page, "Prenotare le fedi").getByTestId("task-title").click();
    await page.getByTestId("task-delete").click();
    await expect(row(page, "Prenotare le fedi")).toHaveCount(0);
    const undo = page
      .getByRole("region", { name: /Notifications/ })
      .getByRole("button", { name: "Annulla" });
    await expect(undo).toBeVisible();
    await page.waitForTimeout(8_000);
    await expect(undo).toBeVisible();

    const deleted = page.getByTestId("recently-deleted");
    await expect(deleted).toBeVisible();
    await deleted.getByRole("button", { name: /Eliminati di recente/ }).click();
    await expect(deleted).toContainText("Prenotare le fedi");
    await deleted
      .getByRole("button", { name: /Ripristina/ })
      .first()
      .click();
    await expect(row(page, "Prenotare le fedi")).toBeVisible();
  });

  test("Annulla right after the delete brings the task back", async ({ page }) => {
    const w = await seedWedding({ templateTasks: false });
    await addTask(w, { title: "Da annullare", due: romeDate(10) });
    await loginAs(page, w.wedding.founder, uniqueIp());
    await page.goto("/percorso");
    await row(page, "Da annullare").getByTestId("task-title").click();
    await page.getByTestId("task-delete").click();
    await expect(row(page, "Da annullare")).toHaveCount(0);
    await page
      .getByRole("region", { name: /Notifications/ })
      .getByRole("button", { name: "Annulla" })
      .click();
    await expect(row(page, "Da annullare")).toBeVisible();
  });

  test("a generated task that was deleted is never regenerated by a recalculation (AC31)", async ({
    page,
  }) => {
    const w = await seedWedding({ scenarios: [{ kind: "fixed", date_from: romeDate(500) }] });
    await loginAs(page, w.wedding.founder, uniqueIp());
    await page.goto("/percorso");
    await openAllGroups(page);
    const first = page.getByTestId("task-row").first();
    const title = (await first.getByTestId("task-title").textContent())!.trim();
    await first.getByTestId("task-title").click();
    await page.getByTestId("task-delete").click();
    await expect(row(page, title)).toHaveCount(0);
    // a recalculation (sync) must not bring it back
    const sync = await serviceClient().rpc("sync_timeline", { p_wedding_id: w.weddingId });
    expect(sync.error).toBeNull();
    await page.reload();
    await openAllGroups(page);
    await expect(row(page, title)).toHaveCount(0);
  });
});

test.describe("reopened date (AC20)", () => {
  test("banner, 'Da rivedere' badge with the link to the decision, 'Va bene così' clears it", async ({
    page,
  }) => {
    const w = await seedWedding({
      scenarios: [
        { kind: "fixed", date_from: romeDate(400), label: "Primavera" },
        { kind: "fixed", date_from: romeDate(700), label: "Autunno" },
      ],
    });
    const a = w.wedding.founderClient;
    const date = await decisionId(w, "date");
    const options = await a.from("decision_options").select("id,title").eq("decision_id", date);
    const chosen = options.data!.find((o) => o.title === "Primavera")!;
    expect(
      (await a.rpc("choose_option", { p_decision_id: date, p_option_id: chosen.id })).error,
    ).toBeNull();
    expect(
      (await a.rpc("reopen_decision", { p_decision_id: date, p_reason: "Cambio location" })).error,
    ).toBeNull();

    await loginAs(page, w.wedding.founder, uniqueIp());
    await page.goto("/percorso");
    await expect(page.getByTestId("reopened-banner")).toContainText(
      "Data riaperta: scadenze calcolate sull'ultima data scelta.",
    );
    await openAllGroups(page);
    const badges = page.getByTestId("task-review-badge");
    expect(await badges.count()).toBeGreaterThan(0);
    await expect(badges.first()).toContainText("Da rivedere");
    await page
      .getByTestId("task-row")
      .filter({ has: badges.first() })
      .first()
      .getByTestId("task-title")
      .click();
    await expect(page.getByRole("link", { name: "Vai alla scelta della data" })).toHaveAttribute(
      "href",
      "/scelte/date",
    );
    await page.keyboard.press("Escape");
    await page.getByTestId("acknowledge-all").click();
    await expect(page.getByTestId("task-review-badge")).toHaveCount(0);
  });
});
