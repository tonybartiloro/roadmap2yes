/**
 * QA T17c: the Home (plan rows "Conto alla rovescia, Prossimo passo", "Novità e benvenuto").
 *
 * AC map
 *  - AC26  countdown: provisional label "Se fosse il …", "Data da decidere" without any date, a
 *          definitive count once the date is chosen, the linked location shown (AC60)
 *          (the Europe/Rome midnight and DST edges live in home.time.spec.ts)
 *  - AC27  "Prossimo passo": one main step and at most two more, blocking decision first
 *  - AC36  upcoming payments within 14 days are highlighted
 *  - AC41  the partner's first visit shows the welcome card ("Ho capito" persists); afterwards
 *          "Novità dall'ultimo accesso" lists what the other partner did
 *  - AC42  "ultimo export" line with the reminder to export
 */
import { loginAs } from "./support/auth";
import { expect, newSession, serviceClient, test, uniqueIp } from "./support/fixtures";
import { addLocation, addTask, decisionId, romeDate, seedWedding } from "./support/seed";
import { sql } from "../tests/acceptance/support/sql";

test.describe.configure({ timeout: 60_000 });

test.describe("countdown (AC26, AC60)", () => {
  test("provisional date, the badge says so; no date at all says 'Data da decidere'", async ({
    page,
  }) => {
    const w = await seedWedding({
      scenarios: [
        { kind: "fixed", date_from: romeDate(400), label: "Primavera" },
        { kind: "fixed", date_from: romeDate(800), label: "Autunno" },
      ],
    });
    await loginAs(page, w.wedding.founder, uniqueIp());
    const countdown = page.getByRole("region", { name: "Conto alla rovescia" });
    await expect(countdown).toContainText("Se fosse il");
    await expect(countdown).toContainText(/mancano 4\d\d giorni/);
    await expect(countdown).toContainText(/provvisori/i);

    const empty = await seedWedding({ scenarios: [] });
    const other = await page
      .context()
      .browser()!
      .newContext({ baseURL: page.url(), viewport: page.viewportSize()!, locale: "it-IT" });
    const p2 = await other.newPage();
    await loginAs(p2, empty.wedding.founder, uniqueIp());
    await expect(p2.getByRole("region", { name: "Conto alla rovescia" })).toContainText(
      "Data da decidere",
    );
    await expect(p2.getByRole("link", { name: "Scegli la data" }).first()).toBeVisible();
    await other.close();
  });

  test("a chosen date is definitive and shows days AND weeks; the linked location is named", async ({
    page,
  }) => {
    const w = await seedWedding({
      scenarios: [{ kind: "fixed", date_from: romeDate(400), label: "Primavera" }],
    });
    const villa = await addLocation(w, "Villa Rosa");
    const date = await decisionId(w, "date");
    const option = (
      await w.wedding.founderClient
        .from("decision_options")
        .select("id")
        .eq("decision_id", date)
        .single()
    ).data!;
    await w.wedding.founderClient
      .from("date_scenarios")
      .update({ location_option_id: villa })
      .eq("option_id", option.id);
    await w.wedding.founderClient.rpc("choose_option", {
      p_decision_id: date,
      p_option_id: option.id,
    });
    await loginAs(page, w.wedding.founder, uniqueIp());
    const countdown = page.getByRole("region", { name: "Conto alla rovescia" });
    await expect(countdown).toContainText(/Mancano 400 giorni \(57 settimane\)/);
    await expect(countdown).toContainText(/definitiv/i);
    await expect(countdown).toContainText("Villa Rosa");
  });
});

test.describe("next step (AC27)", () => {
  test("one main step and at most two secondary ones; the open date decision comes first", async ({
    page,
  }) => {
    const w = await seedWedding({
      scenarios: [
        { kind: "fixed", date_from: romeDate(400), label: "Primavera" },
        { kind: "fixed", date_from: romeDate(800), label: "Autunno" },
      ],
      templateTasks: false,
    });
    await addTask(w, { title: "Scaduto uno", due: romeDate(-5) });
    await addTask(w, { title: "Scaduto due", due: romeDate(-6) });
    await addTask(w, { title: "Scaduto tre", due: romeDate(-7) });
    await loginAs(page, w.wedding.founder, uniqueIp());
    const card = page.getByRole("region", { name: "Prossimo passo" });
    await expect(card.getByRole("heading", { level: 3 })).toHaveCount(1);
    await expect(card.getByRole("heading", { level: 3 })).toContainText(/data/i);
    expect(await card.getByRole("listitem").count()).toBeLessThanOrEqual(2);
  });

  test("payments due within 14 days are in evidence", async ({ page }) => {
    const w = await seedWedding({ budgetCents: 2_000_000 });
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
          description: "Menu",
          status: "agreed",
          agreed_cents: 900_000,
          planned_cents: 900_000,
        })
        .select("id")
        .single()
    ).data!.id;
    await w.wedding.founderClient.from("payments").insert([
      {
        wedding_id: w.weddingId,
        item_id: item,
        kind: "deposit",
        amount_cents: 300_000,
        due_date: romeDate(5),
      },
      {
        wedding_id: w.weddingId,
        item_id: item,
        kind: "balance",
        amount_cents: 600_000,
        due_date: romeDate(60),
      },
    ]);
    await loginAs(page, w.wedding.founder, uniqueIp());
    const payments = page.getByRole("region", { name: /Pagamenti in evidenza/ });
    await expect(payments).toContainText("Pagamenti in evidenza (1)");
    await expect(payments).toContainText("Menu");
    await expect(payments).toContainText(/3\.000/);
  });
});

test.describe("welcome and news (AC41)", () => {
  test("the partner's first visit shows the welcome card; 'Ho capito' persists", async ({
    page,
  }) => {
    const w = await seedWedding();
    await loginAs(page, w.partnerB!.user, uniqueIp());
    const welcome = page.getByRole("heading", { name: /ti stavamo aspettando/ });
    await expect(welcome).toBeVisible();
    await page.getByRole("button", { name: "Ho capito" }).click();
    await expect(welcome).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { name: /ti stavamo aspettando/ })).toHaveCount(0);
    // A never sees it
  });

  test("afterwards 'Novità dall'ultimo accesso' lists what the other partner did", async ({
    page,
    browser,
  }, testInfo) => {
    const w = await seedWedding({ names: { a: "Tony", b: "Jessica" } });
    await addLocation(w, "Villa Rosa");
    await loginAs(page, w.partnerB!.user, uniqueIp()); // first visit: welcome, "seen" is recorded
    await page.getByRole("button", { name: "Ho capito" }).click();
    // the last visit was long ago (the gap is real database time: move the timestamps)
    sql(
      `update user_wedding_state set last_seen_at = last_seen_at - interval '3 hours', previous_seen_at = coalesce(previous_seen_at, now() - interval '3 hours') - interval '3 hours' where user_id = '${w.partnerB!.user.id}'`,
    );
    // A chooses the location in the meantime
    const location = await decisionId(w, "location");
    const option = (
      await w.wedding.founderClient
        .from("decision_options")
        .select("id")
        .eq("decision_id", location)
        .single()
    ).data!;
    const chosen = await w.wedding.founderClient.rpc("choose_option", {
      p_decision_id: location,
      p_option_id: option.id,
    });
    expect(chosen.error).toBeNull();
    // and B opens the home again
    const b = await newSession(browser, testInfo);
    await loginAs(b.page, w.partnerB!.user, uniqueIp());
    const news = b.page.getByRole("region", { name: /Novità dall'ultimo accesso/ });
    await expect(news).toBeVisible();
    await expect(news).toContainText(/Tony/);
    await expect(news).toContainText(/location/i);
    await b.context.close();
  });
});

test.describe("last export (AC42)", () => {
  test("a person who never exported is invited to; after an export the line says so", async ({
    page,
  }) => {
    const w = await seedWedding();
    await loginAs(page, w.wedding.founder, uniqueIp());
    await expect(page.getByText("Non hai ancora esportato i dati")).toBeVisible();
    await expect(page.getByRole("link", { name: "Esporta i dati" })).toBeVisible();
    const recorded = await w.wedding.founderClient.rpc("record_export");
    expect(recorded.error).toBeNull();
    await page.reload();
    await expect(page.getByText("ultimo export: oggi")).toBeVisible();
    await expect(page.getByRole("link", { name: "Esporta i dati" })).toHaveCount(0);
  });
});
