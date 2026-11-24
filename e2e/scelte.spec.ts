/**
 * QA T17b: Scelte (decisions), plan rows "Confronto", "Scelta e riapertura", "Reazioni", "Data
 * collegata a una location", "Periodo scelto come data", "Riferimento".
 *
 * AC map
 *  - AC17  options as stacked cards with identical rows, pros/cons with icon + text, "Confronta 2"
 *          (table, fixed label column and horizontal scroll at 360 px, side by side from 768 px)
 *  - AC18  choosing an option: consequence sheet -> decision "Presa", the chosen one highlighted,
 *          author + date recorded, the others in a collapsible "scartate" section
 *  - AC19  reopening needs a reason (inline error), then "Aperta" again; the previous choice stays
 *          in the history with reason and author; the discarded options are candidates again
 *  - AC21  append-only history with "Aggiungi nota"
 *  - AC22  a non-binding reaction is visible to the partner and changes no state
 *  - AC24  manual reference ("Imposta come riferimento" / "Torna automatico")
 *  - AC60  a date linked to a location shows it; choosing the date does not choose the location
 *  - AC64  choosing a period asks for the exact day; the scenario becomes a fixed date
 */
import type { Page } from "@playwright/test";
import { loginAs } from "./support/auth";
import { expect, newSession, serviceClient, test, uniqueIp } from "./support/fixtures";
import { addLocation, decisionId, romeDate, seedWedding } from "./support/seed";

test.describe.configure({ timeout: 60_000 });

const optionCard = (page: Page, title: string) =>
  page.locator("[data-testid^='option-']").filter({ hasText: title }).first();

/** Date options are scenario cards (DateScenarioList), not generic option cards. */
const dateCard = (page: Page, label: string) =>
  page.locator("[data-slot=date-scenario-list] > li").filter({ hasText: label }).first();

async function addLocationOption(
  page: Page,
  name: string,
  comune: string,
  extra: { pro?: string; con?: string; cost?: string } = {},
) {
  await page.getByRole("button", { name: "Aggiungi un'opzione" }).first().click();
  await page.getByLabel("Nome", { exact: true }).fill(name);
  await page.getByLabel("Comune").fill(comune);
  if (extra.cost) await page.getByLabel("Costo indicativo (facoltativo)").fill(extra.cost);
  if (extra.pro) await page.getByLabel("Pro").fill(extra.pro);
  if (extra.con) await page.getByLabel("Contro").fill(extra.con);
  await page.getByRole("button", { name: "Aggiungi", exact: true }).click();
  await expect(optionCard(page, name)).toBeVisible();
}

test.describe("options and comparison (AC17)", () => {
  test("add two locations, identical rows, pros/cons with icon + text, Confronta 2 fits the viewport", async ({
    page,
  }, testInfo) => {
    const w = await seedWedding({ scenarios: [{ kind: "fixed", date_from: romeDate(400) }] });
    await loginAs(page, w.wedding.founder, uniqueIp());
    await page.goto("/scelte/location");
    await addLocationOption(page, "Villa Rosa", "Siena", {
      pro: "Giardino ampio\nParcheggio",
      con: "Lontana",
      cost: "4.500",
    });
    await addLocationOption(page, "Castello Alto", "Arezzo", { pro: "Vista", cost: "6000" });

    const rosa = optionCard(page, "Villa Rosa");
    const castello = optionCard(page, "Castello Alto");
    // identical rows on every card
    for (const card of [rosa, castello]) {
      for (const label of ["Comune", "Costo indicativo", "Link", "Pro", "Contro", "Note"]) {
        await expect(card.getByText(label, { exact: true }).first()).toBeVisible();
      }
    }
    await expect(rosa).toContainText(/€\s?4\.500/);
    // pros and cons carry an icon AND the text (not colour alone)
    const pro = rosa.locator("li").filter({ hasText: "Giardino ampio" }).first();
    await expect(pro.locator("svg").first()).toBeAttached();
    const con = rosa.locator("li").filter({ hasText: "Lontana" }).first();
    await expect(con.locator("svg").first()).toBeAttached();

    // Confronta 2
    await page.getByRole("checkbox", { name: "Confronta «Villa Rosa»" }).click();
    await page.getByRole("checkbox", { name: "Confronta «Castello Alto»" }).click();
    await page.getByRole("button", { name: "Confronta 2" }).click();
    const compare = page.getByTestId("compare");
    await expect(compare).toBeVisible();
    await expect(compare.locator("th[scope=col]").filter({ hasText: "Villa Rosa" })).toBeVisible();
    await expect(
      compare.locator("th[scope=col]").filter({ hasText: "Castello Alto" }),
    ).toBeVisible();
    const region = compare.locator("[role=region]");
    const { scroll, client } = await region.evaluate((el) => ({
      scroll: el.scrollWidth,
      client: el.clientWidth,
    }));
    const rowHeader = compare.locator("th[scope=row]").first();
    if (testInfo.project.name === "mobile") {
      // 360 px: the table scrolls sideways and the label column stays put (sticky)
      expect(scroll).toBeGreaterThan(client);
      expect(await rowHeader.evaluate((el) => getComputedStyle(el).position)).toBe("sticky");
    } else {
      // from 768 px: two columns side by side, no sideways scroll
      expect(scroll).toBeLessThanOrEqual(client + 1);
    }
    // [QA-5 DEFECT] at 360 px with the table open the PAGE scrolls sideways (scrollWidth 389 > 360)
    // although the table already scrolls inside its own region.
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: "Chiudi il confronto" }).click();
    await expect(compare).toHaveCount(0);
  });
});

test.describe("choose and reopen (AC18, AC19, AC21)", () => {
  test("choose, discarded section, reopen with a mandatory reason, history", async ({ page }) => {
    const w = await seedWedding({ scenarios: [{ kind: "fixed", date_from: romeDate(400) }] });
    await addLocation(w, "Villa Rosa", { comune: "Siena" });
    await addLocation(w, "Castello Alto", { comune: "Arezzo" });
    await loginAs(page, w.wedding.founder, uniqueIp());
    await page.goto("/scelte/location");
    await expect(page.getByTestId("decision-status")).toHaveText("Aperta");

    await optionCard(page, "Villa Rosa")
      .getByRole("button", { name: "Scegli", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText(
      "Le altre opzioni restano visibili tra le scartate",
    );
    await page.getByRole("button", { name: "Conferma la scelta" }).click();
    await expect(page.getByTestId("decision-status")).toHaveText("Presa");
    await expect(page.getByTestId("taken-card")).toContainText("Villa Rosa");
    await expect(optionCard(page, "Villa Rosa")).toContainText("Scelta");
    const discarded = page.getByTestId("discarded");
    await expect(discarded).toContainText("Opzioni scartate (1)");
    await discarded.locator("summary").click();
    await expect(discarded).toContainText("Castello Alto");
    // history: who and when
    await expect(page.getByTestId("history")).toContainText("Tony");

    // reopen: the reason is mandatory (inline error)
    await page.getByRole("button", { name: "Riapri la scelta" }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Riapri la scelta" }).click();
    await expect(page.getByRole("dialog")).toContainText(/motivo|Scrivi/i);
    await expect(page.getByTestId("decision-status")).toHaveText("Presa");
    await page.getByLabel("Perché vuoi riaprire questa scelta?").fill("Il castello costa meno");
    await page.getByRole("dialog").getByRole("button", { name: "Riapri la scelta" }).click();
    // reopened: no longer "Presa" (the list badge reads "Da rivedere", the DB state is open)
    await expect(page.getByTestId("decision-status")).not.toHaveText("Presa");
    const reopened = await serviceClient()
      .from("decisions")
      .select("status")
      .eq("wedding_id", w.weddingId)
      .eq("type", "location")
      .single();
    expect(reopened.data?.status).toBe("open");
    // the discarded one is a candidate again, the old choice is in the history with the reason
    await expect(
      optionCard(page, "Castello Alto").getByRole("button", { name: "Scegli", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("history")).toContainText("Il castello costa meno");

    // append-only note
    await page
      .getByTestId("history")
      .getByLabel("Aggiungi nota")
      .fill("Chiamare Villa Rosa lunedì");
    await page.getByTestId("history").getByRole("button", { name: "Aggiungi nota" }).click();
    await expect(page.getByTestId("history")).toContainText("Chiamare Villa Rosa lunedì");
    // nothing in the history can be edited or removed
    await expect(
      page.getByTestId("history").getByRole("button", { name: /modifica|elimina|cancella/i }),
    ).toHaveCount(0);
  });
});

test.describe("reactions (AC22)", () => {
  test("a reaction is visible to the partner and changes no state", async ({
    page,
    browser,
  }, testInfo) => {
    const w = await seedWedding();
    await addLocation(w, "Villa Rosa");
    await loginAs(page, w.wedding.founder, uniqueIp());
    await page.goto("/scelte/location");
    await optionCard(page, "Villa Rosa").getByRole("button", { name: "Preferisco" }).click();
    await expect(
      optionCard(page, "Villa Rosa").getByRole("button", { name: "Preferisco" }),
    ).toHaveAttribute("aria-pressed", "true");

    const b = await newSession(browser, testInfo);
    await loginAs(b.page, w.partnerB!.user, uniqueIp());
    await b.page.goto("/scelte/location");
    await expect(optionCard(b.page, "Villa Rosa")).toContainText("Tony: preferisce");
    await expect(b.page.getByTestId("decision-status")).toHaveText("Aperta");
    await b.context.close();
  });
});

test.describe("dates: reference, location link, period (AC24, AC60, AC64)", () => {
  test("a linked location is shown on the card; choosing the date does not choose the location; discarded -> (scartata)", async ({
    page,
  }) => {
    const w = await seedWedding({
      scenarios: [
        { kind: "fixed", date_from: romeDate(400), label: "Primavera" },
        { kind: "fixed", date_from: romeDate(800), label: "Autunno" },
      ],
    });
    const rosa = await addLocation(w, "Villa Rosa");
    const castello = await addLocation(w, "Castello Alto");
    const date = await decisionId(w, "date");
    const options = await serviceClient()
      .from("decision_options")
      .select("id,title")
      .eq("decision_id", date);
    const primavera = options.data!.find((o) => o.title === "Primavera")!;
    const link = await serviceClient()
      .from("date_scenarios")
      .update({ location_option_id: rosa })
      .eq("option_id", primavera.id);
    expect(link.error).toBeNull();
    await loginAs(page, w.wedding.founder, uniqueIp());
    await page.goto("/scelte/date");
    await expect(dateCard(page, "Primavera")).toContainText("Villa Rosa");
    await expect(dateCard(page, "Autunno")).not.toContainText("Villa Rosa");

    // choosing the linked date does not choose the location (AC60)
    await dateCard(page, "Primavera").getByRole("button", { name: "Scegli questa data" }).click();
    await page.getByRole("button", { name: "Conferma la scelta" }).click();
    await expect(page.getByTestId("decision-status")).toHaveText("Presa");
    const loc = await serviceClient()
      .from("decisions")
      .select("status")
      .eq("wedding_id", w.weddingId)
      .eq("type", "location")
      .single();
    expect(loc.data?.status).toBe("open");

    // the link survives the reference becoming definitive and shows next to the badge
    await expect(dateCard(page, "Primavera")).toContainText("Villa Rosa");

    // the linked location is discarded (another one is chosen): it is shown as such
    const decision = await w.wedding.founderClient.rpc("choose_option", {
      p_decision_id: await decisionId(w, "location"),
      p_option_id: castello,
    });
    expect(decision.error).toBeNull();
    // the Percorso header shows it as "(scartata)" (plan: location scartata)
    await page.goto("/percorso");
    await expect(page.getByTestId("reference-status")).toContainText("Villa Rosa (scartata)");
  });

  test("a period asks for the exact day; the scenario becomes a fixed date and the history keeps the period (AC64)", async ({
    page,
  }) => {
    const from = romeDate(900).slice(0, 8) + "01";
    const to = romeDate(960);
    const w = await seedWedding({
      scenarios: [{ kind: "period", date_from: from, date_to: to, label: "Periodo" }],
    });
    await loginAs(page, w.wedding.founder, uniqueIp());
    await page.goto("/scelte/date");
    await dateCard(page, "Periodo").getByRole("button", { name: "Scegli questa data" }).click();
    const dialog = page.getByRole("dialog");
    const day = dialog.locator("input[type=date]");
    await expect(day).toBeVisible();
    // the day must lie inside the period: the field is bounded
    await expect(day).toHaveAttribute("min", from);
    await expect(day).toHaveAttribute("max", to);
    // outside the period: refused
    await day.fill(romeDate(5));
    await dialog.getByRole("button", { name: "Conferma la scelta" }).click();
    await expect(page.getByTestId("decision-status")).toHaveText("Aperta");
    // inside: accepted
    const exact = romeDate(920);
    await day.fill(exact);
    await dialog.getByRole("button", { name: "Conferma la scelta" }).click();
    await expect(page.getByTestId("decision-status")).toHaveText("Presa");

    const scenario = await serviceClient()
      .from("date_scenarios")
      .select("kind,date_from,date_to")
      .eq("wedding_id", w.weddingId)
      .single();
    expect(scenario.data).toMatchObject({ kind: "fixed", date_from: exact, date_to: null });
    const events = await serviceClient()
      .from("decision_events")
      .select("kind,payload")
      .eq("wedding_id", w.weddingId)
      .eq("kind", "chosen");
    expect(JSON.stringify(events.data)).toContain(from);
  });

  test("set a manual reference, then go back to automatic (AC24)", async ({ page }) => {
    const near = romeDate(400);
    const w = await seedWedding({
      scenarios: [
        { kind: "fixed", date_from: near, label: "Primavera" },
        { kind: "fixed", date_from: romeDate(800), label: "Autunno" },
      ],
    });
    await loginAs(page, w.wedding.founder, uniqueIp());
    await page.goto("/scelte/date");
    await dateCard(page, "Autunno")
      .getByRole("button", { name: "Imposta come riferimento" })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Imposta come riferimento" })
      .click();
    await expect(page.getByText(/Il riferimento ora è il/)).toBeVisible();
    await expect(
      dateCard(page, "Autunno").getByRole("button", { name: "Torna automatico (il più vicino)" }),
    ).toBeVisible();
    await dateCard(page, "Autunno")
      .getByRole("button", { name: "Torna automatico (il più vicino)" })
      .click();
    await expect(page.getByText(/Il riferimento ora è il .* \(il più vicino\)/)).toBeVisible();
    await expect(
      dateCard(page, "Autunno").getByRole("button", { name: "Torna automatico (il più vicino)" }),
    ).toHaveCount(0);
    const row = await serviceClient()
      .from("weddings")
      .select("applied_reference_date")
      .eq("id", w.weddingId)
      .single();
    expect(row.data?.applied_reference_date).toBe(near);
  });
});
